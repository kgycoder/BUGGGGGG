package com.xware

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.*
import android.support.v4.media.session.MediaSessionCompat
import androidx.core.app.NotificationCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.*
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * ExoPlayer 기반 오디오 재생 포그라운드 서비스.
 * YouTube IFrame 대신 네이티브로 오디오 스트림 재생.
 */
class AudioPlayerService : Service() {

    private var player: ExoPlayer? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val extractor = YouTubeExtractor()
    private val handler = Handler(Looper.getMainLooper())

    // 현재 재생 정보
    private var currentVideoId: String? = null
    private var currentTitle: String = ""
    private var currentThumb: String = ""

    // 콜백: JS로 상태 전달
    var onStateChanged: ((state: String) -> Unit)? = null
    var onTimeUpdate: ((cur: Double, dur: Double) -> Unit)? = null
    var onError: ((code: Int) -> Unit)? = null
    var onReady: (() -> Unit)? = null

    private var tickJob: Job? = null

    companion object {
        const val ACTION_LOAD   = "com.xware.PLAYER_LOAD"
        const val ACTION_PLAY   = "com.xware.PLAYER_PLAY"
        const val ACTION_PAUSE  = "com.xware.PLAYER_PAUSE"
        const val ACTION_SEEK   = "com.xware.PLAYER_SEEK"
        const val ACTION_STOP   = "com.xware.PLAYER_STOP"
        const val ACTION_VOL    = "com.xware.PLAYER_VOL"
        const val EXTRA_VIDEO_ID = "video_id"
        const val EXTRA_SEEK_MS  = "seek_ms"
        const val EXTRA_VOLUME   = "volume"
        private const val CHANNEL_ID = "xware_player"
        private const val NOTIF_ID   = 2001

        // 싱글톤 인스턴스 참조 (MainActivity에서 직접 접근용)
        var instance: AudioPlayerService? = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannel()
        initPlayer()
        startForeground(NOTIF_ID, buildNotification())
    }

    private fun initPlayer() {
        player = ExoPlayer.Builder(this).build().apply {
            addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    when (state) {
                        Player.STATE_READY   -> {
                            onReady?.invoke()
                            onStateChanged?.invoke("ready")
                            startTick()
                        }
                        Player.STATE_ENDED   -> {
                            onStateChanged?.invoke("ended")
                            stopTick()
                        }
                        Player.STATE_BUFFERING -> onStateChanged?.invoke("buffering")
                        Player.STATE_IDLE      -> onStateChanged?.invoke("idle")
                    }
                }
                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    onStateChanged?.invoke(if (isPlaying) "playing" else "paused")
                    if (isPlaying) startTick() else stopTick()
                    updateNotification()
                }
                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    android.util.Log.e("XWare/Player", "ExoPlayer error: ${error.message}")
                    onError?.invoke(error.errorCode)
                    stopTick()
                }
            })
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_LOAD  -> {
                val vid = intent.getStringExtra(EXTRA_VIDEO_ID) ?: return START_STICKY
                loadVideo(vid)
            }
            ACTION_PLAY  -> player?.play()
            ACTION_PAUSE -> player?.pause()
            ACTION_SEEK  -> {
                val ms = intent.getLongExtra(EXTRA_SEEK_MS, 0L)
                player?.seekTo(ms)
            }
            ACTION_VOL   -> {
                val vol = intent.getFloatExtra(EXTRA_VOLUME, 1f)
                player?.volume = vol
            }
            ACTION_STOP  -> {
                stopTick()
                player?.stop()
                stopForeground(true)
                stopSelf()
            }
        }
        return START_STICKY
    }

    private fun loadVideo(videoId: String) {
        if (videoId == currentVideoId && player?.playbackState == Player.STATE_READY) {
            player?.seekTo(0)
            player?.play()
            return
        }
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
                currentThumb = info.thumbnailUrl

                withContext(Dispatchers.Main) {
                    player?.apply {
                        stop()
                        setMediaItem(MediaItem.fromUri(info.audioUrl))
                        prepare()
                        play()
                    }
                    updateNotification()
                }
            } catch (e: Exception) {
                android.util.Log.e("XWare/Player", "loadVideo failed: ${e.message}")
                withContext(Dispatchers.Main) { onError?.invoke(-2) }
            }
        }
    }

    // ── 재생 시간 tick ──────────────────────────────
    private fun startTick() {
        stopTick()
        tickJob = scope.launch {
            while (isActive) {
                val p = player ?: break
                if (p.isPlaying) {
                    val cur = p.currentPosition / 1000.0
                    val dur = p.duration.let { if (it < 0) 0.0 else it / 1000.0 }
                    onTimeUpdate?.invoke(cur, dur)
                }
                delay(250)
            }
        }
    }

    private fun stopTick() { tickJob?.cancel(); tickJob = null }

    // ── 상태 조회 (JS에서 동기적으로 읽는 값들) ──
    fun getCurrentTime(): Double = (player?.currentPosition ?: 0L) / 1000.0
    fun getDuration(): Double {
        val d = player?.duration ?: 0L
        return if (d < 0) 0.0 else d / 1000.0
    }
    fun isPlaying(): Boolean = player?.isPlaying ?: false
    fun setVolume(vol: Float) { player?.volume = vol }

    // ── 알림 ────────────────────────────────────────
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID, "X-WARE 플레이어",
                NotificationManager.IMPORTANCE_LOW
            ).apply { setShowBadge(false) }
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    private fun buildNotification(): Notification {
        val pauseIntent = Intent(this, AudioPlayerService::class.java).apply { action = ACTION_PAUSE }
        val playIntent  = Intent(this, AudioPlayerService::class.java).apply { action = ACTION_PLAY }
        val isPlaying   = player?.isPlaying ?: false

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("X-WARE")
            .setContentText(currentTitle.ifEmpty { "재생 중..." })
            .setSmallIcon(android.R.drawable.ic_media_play)
            .addAction(
                if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if (isPlaying) "일시정지" else "재생",
                PendingIntent.getService(this, 0,
                    if (isPlaying) pauseIntent else playIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            )
            .setOngoing(true)
            .build()
    }

    private fun updateNotification() {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIF_ID, buildNotification())
        } catch (e: Exception) { /* ignore */ }
    }

    override fun onDestroy() {
        instance = null
        stopTick()
        scope.cancel()
        player?.release()
        player = null
        super.onDestroy()
    }
}
