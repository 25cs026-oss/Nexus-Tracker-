package com.nexustrack.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "NexusMainActivity";
    private static final int PERMISSION_REQ_CODE = 4001;

    // Local in-memory offline fallback
    private static final String LOCAL_ORIGIN = "https://localhost";
    private static final String LOCAL_INDEX = LOCAL_ORIGIN + "/index.html";

    // Remote URL config on GitHub for instant OTA updates without rebuilding APK
    private static final String REMOTE_CONFIG_URL = "https://raw.githubusercontent.com/25cs026-oss/Nexus-Tracker-/main/app-url.txt";
    private static final String PREF_KEY_CLOUD_URL = "active_cloud_url";

    private WebView webView;
    private SharedPreferences prefs;
    private boolean hasFallenBackToLocal = false;

    public class NexusNativeBridge {
        @JavascriptInterface
        public String getNativeLocation() {
            try {
                SharedPreferences locPrefs = getSharedPreferences("nexus_native_loc", Context.MODE_PRIVATE);
                String lat = locPrefs.getString("lat", "0");
                String lng = locPrefs.getString("lng", "0");
                long time = locPrefs.getLong("time", 0);
                return "{\"lat\":" + lat + ",\"lng\":" + lng + ",\"time\":" + time + "}";
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public boolean isNative() {
            return true;
        }

        @JavascriptInterface
        public void setCloudUrl(String newUrl) {
            if (newUrl != null && !newUrl.trim().isEmpty()) {
                prefs.edit().putString(PREF_KEY_CLOUD_URL, newUrl.trim()).apply();
                new Handler(Looper.getMainLooper()).post(() -> {
                    if (webView != null) webView.loadUrl(newUrl.trim());
                });
            }
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences("nexus_app_config", Context.MODE_PRIVATE);
        webView = findViewById(R.id.web);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.addJavascriptInterface(new NexusNativeBridge(), "NexusNative");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.d("NexusWeb", "[" + cm.messageLevel() + "] " + cm.message() + " -- line "
                        + cm.lineNumber() + " of " + cm.sourceId());
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Nullable
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                if (host != null && ("localhost".equalsIgnoreCase(host) || "appassets.androidplatform.net".equalsIgnoreCase(host))) {
                    String path = uri.getPath();
                    if (path == null || path.isEmpty() || "/".equals(path)) {
                        path = "/index.html";
                    }

                    String decodedPath = Uri.decode(path);
                    String assetRelativePath = decodedPath.startsWith("/") ? decodedPath.substring(1) : decodedPath;
                    String assetPath = "public/" + assetRelativePath;

                    try {
                        InputStream is = getAssets().open(assetPath);
                        String mimeType = getMimeType(decodedPath);
                        Map<String, String> headers = new HashMap<>();
                        headers.put("Access-Control-Allow-Origin", "*");
                        headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                        headers.put("Access-Control-Allow-Headers", "*");
                        return new WebResourceResponse(mimeType, "UTF-8", 200, "OK", headers, is);
                    } catch (IOException e) {
                        try {
                            InputStream is = getAssets().open("public/index.html");
                            Map<String, String> headers = new HashMap<>();
                            headers.put("Access-Control-Allow-Origin", "*");
                            return new WebResourceResponse("text/html", "UTF-8", 200, "OK", headers, is);
                        } catch (IOException ignored) {}
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.proceed();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                // If main page failed to load from cloud (offline / network error), fall back to offline local assets
                if (request.isForMainFrame() && !hasFallenBackToLocal) {
                    hasFallenBackToLocal = true;
                    Log.w(TAG, "Cloud URL unreachable, falling back to bundled offline assets");
                    new Handler(Looper.getMainLooper()).post(() -> webView.loadUrl(LOCAL_INDEX));
                }
            }
        });

        // Request runtime permissions for 24/7 background tracking & notifications
        requestRequiredPermissions();

        // Start native sticky Foreground Service for 24/7 background GPS tracking
        startNativeLocationService();

        // Determine whether to load live cloud URL or local offline bundle
        loadApp();

        // Check for live cloud URL updates from GitHub in the background
        fetchRemoteConfigAsync();
    }

    private void loadApp() {
        String cloudUrl = prefs.getString(PREF_KEY_CLOUD_URL, "").trim();
        if (!cloudUrl.isEmpty() && isNetworkAvailable()) {
            hasFallenBackToLocal = false;
            Log.d(TAG, "Loading live cloud URL: " + cloudUrl);
            webView.loadUrl(cloudUrl);
        } else {
            hasFallenBackToLocal = true;
            Log.d(TAG, "Loading offline bundled assets");
            webView.loadUrl(LOCAL_INDEX);
        }
    }

    private void fetchRemoteConfigAsync() {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(REMOTE_CONFIG_URL);
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                conn.setRequestMethod("GET");

                if (conn.getResponseCode() == 200) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    String line = reader.readLine();
                    reader.close();

                    if (line != null) {
                        String fetchedUrl = line.trim();
                        String currentUrl = prefs.getString(PREF_KEY_CLOUD_URL, "").trim();

                        if (fetchedUrl.startsWith("http") && !fetchedUrl.equals(currentUrl)) {
                            Log.d(TAG, "Discovered updated cloud URL from GitHub: " + fetchedUrl);
                            prefs.edit().putString(PREF_KEY_CLOUD_URL, fetchedUrl).apply();

                            new Handler(Looper.getMainLooper()).post(() -> {
                                hasFallenBackToLocal = false;
                                if (webView != null) webView.loadUrl(fetchedUrl);
                            });
                        }
                    }
                }
            } catch (Exception e) {
                Log.d(TAG, "Remote config check skipped (offline or not reachable): " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private boolean isNetworkAvailable() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                NetworkInfo netInfo = cm.getActiveNetworkInfo();
                return netInfo != null && netInfo.isConnected();
            }
        } catch (Exception ignored) {}
        return false;
    }

    private String getMimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        return "application/octet-stream";
    }

    private void requestRequiredPermissions() {
        List<String> permissions = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        if (!permissions.isEmpty()) {
            ActivityCompat.requestPermissions(this, permissions.toArray(new String[0]), PERMISSION_REQ_CODE);
        }
    }

    private void startNativeLocationService() {
        try {
            Intent serviceIntent = new Intent(this, LocationService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(this, serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to start LocationService: " + e.getMessage());
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQ_CODE) {
            startNativeLocationService();
            if (webView != null) {
                webView.reload();
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            moveTaskToBack(true);
        }
    }
}
