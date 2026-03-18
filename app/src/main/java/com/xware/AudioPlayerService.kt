package com.xware

import android.app.*
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.*
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*

class AudioPlayerService : Service() {

    private var player: MediaPlayer? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val extractor = YouTubeExtractor()
    private var currentVideoId: String? = null
    private var currentTitle: String = ""
    private var tickJob: Job? = null
    private var duration: Double = 0.0

    var onStateChanged: ((state: String) -> Unit)? = null
    var onTimeUpdate: ((cur: Double, dur: Double) -> Unit)? = null
    var onError: ((code: Int) -> Unit)? = null
    var onReady: (() -> Unit)? = null

    companion object {
        const val ACTION_LOAD    = "com.xware.PLAYER_LOAD"
        const val ACTION_PLAY    = "com.xware.PLAYER_PLAY"
        const val ACTION_PAUSE   = "com.xware.PLAYER_PAUSE"
        const val ACTION_SEEK    = "com.xware.PLAYER_SEEK"
        const val ACTION_STOP    = "com.xware.PLAYER_STOP"
        const val ACTION_VOL     = "com.xware.PLAYER_VOL"
        const val EXTRA_VIDEO_ID = "video_id"
        const val EXTRA_SEEK_MS  = "seek_ms"
        const val EXTRA_VOLUME   = "volume"
        private const val CHANNEL_ID = "xware_player"
        private const val NOTIF_ID   = 2001
        var instance: AudioPlayerService? = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannel()
        startForeground(NOTIF_ID, buildNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_LOAD  -> {
                val vid = intent.getStringExtra(EXTRA_VIDEO_ID) ?: return START_STICKY
                loadVideo(vid)
            }
            ACTION_PLAY  -> resumePlay()
            ACTION_PAUSE -> pausePlay()
            ACTION_SEEK  -> {
                val ms = intent.getLongExtra(EXTRA_SEEK_MS, 0L).toInt()
                try { player?.seekTo(ms) } catch (e: Exception) {}
            }
            ACTION_VOL   -> {
                val vol = intent.getFloatExtra(EXTRA_VOLUME, 1f)
                try { player?.setVolume(vol, vol) } catch (e: Exception) {}
            }
            ACTION_STOP  -> {
                stopTick(); releasePlayer()
                stopForeground(true); stopSelf()
            }
        }
        return START_STICKY
    }

    private fun loadVideo(videoId: String) {
        currentVideoId = videoId
        onStateChanged?.invoke("buffering")

        scope.launch(Dispatchers.IO) {
            try {
                val info = extractor.extractAudio(videoId)
                if (info == null) {
                    withContext(Dispatchers.Main) { onError?.invoke(-1) }
                    return@launch
                }
                currentTitle = info.title
                duration = info.duration.toDouble()

                withContext(Dispatchers.Main) {
                    releasePlayer()
                    player = MediaPlayer().apply {
                        setAudioAttributes(
                            AudioAttributes.Builder()
                                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                                .setUsage(AudioAttributes.USAGE_MEDIA)
                                .build()
                        )
                        setDataSource(info.audioUrl)
                        setOnPreparedListener { mp ->
                            duration = mp.duration / 1000.0
                            onReady?.invoke()
                            onStateChanged?.invoke("ready")
                            mp.start()
                            onStateChanged?.invoke("playing")
                            startTick()
                            updateNotification()
                        }
                        setOnCompletionListener {
                            onStateChanged?.invoke("ended")
                            stopTick()
                        }
                        setOnErrorListener { _, what, extra ->
                            android.util.Log.e("XWare/Player", "MediaPlayer error: $what / $extra")
                            onError?.invoke(what)
                            stopTick()
                            true
                        }
                        prepareAsync()
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("XWare/Player", "loadVideo failed: ${e.message}")
                withContext(Dispatchers.Main) { onError?.invoke(-2) }
            }
        }
    }

    private fun resumePlay() {
        try {
            player?.start()
            onStateChanged?.invoke("playing")
            startTick()
            updateNotification()
        } catch (e: Exception) {}
    }

    private fun pausePlay() {
        try {
            player?.pause()
            onStateChanged?.invoke("paused")
            stopTick()
            updateNotification()
        } catch (e: Exception) {}
    }

    private fun releasePlayer() {
        try { player?.stop() } catch (e: Exception) {}
        try { player?.release() } catch (e: Exception) {}
        player = null
    }

    private fun startTick() {
        stopTick()
        tickJob = scope.launch {
            while (isActive) {
                try {
                    val p = player
                    if (p != null && p.isPlaying) {
                        val cur = p.currentPosition / 1000.0
                        onTimeUpdate?.invoke(cur, duration)
                    }
                } catch (e: Exception) {}
                delay(250)
            }
        }
    }

    private fun stopTick() { tickJob?.cancel(); tickJob = null }

    fun getCurrentTime(): Double = try { (player?.currentPosition ?: 0) / 1000.0 } catch (e: Exception) { 0.0 }
    fun getDuration(): Double = duration
    fun isPlaying(): Boolean = try { player?.isPlaying ?: false } catch (e: Exception) { false }
    fun setVolume(vol: Float) { try { player?.setVolume(vol, vol) } catch (e: Exception) {} }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CHANNEL_ID, "X-WARE 플레이어",
                NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) }
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("X-WARE")
            .setContentText(currentTitle.ifEmpty { "재생 중..." })
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification() {
        try {
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .notify(NOTIF_ID, buildNotification())
        } catch (e: Exception) {}
    }

    override fun onDestroy() {
        instance = null
        stopTick()
        scope.cancel()
        releasePlayer()
        super.onDestroy()
    }
}
