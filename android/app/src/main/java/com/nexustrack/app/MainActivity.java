package com.nexustrack.app;

import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Find the WebView by its unique ID
        WebView webView = findViewById(R.id.web);

        // this will enable the javascript.
        webView.getSettings().setJavaScriptEnabled(true);
        
        // Enable DOM storage for Firebase and other web features
        webView.getSettings().setDomStorageEnabled(true);
        
        // Enable Geolocation
        webView.getSettings().setGeolocationEnabled(true);

        // WebViewClient allows you to handle onPageFinished and override Url loading.
        webView.setWebViewClient(new WebViewClient());
        
        // WebChromeClient handles geolocation prompts and other chrome-related events
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                // Always grant permission for simplicity in this demo
                // In a production app, you should ask the user
                callback.invoke(origin, true, false);
            }
        });

        // loading url in the WebView.
        // Using the App URL from the runtime context
        webView.loadUrl("https://ais-dev-biy4th5wuy54mrcwz5odhs-627533141015.asia-southeast1.run.app");
    }
}
