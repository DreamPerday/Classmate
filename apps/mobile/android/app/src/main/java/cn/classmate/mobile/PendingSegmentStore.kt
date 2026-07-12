package cn.classmate.mobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class CaptureSegment(
  val id: String,
  val text: String,
  val startMs: Long,
  val endMs: Long,
  val createdAt: String,
)

object PendingSegmentStore {
  private const val PREFS = "classmate.capture.pending"
  private const val KEY_SEGMENTS = "segments"
  private const val MAX_SEGMENTS = 200

  @Synchronized
  fun add(context: Context, segment: CaptureSegment) {
    val values = readArray(context)
    val next = JSONArray()
    val first = maxOf(0, values.length() - MAX_SEGMENTS + 1)
    for (index in first until values.length()) next.put(values.getJSONObject(index))
    next.put(toJson(segment))
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString(KEY_SEGMENTS, next.toString())
      .apply()
    CaptureStateStore.publish(context, CaptureContract.EVENT_SEGMENT)
  }

  @Synchronized
  fun list(context: Context): List<CaptureSegment> {
    val values = readArray(context)
    return buildList {
      for (index in 0 until values.length()) {
        val value = values.optJSONObject(index) ?: continue
        val text = value.optString("text").trim()
        if (text.isEmpty()) continue
        add(
          CaptureSegment(
            id = value.optString("id"),
            text = text,
            startMs = value.optLong("startMs"),
            endMs = value.optLong("endMs"),
            createdAt = value.optString("createdAt"),
          ),
        )
      }
    }
  }

  @Synchronized
  fun acknowledge(context: Context, id: String) {
    val values = readArray(context)
    val next = JSONArray()
    for (index in 0 until values.length()) {
      val value = values.optJSONObject(index) ?: continue
      if (value.optString("id") != id) next.put(value)
    }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString(KEY_SEGMENTS, next.toString())
      .apply()
  }

  private fun readArray(context: Context): JSONArray {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getString(KEY_SEGMENTS, "[]") ?: "[]"
    return runCatching { JSONArray(raw) }.getOrDefault(JSONArray())
  }

  private fun toJson(segment: CaptureSegment) = JSONObject()
    .put("id", segment.id)
    .put("text", segment.text)
    .put("startMs", segment.startMs)
    .put("endMs", segment.endMs)
    .put("createdAt", segment.createdAt)
}
