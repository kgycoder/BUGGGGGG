package com.xware

import android.content.Intent
import android.provider.Settings
import android.webkit.JavascriptInterface
import kotlinx.coroutines.*
import org.json.JSONObject

class AndroidBridge(
    private val activity: MainActivity,
    private val webView: android.webkit.WebView
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val api   = ApiService()

    init {
        activity.startService(Intent(activity, AudioPlayerService::class.java))
        setupPlayerCallbacks()
    }

    private fun setupPlayerCallbacks() {
        scope.launch {
            repeat(30) {
                if (AudioPlayerService.instance != null) return@repeat
                delay(100)
            }
            val svc = AudioPlayerService.instance ?: return@launch
            svc.onReady = {
                sendToJs(JSONObject().apply {
                    put("type", "playerState"); put("state", "ready")
                    put("duration", svc.getDuration())
                })
            }
            svc.onStateChanged = { state ->
                sendToJs(JSONObject().apply {
                    put("type", "playerState"); put("state", state)
                    put("isPlaying", svc.isPlaying())
                })
            }
            svc.onTimeUpdate = { cur, dur ->
                sendToJs(JSONObject().apply {
                    put("type", "playerTime"); put("cur", cur); put("dur", dur)
                })
            }
            svc.onError = { code ->
                sendToJs(JSONObject().apply {
                    put("type", "playerError"); put("code", code)
                })
            }
        }
    }

    @JavascriptInterface
    fun postMessage(json: String) {
        scope.launch {
            try {
                val msg  = JSONObject(json)
                val type = msg.optString("type")
                val id   = msg.optString("id", "0")
                when (type) {
                    "search"      -> handleSearch(msg.optString("query"), id)
                    "suggest"     -> handleSuggest(msg.optString("query"), id)
                    "fetchLyrics" -> handleFetchLyrics(
                        msg.optString("title"), msg.optString("channel"),
                        msg.optDouble("duration", 0.0), id)
                    "ytLoad" -> {
                        val vid = msg.optString("videoId")
                        activity.startService(Intent(activity, AudioPlayerService::class.java).apply {
                            action = AudioPlayerService.ACTION_LOAD
                            putExtra(AudioPlayerService.EXTRA_VIDEO_ID, vid)
                        })
                    }
                    "ytPlay"  -> activity.startService(Intent(activity, AudioPlayerService::class.java).apply { action = AudioPlayerService.ACTION_PLAY })
                    "ytPause" -> activity.startService(Intent(activity, AudioPlayerService::class.java).apply { action = AudioPlayerService.ACTION_PAUSE })
                    "ytSeek"  -> {
                        val sec = msg.optDouble("seconds", 0.0)
                        activity.startService(Intent(activity, AudioPlayerService::class.java).apply {
                            action = AudioPlayerService.ACTION_SEEK
                            putExtra(AudioPlayerService.EXTRA_SEEK_MS, (sec * 1000).toLong())
                        })
                    }
                    "ytVolume" -> {
                        val vol = msg.optDouble("volume", 100.0).toFloat() / 100f
                        activity.startService(Intent(activity, AudioPlayerService::class.java).apply {
                            action = AudioPlayerService.ACTION_VOL
                            putExtra(AudioPlayerService.EXTRA_VOLUME, vol)
                        })
                    }
                    "ytGetTime" -> {
                        val svc = AudioPlayerService.instance
                        activity.sendToWebView(JSONObject().apply {
                            put("type", "ytTimeResult"); put("id", id)
                            put("cur", svc?.getCurrentTime() ?: 0.0)
                            put("dur", svc?.getDuration() ?: 0.0)
                            put("isPlaying", svc?.isPlaying() ?: false)
                        }.toString())
                    }
                    "overlayMode"   -> handleOverlayMode(msg.optBoolean("active", false))
                    "overlayLyrics" -> handleOverlayLyrics(
                        msg.optString("prev"), msg.optString("active"), msg.optString("next1"))
                    "drag", "minimize", "maximize", "close", "setTitle" -> {}
                }
            } catch (e: Exception) {
                android.util.Log.e("XWare/Bridge", "postMessage error: ${e.message}")
            }
        }
    }

    @JavascriptInterface fun exitApp() { activity.runOnUiThread { activity.finish() } }
    @JavascriptInterface fun requestOverlayPermission() { activity.runOnUiThread { activity.requestOverlayPermission() } }
    @JavascriptInterface fun canDrawOverlays(): Boolean = Settings.canDrawOverlays(activity)

    private suspend fun handleSearch(query: String, id: String) {
        val result = JSONObject().apply { put("type", "searchResult"); put("id", id) }
        try {
            val tracks = withContext(Dispatchers.IO) { api.searchYouTube(query) }
            result.put("success", true); result.put("tracks", tracks)
        } catch (e: Exception) {
            result.put("success", false); result.put("error", e.message ?: "오류")
            result.put("tracks", org.json.JSONArray())
        }
        activity.sendToWebView(result.toString())
    }

    private suspend fun handleSuggest(query: String, id: String) {
        val result = JSONObject().apply { put("type", "suggestResult"); put("id", id) }
        try {
            val sugs = withContext(Dispatchers.IO) { api.getSuggestions(query) }
            result.put("success", true); result.put("suggestions", sugs)
        } catch (e: Exception) {
            result.put("success", false); result.put("suggestions", org.json.JSONArray())
        }
        activity.sendToWebView(result.toString())
    }

    private suspend fun handleFetchLyrics(title: String, channel: String, duration: Double, id: String) {
        val result = JSONObject().apply { put("type", "lyricsResult"); put("id", id) }
        try {
            val lines = withContext(Dispatchers.IO) { api.fetchLyrics(title, channel, duration) }
            if (lines != null) { result.put("success", true); result.put("lines", lines) }
            else { result.put("success", false); result.put("lines", org.json.JSONArray()) }
        } catch (e: Exception) {
            result.put("success", false); result.put("lines", org.json.JSONArray())
        }
        activity.sendToWebView(result.toString())
    }

    private fun handleOverlayMode(active: Boolean) {
        val intent = Intent(activity, OverlayService::class.java)
        if (active) {
            if (!Settings.canDrawOverlays(activity)) { activity.requestOverlayPermission(); return }
            intent.action = OverlayService.ACTION_START
        } else { intent.action = OverlayService.ACTION_STOP }
        activity.startService(intent)
    }

    private fun handleOverlayLyrics(prev: String, active: String, next: String) {
        activity.startService(Intent(activity, OverlayService::class.java).apply {
            action = OverlayService.ACTION_UPDATE_LYRICS
            putExtra(OverlayService.EXTRA_PREV, prev)
            putExtra(OverlayService.EXTRA_ACTIVE, active)
            putExtra(OverlayService.EXTRA_NEXT, next)
        })
    }

    private fun sendToJs(obj: JSONObject) { activity.sendToWebView(obj.toString()) }
    fun destroy() { scope.cancel() }
}
