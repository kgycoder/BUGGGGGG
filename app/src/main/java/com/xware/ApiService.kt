package com.xware

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * All network API calls — mirrors the C# MainForm HTTP logic.
 * Must be called from a background (IO) dispatcher.
 */
class ApiService {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val req = chain.request().newBuilder()
                .header("User-Agent",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
                .header("Accept-Language", "ko-KR,ko;q=0.9,en;q=0.8")
                .build()
            chain.proceed(req)
        }
        .build()

    /* ══════════════════════════════════════════════════════
       YouTube InnerTube search
    ══════════════════════════════════════════════════════ */
    fun searchYouTube(query: String): JSONArray {
        val KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
        val url = "https://www.youtube.com/youtubei/v1/search?key=$KEY&prettyPrint=false"
        val bodyJson = JSONObject().apply {
            put("context", JSONObject().apply {
                put("client", JSONObject().apply {
                    put("clientName", "WEB")
                    put("clientVersion", "2.20240101.00.00")
                    put("hl", "ko")
                    put("gl", "KR")
                })
            })
            put("query", query)
            put("params", "EgIQAQ==")
        }

        val req = Request.Builder()
            .url(url)
            .post(bodyJson.toString().toRequestBody("application/json".toMediaType()))
            .header("X-YouTube-Client-Name", "1")
            .header("X-YouTube-Client-Version", "2.20240101.00.00")
            .header("Origin", "https://www.youtube.com")
            .header("Referer", "https://www.youtube.com/")
            .build()

        val resp = client.newCall(req).execute()
        val json = resp.body?.string() ?: return JSONArray()
        resp.close()
        return parseSearchResults(json)
    }

    private fun parseSearchResults(json: String): JSONArray {
        val result = JSONArray()
        try {
            val doc = JSONObject(json)
            val sections = doc
                .getJSONObject("contents")
                .getJSONObject("twoColumnSearchResultsRenderer")
                .getJSONObject("primaryContents")
                .getJSONObject("sectionListRenderer")
                .getJSONArray("contents")

            for (si in 0 until sections.length()) {
                val sec = sections.getJSONObject(si)
                val isr = sec.optJSONObject("itemSectionRenderer") ?: continue
                val items = isr.optJSONArray("contents") ?: continue
                for (ii in 0 until items.length()) {
                    if (result.length() >= 20) break
                    val item = items.getJSONObject(ii)
                    val vr = item.optJSONObject("videoRenderer") ?: continue
                    val id = vr.optString("videoId").takeIf { it.isNotEmpty() } ?: continue

                    val title = vr.optJSONObject("title")
                        ?.optJSONArray("runs")?.optJSONObject(0)?.optString("text") ?: continue

                    val ch = (vr.optJSONObject("ownerText")
                        ?: vr.optJSONObject("shortBylineText"))
                        ?.optJSONArray("runs")?.optJSONObject(0)?.optString("text") ?: ""

                    val durStr = vr.optJSONObject("lengthText")?.optString("simpleText") ?: ""
                    val dur    = parseDuration(durStr)

                    if (!isMusicVideo(title, ch, dur)) continue

                    result.put(JSONObject().apply {
                        put("id", id)
                        put("title", title)
                        put("channel", ch)
                        put("dur", dur)
                        put("thumb", "https://i.ytimg.com/vi/$id/mqdefault.jpg")
                    })
                }
                if (result.length() >= 20) break
            }
        } catch (e: Exception) {
            android.util.Log.e("XWare/API", "parseSearchResults: ${e.message}")
        }
        return result
    }

    private fun isMusicVideo(title: String, channel: String, dur: Int): Boolean {
        val tl = title.lowercase()
        val cl = channel.lowercase()
        if (cl.containsAny("vevo","topic","music","records","entertainment","sound","audio","official")) return true
        if (tl.containsAny("official","mv","m/v","music video","audio","lyrics","lyric","visualizer","live","performance","concert")) return true
        if (dur >= 60) return true
        return false
    }

    private fun String.containsAny(vararg tokens: String) = tokens.any { this.contains(it) }

    private fun parseDuration(s: String): Int {
        if (s.isEmpty()) return 0
        val p = s.split(":")
        return try {
            when (p.size) {
                3 -> p[0].toInt() * 3600 + p[1].toInt() * 60 + p[2].toInt()
                2 -> p[0].toInt() * 60 + p[1].toInt()
                else -> 0
            }
        } catch (e: Exception) { 0 }
    }

    /* ══════════════════════════════════════════════════════
       YouTube autocomplete suggestions
    ══════════════════════════════════════════════════════ */
    fun getSuggestions(query: String): JSONArray {
        val url = "https://suggestqueries.google.com/complete/search" +
                  "?client=firefox&ds=yt&q=${encode(query)}&hl=ko"
        val req  = Request.Builder().url(url).build()
        val resp = client.newCall(req).execute()
        val json = resp.body?.string() ?: return JSONArray()
        resp.close()

        val arr  = JSONArray(json)
        val sugs = JSONArray()
        if (arr.length() > 1) {
            val list = arr.getJSONArray(1)
            for (i in 0 until minOf(list.length(), 8)) {
                val s = list.optString(i)
                if (s.isNotEmpty()) sugs.put(s)
            }
        }
        return sugs
    }

    /* ══════════════════════════════════════════════════════
       Lyrics — lrclib.net
    ══════════════════════════════════════════════════════ */
    fun fetchLyrics(rawTitle: String, channel: String, ytDuration: Double): JSONArray? {
        val title  = cleanTitle(rawTitle)
        val artist = cleanArtist(channel)

        var results = searchLrclib("$title $artist")
        if (results.length() == 0) results = searchLrclib(title)
        if (results.length() == 0) return null

        data class Candidate(val lrc: String, val lrcDur: Double)
        val candidates = mutableListOf<Candidate>()

        for (i in 0 until results.length()) {
            val item = results.getJSONObject(i)
            val lrc  = item.optString("syncedLyrics").takeIf { it.isNotEmpty() } ?: continue
            var dur  = getLrcLastTimestamp(lrc)
            if (dur <= 0) dur = item.optDouble("duration", 0.0)
            candidates.add(Candidate(lrc, dur))
        }
        if (candidates.isEmpty()) return null

        val bestLrc = if (ytDuration > 0) {
            val withDur = candidates.filter { it.lrcDur > 0 }
            if (withDur.isNotEmpty())
                withDur.minByOrNull { Math.abs(it.lrcDur - ytDuration) }!!.lrc
            else candidates[0].lrc
        } else candidates[0].lrc

        return parseLrc(bestLrc)
    }

    private fun searchLrclib(query: String): JSONArray {
        val url  = "https://lrclib.net/api/search?q=${encode(query)}"
        val req  = Request.Builder().url(url).header("Lrclib-Client", "XWare/1.0").build()
        val resp = client.newCall(req).execute()
        val json = resp.body?.string() ?: return JSONArray()
        resp.close()
        return try { JSONArray(json) } catch (e: Exception) { JSONArray() }
    }

    private fun getLrcLastTimestamp(lrc: String): Double {
        val re = Regex("""^\[(\d+):(\d+)\.(\d+)]""")
        var last = 0.0
        lrc.lines().forEach { line ->
            val m = re.find(line.trim()) ?: return@forEach
            val ms = m.groupValues[3].padEnd(3, '0').take(3)
            val t  = m.groupValues[1].toInt() * 60.0 +
                     m.groupValues[2].toInt() +
                     ms.toInt() / 1000.0
            if (t > last) last = t
        }
        return last
    }

    private fun parseLrc(lrc: String): JSONArray {
        data class Line(val start: Double, val text: String)
        val re   = Regex("""^\[(\d+):(\d+)\.(\d+)](.*)""")
        val list = mutableListOf<Line>()

        lrc.lines().forEach { raw ->
            val l = raw.trim()
            val m = re.find(l) ?: return@forEach
            val ms   = m.groupValues[3].padEnd(3, '0').take(3)
            val t    = m.groupValues[1].toInt() * 60.0 +
                       m.groupValues[2].toInt() +
                       ms.toInt() / 1000.0
            val text = m.groupValues[4].trim()
            if (text.isNotEmpty()) list.add(Line(t, text))
        }
        list.sortBy { it.start }

        val result = JSONArray()
        list.forEachIndexed { i, line ->
            val end = if (i + 1 < list.size) list[i + 1].start else line.start + 5.0
            result.put(JSONObject().apply {
                put("start", line.start)
                put("end",   end)
                put("text",  line.text)
            })
        }
        return result
    }

    /* ── String helpers ─────────────────────────────── */

    private fun cleanTitle(t: String): String {
        var s = t
        s = s.replace(Regex("""(?i)\((?:official|mv|m/v|video|audio|lyrics?|visualizer|live|performance|hd|4k)[^)]*\)"""), "").trim()
        s = s.replace(Regex("""(?i)\[(?:official|mv|m/v|video|audio|lyrics?|visualizer|live|performance|hd|4k)[^\]]*]"""), "").trim()
        s = s.replace(Regex("""(?i)\s*[-|]\s*(official|mv|lyrics?|audio|video)\s*$"""), "").trim()
        s = s.replace(Regex("""(?i)\s*[\(\[]?feat\..*$"""), "").trim()
        return s
    }

    private fun cleanArtist(c: String): String {
        var s = c
        s = s.replace(Regex("""(?i)\s*[-·]\s*Topic\s*$"""), "").trim()
        s = s.replace(Regex("""(?i)VEVO$"""), "").trim()
        s = s.replace(Regex("""(?i)\s*(Records|Entertainment|Music|Official)\s*$"""), "").trim()
        return s
    }

    private fun encode(s: String) = java.net.URLEncoder.encode(s, "UTF-8")
}
