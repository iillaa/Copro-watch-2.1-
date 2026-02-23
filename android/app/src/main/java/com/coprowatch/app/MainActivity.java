package com.coprowatch.app;

import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate() {
        super.onCreate();

        // [FIX] Enable file access for Tesseract.js offline mode
        // This allows the WebView to load local assets instead of fetching from CDN
        WebView webView = this.getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        
        settings.setAllowFileAccess(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        
        // Additional recommended settings for WebView
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        
        // Enable JavaScript
        settings.setJavaScriptEnabled(true);
        
        // Enable DOM storage for IndexedDB caching
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
    }
}
