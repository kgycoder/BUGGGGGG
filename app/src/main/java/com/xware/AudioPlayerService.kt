package com.xware

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.*

class AudioPlayerService : Service() {

    private var player: ExoPlayer? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val extractor = YouTubeExtractor()
    private val handler = Handler(Looper.getMainLooper())

    private var currentVideoId: String? = null
    private var currentTitle: String = ""

    var onStateChanged: ((state: String) -> Unit)? = null
    var onTimeUpdate: ((cur: Double, dur: Double) -> Unit)? = null
    var onError: ((code: Int) -> Unit)? = null
    var onReady: (() -> Unit)? = null

    private var tickJob: Job? = null

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
        initPlayer()
        startForeground(NOTIF_ID, buildNotification())
    }

    private fun initPlayer() {
        player = ExoPlayer.Builder(this).build().apply {
            addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    when (state) {
                        Player.STATE_READY    -> { onReady?.invoke(); onStateChanged?.invoke("ready"); startTick() }
                        Player.STATE_ENDED    -> { onStateChanged?.invoke("ended"); stopTick() }
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
                stopTick(); player?.stop()
                stopForeground(true); stopSelf()
            }
        }
        return START_STICKY
    }

    private fun loadVideo(videoId: String) {
        if (videoId == currentVideoId && player?.playbackState == Player.STATE_READY) {
            player?.seekTo(0); player?.play(); return
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

    fun getCurrentTime(): Double = (player?.currentPosition ?: 0L) / 1000.0
    fun getDuration(): Double { val d = player?.duration ?: 0L; return if (d < 0) 0.0 else d / 1000.0 }
    fun isPlaying(): Boolean = player?.isPlaying ?: false
    fun setVolume(vol: Float) { player?.volume = vol }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CHANNEL_ID, "X-WARE 플레이어",
                NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) }
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    private fun buildNotification(): Notification {
        val pi = PendingIntent.getService(this, 0,
            Intent(this, AudioPlayerService::class.java).apply {
                action = if (player?.isPlaying == true) ACTION_PAUSE else ACTION_PLAY
            }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("X-WARE")
            .setContentText(currentTitle.ifEmpty { "재생 중..." })
            .setSmallIcon(android.R.drawable.ic_media_play)
            .addAction(android.R.drawable.ic_media_pause,
                if (player?.isPlaying == true) "일시정지" else "재생", pi)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification() {
        try {
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .notify(NOTIF_ID, buildNotification())
        } catch (e: Exception) { }
    }

    override fun onDestroy() {
        instance = null; stopTick(); scope.cancel()
        player?.release(); player = null
        super.onDestroy()
    }
}
```

또한 `gradle/libs.versions.toml`에서 `media3-session` 의존성도 제거해야 합니다. 해당 파일을 열고 아래 두 줄을 삭제하세요:
```
# 이 줄 삭제
media3-session = { group = "androidx.media3", name = "media3-session", version.ref = "media3" }
```

그리고 `app/build.gradle.kts`에서도:
```
# 이 줄 삭제
implementation(libs.media3.session)
