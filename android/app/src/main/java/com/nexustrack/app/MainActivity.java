package com.nexustrack.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.RingtoneManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import android.webkit.ConsoleMessage;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
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
    private static final int MEDIA_PERMISSION_REQ_CODE = 4002;
    private PermissionRequest pendingMediaRequest = null;

    // Local in-memory offline fallback
    private static final String LOCAL_ORIGIN = "https://localhost";
    private static final String LOCAL_INDEX = LOCAL_ORIGIN + "/index.html";

    // Default live cloud URL deployed on Vercel
    private static final String DEFAULT_CLOUD_URL = "https://nexus-tracker-inky.vercel.app";

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
        public void ensureMediaPermissions() {
            runOnUiThread(() -> {
                List<String> needed = new ArrayList<>();
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    needed.add(Manifest.permission.RECORD_AUDIO);
                }
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    needed.add(Manifest.permission.CAMERA);
                }
                if (!needed.isEmpty()) {
                    ActivityCompat.requestPermissions(MainActivity.this, needed.toArray(new String[0]), MEDIA_PERMISSION_REQ_CODE);
                }
            });
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

        @JavascriptInterface
        public void triggerNativeSosAlert(String senderName, String placeName) {
            new Handler(Looper.getMainLooper()).post(() -> {
                try {
                    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                    if (pm != null) {
                        PowerManager.WakeLock screenLock = pm.newWakeLock(
                                PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                                "NexusTracker:EmergencySosWake"
                        );
                        screenLock.acquire(15000L);
                    }

                    Uri alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                    if (alarmSound == null) {
                        alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                    }

                    Intent intent = new Intent(MainActivity.this, MainActivity.class);
                    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    PendingIntent pendingIntent = PendingIntent.getActivity(
                            MainActivity.this, 0, intent,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    );

                    Notification notification = new NotificationCompat.Builder(MainActivity.this, "nexus_emergency_channel")
                            .setContentTitle("🚨 EMERGENCY SOS: " + (senderName != null ? senderName : "Family Member") + " Needs Help!")
                            .setContentText(placeName != null && !placeName.isEmpty() ? "Near " + placeName : "Broadcasting live emergency location! Tap to view.")
                            .setSmallIcon(android.R.drawable.stat_sys_warning)
                            .setPriority(NotificationCompat.PRIORITY_MAX)
                            .setCategory(NotificationCompat.CATEGORY_ALARM)
                            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                            .setSound(alarmSound)
                            .setVibrate(new long[]{0, 800, 300, 800, 300, 1200})
                            .setContentIntent(pendingIntent)
                            .setAutoCancel(false)
                            .setOngoing(true)
                            .build();

                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) {
                        nm.notify(9999, notification);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error in triggerNativeSosAlert: " + e.getMessage());
                }
            });
        }

        @JavascriptInterface
        public void clearNativeSosAlert() {
            new Handler(Looper.getMainLooper()).post(() -> {
                try {
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) {
                        nm.cancel(9999);
                    }
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public void showNativeNotification(String title, String body) {
            new Handler(Looper.getMainLooper()).post(() -> {
                try {
                    Intent intent = new Intent(MainActivity.this, MainActivity.class);
                    intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    PendingIntent pendingIntent = PendingIntent.getActivity(
                            MainActivity.this, 0, intent,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    );

                    Notification notification = new NotificationCompat.Builder(MainActivity.this, "nexus_tracker_channel")
                            .setContentTitle(title)
                            .setContentText(body)
                            .setSmallIcon(android.R.drawable.ic_dialog_info)
                            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                            .setContentIntent(pendingIntent)
                            .setAutoCancel(true)
                            .build();

                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) {
                        nm.notify((int) System.currentTimeMillis(), notification);
                    }
                } catch (Exception ignored) {}
            });
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
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    try {
                        List<String> neededPermissions = new ArrayList<>();
                        for (String res : request.getResources()) {
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) {
                                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                                    neededPermissions.add(Manifest.permission.RECORD_AUDIO);
                                }
                            }
                            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) {
                                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                                    neededPermissions.add(Manifest.permission.CAMERA);
                                }
                            }
                        }

                        if (neededPermissions.isEmpty()) {
                            request.grant(request.getResources());
                        } else {
                            pendingMediaRequest = request;
                            ActivityCompat.requestPermissions(MainActivity.this, neededPermissions.toArray(new String[0]), MEDIA_PERMISSION_REQ_CODE);
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "PermissionRequest grant error: " + e.getMessage());
                    }
                });
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

        // Ensure Android notification channels are created immediately
        createNotificationChannels();

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
        String cloudUrl = prefs.getString(PREF_KEY_CLOUD_URL, DEFAULT_CLOUD_URL).trim();
        if (cloudUrl.isEmpty()) {
            cloudUrl = DEFAULT_CLOUD_URL;
        }
        if (isNetworkAvailable()) {
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

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    "nexus_tracker_channel",
                    "Nexus Family Tracker",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Family location sharing and check-in updates");
            channel.setShowBadge(true);

            NotificationChannel emergencyChannel = new NotificationChannel(
                    "nexus_emergency_channel",
                    "Nexus Emergency SOS Alerts",
                    NotificationManager.IMPORTANCE_HIGH
            );
            emergencyChannel.setDescription("High urgency SOS emergency family alerts");
            emergencyChannel.enableVibration(true);
            emergencyChannel.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 500, 200, 800});
            emergencyChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
                manager.createNotificationChannel(emergencyChannel);
            }
        }
    }

    private void requestRequiredPermissions() {
        List<String> permissions = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.RECORD_AUDIO);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.CAMERA);
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
        if (requestCode == MEDIA_PERMISSION_REQ_CODE) {
            if (pendingMediaRequest != null) {
                try {
                    List<String> grantedResources = new ArrayList<>();
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        for (String res : pendingMediaRequest.getResources()) {
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) {
                                grantedResources.add(res);
                            }
                        }
                    }
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        for (String res : pendingMediaRequest.getResources()) {
                            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) {
                                grantedResources.add(res);
                            }
                        }
                    }
                    if (!grantedResources.isEmpty()) {
                        pendingMediaRequest.grant(grantedResources.toArray(new String[0]));
                    } else {
                        pendingMediaRequest.deny();
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Pending media request error: " + e.getMessage());
                }
                pendingMediaRequest = null;
            }
            return;
        }

        if (requestCode == PERMISSION_REQ_CODE) {
            startNativeLocationService();
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
