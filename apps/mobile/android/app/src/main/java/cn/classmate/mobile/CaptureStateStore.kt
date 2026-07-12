package cn.classmate.mobile

import android.content.Context
import android.content.Intent

data class CaptureSnapshot(
  val phase: String,
  val active: Boolean,
  val startedAt: Long,
  val partialText: String,
  val error: String,
  val overlayVisible: Boolean,
  val capturedBytes: Long,
)

object CaptureStateStore {
  private const val PREFS = "classmate.capture.state"
  private const val KEY_PHASE = "phase"
  private const val KEY_ACTIVE = "active"
  private const val KEY_STARTED_AT = "startedAt"
  private const val KEY_PARTIAL = "partialText"
  private const val KEY_ERROR = "error"
  private const val KEY_OVERLAY = "overlayVisible"
  private const val KEY_CAPTURED_BYTES = "capturedBytes"

  fun snapshot(context: Context): CaptureSnapshot {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return CaptureSnapshot(
      phase = prefs.getString(KEY_PHASE, "idle") ?: "idle",
      active = prefs.getBoolean(KEY_ACTIVE, false),
      startedAt = prefs.getLong(KEY_STARTED_AT, 0L),
      partialText = prefs.getString(KEY_PARTIAL, "") ?: "",
      error = prefs.getString(KEY_ERROR, "") ?: "",
      overlayVisible = prefs.getBoolean(KEY_OVERLAY, false),
      capturedBytes = prefs.getLong(KEY_CAPTURED_BYTES, 0L),
    )
  }

  fun requesting(context: Context) = write(
    context,
    phase = "requesting",
    active = false,
    startedAt = 0L,
    partialText = "",
    error = "",
    overlayVisible = false,
    capturedBytes = 0L,
  )

  fun capturing(context: Context, startedAt: Long, overlayVisible: Boolean) = write(
    context,
    phase = "capturing",
    active = true,
    startedAt = startedAt,
    partialText = "",
    error = "",
    overlayVisible = overlayVisible,
    capturedBytes = 0L,
  )

  fun progress(context: Context, phase: String, partialText: String, capturedBytes: Long) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs.edit()
      .putString(KEY_PHASE, phase)
      .putString(KEY_PARTIAL, partialText)
      .putLong(KEY_CAPTURED_BYTES, capturedBytes)
      .apply()
    publish(context)
  }

  fun failed(context: Context, code: String) = write(
    context,
    phase = "error",
    active = false,
    startedAt = 0L,
    partialText = "",
    error = code,
    overlayVisible = false,
    capturedBytes = 0L,
  )

  fun idle(context: Context) = write(
    context,
    phase = "idle",
    active = false,
    startedAt = 0L,
    partialText = "",
    error = "",
    overlayVisible = false,
    capturedBytes = 0L,
  )

  private fun write(
    context: Context,
    phase: String,
    active: Boolean,
    startedAt: Long,
    partialText: String,
    error: String,
    overlayVisible: Boolean,
    capturedBytes: Long,
  ) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString(KEY_PHASE, phase)
      .putBoolean(KEY_ACTIVE, active)
      .putLong(KEY_STARTED_AT, startedAt)
      .putString(KEY_PARTIAL, partialText)
      .putString(KEY_ERROR, error)
      .putBoolean(KEY_OVERLAY, overlayVisible)
      .putLong(KEY_CAPTURED_BYTES, capturedBytes)
      .apply()
    publish(context)
  }

  fun publish(context: Context, eventType: String = CaptureContract.EVENT_STATUS) {
    context.sendBroadcast(
      Intent(CaptureContract.ACTION_EVENT)
        .setPackage(context.packageName)
        .putExtra(CaptureContract.EXTRA_EVENT_TYPE, eventType),
    )
  }
}
