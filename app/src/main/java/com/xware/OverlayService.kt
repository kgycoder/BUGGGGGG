package com.xware

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.os.*
import android.view.*
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat

/**
 * Foreground service that shows a transparent always-on-top lyrics window
 * (mirrors the C# LyricsForm behaviour).
 *
 * Lyrics are updated via Intent extras: prev / active / next.
 */
class OverlayService : Service() {

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var tvPrev:   TextView? = null
    private var tvActive: TextView? = null
    private var tvNext:   TextView? = null

    private val handler = Handler(Looper.getMainLooper())

    /* ── Lifecycle ───────────────────────────────────── */

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
        startForeground(NOTIF_ID, buildNotification())
        buildOverlayView()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START          -> showOverlay()
            ACTION_STOP           -> stopOverlay()
            ACTION_UPDATE_LYRICS  -> {
                val prev   = intent.getStringExtra(EXTRA_PREV)   ?: ""
                val active = intent.getStringExtra(EXTRA_ACTIVE) ?: ""
                val next   = intent.getStringExtra(EXTRA_NEXT)   ?: ""
                updateLyrics(prev, active, next)
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        removeOverlay()
        super.onDestroy()
    }

    /* ── Overlay View ────────────────────────────────── */

    private fun buildOverlayView() {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(4), dp(24), dp(4))
        }

        tvPrev = makeTextView(15f, 0.32f, false).also { container.addView(it) }
        tvActive = makeTextView(21f, 0.96f, true).also  { container.addView(it) }
        tvNext = makeTextView(15f, 0.28f, false).also { container.addView(it) }

        overlayView = container
    }

    private fun makeTextView(spSize: Float, alpha: Float, bold: Boolean): TextView =
        TextView(this).apply {
            textSize  = spSize
            setTextColor(Color.WHITE)
            this.alpha = alpha
            if (bold) setTypeface(typeface, Typeface.BOLD)
            setShadowLayer(12f, 0f, 2f, Color.BLACK)
            gravity = Gravity.CENTER_HORIZONTAL
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(0, dp(3), 0, dp(3)) }
            layoutParams = lp
        }

    private fun showOverlay() {
        handler.post {
            if (overlayView?.windowToken != null) return@post
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_SYSTEM_ALERT

            val metrics = DisplayMetrics()
            @Suppress("DEPRECATION")
            windowManager?.defaultDisplay?.getRealMetrics(metrics)
            val screenW = metrics.widthPixels

            val params = WindowManager.LayoutParams(
                screenW,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.BOTTOM or Gravity.START
                x = 0
                // Position just above the bottom control bar area (~160dp)
                y = dp(168)
            }

            try {
                windowManager?.addView(overlayView, params)
            } catch (e: Exception) {
                android.util.Log.e("XWare/Overlay", "addView failed: ${e.message}")
            }
        }
    }

    private fun stopOverlay() {
        removeOverlay()
        stopForeground(true)
        stopSelf()
    }

    private fun removeOverlay() {
        handler.post {
            try {
                overlayView?.let { v ->
                    if (v.windowToken != null) windowManager?.removeView(v)
                }
            } catch (e: Exception) { /* already removed */ }
        }
    }

    /* ── Lyrics update ───────────────────────────────── */

    fun updateLyrics(prev: String, active: String, next: String) {
        handler.post {
            animateText(tvPrev,   prev)
            animateText(tvActive, active)
            animateText(tvNext,   next)
        }
    }

    private fun animateText(tv: TextView?, text: String) {
        if (tv == null) return
        if (tv.text.toString() == text) return
        if (text.isEmpty()) {
            tv.animate().alpha(0f).setDuration(300).start()
            tv.postDelayed({ tv.text = "" }, 320)
        } else if (tv.text.isEmpty()) {
            tv.text = text
            tv.alpha = 0f
            tv.animate().alpha(if (tv == tvActive) 0.96f else if (tv == tvPrev) 0.32f else 0.28f)
                .setDuration(300).start()
        } else {
            tv.animate().alpha(0f).setDuration(180).withEndAction {
                tv.text = text
                val target = if (tv == tvActive) 0.96f else if (tv == tvPrev) 0.32f else 0.28f
                tv.animate().alpha(target).setDuration(220).start()
            }.start()
        }
    }

    /* ── Foreground notification ─────────────────────── */

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID, "Lyrics Overlay",
                NotificationManager.IMPORTANCE_LOW
            ).apply { setShowBadge(false) }
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    private fun buildNotification(): Notification {
        val stopIntent = Intent(this, OverlayService::class.java).apply { action = ACTION_STOP }
        val stopPi = PendingIntent.getService(this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("X-WARE")
            .setContentText("가사 오버레이 실행 중")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .addAction(android.R.drawable.ic_delete, "닫기", stopPi)
            .setOngoing(true)
            .build()
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density + 0.5f).toInt()

    companion object {
        const val ACTION_START         = "com.xware.OVERLAY_START"
        const val ACTION_STOP          = "com.xware.OVERLAY_STOP"
        const val ACTION_UPDATE_LYRICS = "com.xware.UPDATE_LYRICS"
        const val EXTRA_PREV           = "prev"
        const val EXTRA_ACTIVE         = "active"
        const val EXTRA_NEXT           = "next"
        private const val CHANNEL_ID   = "xware_overlay"
        private const val NOTIF_ID     = 1001
    }
}

private class DisplayMetrics : android.util.DisplayMetrics()
