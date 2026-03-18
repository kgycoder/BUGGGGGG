package com.xware

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.webkit.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : AppCompatActivity() {

    lateinit var webView: WebView
    private lateinit var bridge: AndroidBridge

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Edge-to-edge display — app draws behind status/nav bars
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT

        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webView)

        setupWebView()
        loadApp()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled  = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess  = true
            allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString =
                "Mozilla/5.0 (Linux; Android 14; Pixel 8) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/124.0.0.0 Mobile Safari/537.36 XWare/1.0"
            setSupportZoom(false)
            builtInZoomControls  = false
            displayZoomControls  = false
        }

        // Dark background while loading
        webView.setBackgroundColor(Color.parseColor("#06060F"))

        bridge = AndroidBridge(this, webView)
        webView.addJavascriptInterface(bridge, "AndroidBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                val url = req.url.toString()
                // Allow file:// and YouTube iframe assets
                if (url.startsWith("file://") ||
                    url.contains("youtube.com/iframe_api") ||
                    url.contains("googlevideo.com") ||
                    url.contains("ytimg.com"))
                    return false
                // Open external URLs in the system browser
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                return true
            }

            override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                // Silently ignore sub-resource errors (fonts, etc.)
                if (req.isForMainFrame) {
                    view.loadUrl("file:///android_asset/index.html")
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                request.grant(request.resources) // grant audio/video for YT
            }
            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                // Forward console messages for debugging
                android.util.Log.d("XWare/JS",
                    "[${msg.messageLevel()}] ${msg.message()} @${msg.sourceId()}:${msg.lineNumber()}")
                return true
            }
        }
    }

    private fun loadApp() {
        webView.loadUrl("file:///android_asset/index.html")
    }

    // Called from WebView JS via AndroidBridge to handle the back button
    fun handleBack() {
        runOnUiThread {
            // Pass back event to JS first; JS will call AndroidBridge.exitApp() if needed
            webView.evaluateJavascript("window.androidBack && window.androidBack()", null)
        }
    }

    override fun onBackPressed() {
        handleBack()
    }

    /** Send a JSON string back to the WebView's __xw() receiver */
    fun sendToWebView(json: String) {
        runOnUiThread {
            val escaped = json
                .replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
            webView.evaluateJavascript("window.__xw && window.__xw('$escaped')", null)
        }
    }

    // Request SYSTEM_ALERT_WINDOW permission for lyrics overlay
    fun requestOverlayPermission() {
        if (!Settings.canDrawOverlays(this)) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")
            )
            startActivityForResult(intent, REQ_OVERLAY)
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_OVERLAY) {
            // Notify JS that permission result is back
            val granted = Settings.canDrawOverlays(this)
            runOnUiThread {
                webView.evaluateJavascript(
                    "window.onOverlayPermission && window.onOverlayPermission($granted)", null)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onDestroy() {
        bridge.destroy()
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        const val REQ_OVERLAY = 1001
    }
}
