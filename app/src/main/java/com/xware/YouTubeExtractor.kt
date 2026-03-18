package com.xware

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.URLDecoder
import java.util.concurrent.TimeUnit

/**
 * YouTube InnerTube /player API를 통해 실제 오디오 스트림 URL을 추출.
 * IFrame 없이 네이티브 ExoPlayer로 재생하기 위한 핵심 클래스.
 */
class YouTubeExtractor {

    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val req = chain.request().newBuilder()
                .header("User-Agent",
                    "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip")
                .header("Accept-Language", "ko-KR,ko;q=0.9")
                .header("X-YouTube-Client-Name", "3")
                .header("X-YouTube-Client-Version", "19.09.37")
                .build()
            chain.proceed(req)
        }
        .build()

    data class StreamInfo(
        val audioUrl: String,
        val title: String,
        val duration: Long,   // 초
        val thumbnailUrl: String
    )

    fun extractAudio(videoId: String): StreamInfo? {
        // 1차 시도: ANDROID 클라이언트
        var result = tryExtract(videoId, "ANDROID", "19.09.37", "3")
        // 2차 시도: ANDROID_MUSIC 클라이언트
        if (result == null) {
            result = tryExtract(videoId, "ANDROID_MUSIC", "7.27.52", "21")
        }
        // 3차 시도: IOS 클라이언트
        if (result == null) {
            result = tryExtractIos(videoId)
        }
        return result
    }

    private fun tryExtract(
        videoId: String,
        clientName: String,
        clientVersion: String,
        clientNameId: String
    ): StreamInfo? {
        return try {
            val KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
            val url = "https://www.youtube.com/youtubei/v1/player?key=$KEY"

            val body = JSONObject().apply {
                put("videoId", videoId)
                put("context", JSONObject().apply {
                    put("client", JSONObject().apply {
                        put("clientName", clientName)
                        put("clientVersion", clientVersion)
                        put("androidSdkVersion", 30)
                        put("hl", "ko")
                        put("gl", "KR")
                        put("utcOffsetMinutes", 540)
                    })
                })
                put("params", "2AMBCgIQBg==")
                put("playbackContext", JSONObject().apply {
                    put("contentPlaybackContext", JSONObject().apply {
                        put("html5Preference", "HTML5_PREF_WANTS")
                    })
                })
            }

            val req = Request.Builder()
                .url(url)
                .post(body.toString().toRequestBody("application/json".toMediaType()))
                .header("X-YouTube-Client-Name", clientNameId)
                .header("X-YouTube-Client-Version", clientVersion)
                .header("Origin", "https://www.youtube.com")
                .build()

            val resp = client.newCall(req).execute()
            val json = resp.body?.string() ?: return null
            resp.close()

            parseStreamInfo(videoId, json)
        } catch (e: Exception) {
            android.util.Log.e("XWare/Extract", "tryExtract($clientName) failed: ${e.message}")
            null
        }
    }

    private fun tryExtractIos(videoId: String): StreamInfo? {
        return try {
            val KEY = "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc"
            val url = "https://www.youtube.com/youtubei/v1/player?key=$KEY"

            val body = JSONObject().apply {
                put("videoId", videoId)
                put("context", JSONObject().apply {
                    put("client", JSONObject().apply {
                        put("clientName", "IOS")
                        put("clientVersion", "19.09.3")
                        put("deviceModel", "iPhone16,2")
                        put("hl", "ko")
                        put("gl", "KR")
                    })
                })
            }

            val req = Request.Builder()
                .url(url)
                .post(body.toString().toRequestBody("application/json".toMediaType()))
                .header("X-YouTube-Client-Name", "5")
                .header("X-YouTube-Client-Version", "19.09.3")
                .build()

            val resp = client.newCall(req).execute()
            val json = resp.body?.string() ?: return null
            resp.close()

            parseStreamInfo(videoId, json)
        } catch (e: Exception) {
            android.util.Log.e("XWare/Extract", "tryExtractIos failed: ${e.message}")
            null
        }
    }

    private fun parseStreamInfo(videoId: String, json: String): StreamInfo? {
        return try {
            val doc = JSONObject(json)

            // 재생 불가 체크
            val status = doc.optJSONObject("playabilityStatus")
            val statusStr = status?.optString("status") ?: ""
            if (statusStr == "ERROR" || statusStr == "LOGIN_REQUIRED") {
                android.util.Log.w("XWare/Extract", "Playability: $statusStr")
                return null
            }

            val videoDetails = doc.optJSONObject("videoDetails")
            val title = videoDetails?.optString("title") ?: ""
            val duration = videoDetails?.optString("lengthSeconds")?.toLongOrNull() ?: 0L
            val thumbnail = videoDetails?.optJSONObject("thumbnail")
                ?.optJSONArray("thumbnails")
                ?.let { thumbs ->
                    // 가장 고품질 썸네일
                    if (thumbs.length() > 0)
                        thumbs.getJSONObject(thumbs.length() - 1).optString("url")
                    else null
                } ?: "https://i.ytimg.com/vi/$videoId/hqdefault.jpg"

            val streamingData = doc.optJSONObject("streamingData") ?: return null

            // adaptiveFormats에서 오디오만 추출 (화질 없음, 용량 작음)
            val audioUrl = findBestAudioUrl(streamingData)
                ?: findFallbackUrl(streamingData)
                ?: return null

            StreamInfo(
                audioUrl  = audioUrl,
                title     = title,
                duration  = duration,
                thumbnailUrl = thumbnail
            )
        } catch (e: Exception) {
            android.util.Log.e("XWare/Extract", "parseStreamInfo failed: ${e.message}")
            null
        }
    }

    /**
     * adaptiveFormats에서 오디오 전용 스트림 중 최고 품질(opus > aac) 선택
     */
    private fun findBestAudioUrl(streamingData: JSONObject): String? {
        val adaptive = streamingData.optJSONArray("adaptiveFormats") ?: return null

        data class AudioFormat(val url: String, val bitrate: Int, val isOpus: Boolean)
        val audios = mutableListOf<AudioFormat>()

        for (i in 0 until adaptive.length()) {
            val fmt = adaptive.getJSONObject(i)
            val mimeType = fmt.optString("mimeType")
            if (!mimeType.startsWith("audio/")) continue

            val url = fmt.optString("url").takeIf { it.isNotEmpty() }
                ?: decipherSignature(fmt) ?: continue

            val bitrate = fmt.optInt("bitrate", 0)
            val isOpus  = mimeType.contains("opus")
            audios.add(AudioFormat(url, bitrate, isOpus))
        }

        if (audios.isEmpty()) return null

        // opus 우선, 없으면 aac, bitrate 내림차순
        return audios
            .sortedWith(compareByDescending<AudioFormat> { if (it.isOpus) 1 else 0 }
                .thenByDescending { it.bitrate })
            .first().url
    }

    /**
     * formats(일반 비디오+오디오 혼합)에서 fallback
     */
    private fun findFallbackUrl(streamingData: JSONObject): String? {
        val formats = streamingData.optJSONArray("formats") ?: return null
        for (i in 0 until formats.length()) {
            val fmt = formats.getJSONObject(i)
            val url = fmt.optString("url").takeIf { it.isNotEmpty() } ?: continue
            return url
        }
        return null
    }

    /**
     * signatureCipher / cipher가 있는 경우 URL 디코딩 (간단 처리)
     */
    private fun decipherSignature(fmt: JSONObject): String? {
        val cipher = fmt.optString("signatureCipher").takeIf { it.isNotEmpty() }
            ?: fmt.optString("cipher").takeIf { it.isNotEmpty() }
            ?: return null
        return try {
            val params = cipher.split("&").associate {
                val kv = it.split("=", limit = 2)
                URLDecoder.decode(kv[0], "UTF-8") to
                URLDecoder.decode(kv.getOrElse(1) { "" }, "UTF-8")
            }
            // url 파라미터만 사용 (서명 없이 재생 가능한 경우)
            params["url"]
        } catch (e: Exception) { null }
    }
}
