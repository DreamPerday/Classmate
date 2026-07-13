package cn.classmate.mobile

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.Executors

class SystemCaptureModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newSingleThreadExecutor()
  private var receiverRegistered = false
  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(receiverContext: Context?, intent: Intent?) {
      when (intent?.getStringExtra(CaptureContract.EXTRA_EVENT_TYPE)) {
        CaptureContract.EVENT_SEGMENT -> {
          val segment = PendingSegmentStore.list(context).lastOrNull()
          if (segment != null) emit("systemCaptureSegment", segmentMap(segment))
          emit("systemCaptureStatus", statusMap())
        }
        else -> emit("systemCaptureStatus", statusMap())
      }
    }
  }

  init {
    ContextCompat.registerReceiver(
      context,
      receiver,
      IntentFilter(CaptureContract.ACTION_EVENT),
      ContextCompat.RECEIVER_NOT_EXPORTED,
    )
    receiverRegistered = true
  }

  override fun getName(): String = "SystemCapture"

  override fun invalidate() {
    if (receiverRegistered) runCatching { context.unregisterReceiver(receiver) }
    receiverRegistered = false
    executor.shutdownNow()
    super.invalidate()
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    promise.resolve(statusMap())
  }

  @ReactMethod
  fun requestCapture(showOverlay: Boolean, promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      promise.reject("UNSUPPORTED", "capture_requires_android_10")
      return
    }
    if (!LocalAsrModelManager.isReady(context)) {
      promise.reject("MODEL_REQUIRED", "local_asr_model_required")
      return
    }
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("RECORD_PERMISSION_REQUIRED", "record_audio_permission_required")
      return
    }
    if (CaptureStateStore.snapshot(context).active) {
      promise.resolve(statusMap())
      return
    }
    val intent = Intent(context, CapturePermissionActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      putExtra(CaptureContract.EXTRA_SHOW_OVERLAY, showOverlay)
    }
    runCatching { context.startActivity(intent) }
      .onSuccess { promise.resolve(statusMap()) }
      .onFailure { promise.reject("CAPTURE_REQUEST_FAILED", "capture_permission_activity_failed") }
  }

  @ReactMethod
  fun stopCapture(promise: Promise) {
    val intent = Intent(context, PlaybackCaptureService::class.java).setAction(CaptureContract.ACTION_STOP)
    runCatching { context.startService(intent) }
      .onSuccess { promise.resolve(true) }
      .onFailure { promise.reject("CAPTURE_STOP_FAILED", "capture_stop_failed") }
  }

  @ReactMethod
  fun requestOverlayPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)) {
      promise.resolve(true)
      return
    }
    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${context.packageName}"),
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
      .onSuccess { promise.resolve(false) }
      .onFailure { promise.reject("OVERLAY_REQUEST_FAILED", "overlay_settings_unavailable") }
  }

  @ReactMethod
  fun downloadModel(promise: Promise) {
    executor.execute {
      runCatching {
        LocalAsrModelManager.download(context) { phase, downloaded, total ->
          val payload = Arguments.createMap().apply {
            putString("phase", phase)
            putDouble("downloaded", downloaded.toDouble())
            putDouble("total", total.toDouble())
          }
          emit("systemCaptureModelProgress", payload)
        }
        statusMap()
      }.onSuccess { promise.resolve(it) }
        .onFailure { promise.reject("MODEL_DOWNLOAD_FAILED", it.message ?: "model_download_failed") }
    }
  }

  @ReactMethod
  fun deleteModel(promise: Promise) {
    executor.execute {
      runCatching {
        LocalAsrModelManager.delete(context)
        statusMap()
      }.onSuccess { promise.resolve(it) }
        .onFailure { promise.reject("MODEL_DELETE_FAILED", it.message ?: "model_delete_failed") }
    }
  }

  @ReactMethod
  fun listPendingSegments(promise: Promise) {
    val values = Arguments.createArray()
    PendingSegmentStore.list(context).forEach { values.pushMap(segmentMap(it)) }
    promise.resolve(values)
  }

  @ReactMethod
  fun acknowledgeSegment(id: String, promise: Promise) {
    PendingSegmentStore.acknowledge(context, id)
    promise.resolve(true)
  }

  @ReactMethod
  fun setAsrLanguage(language: String, promise: Promise) {
    LocalAsrModelManager.setLanguage(context, language)
    promise.resolve(true)
  }

  @ReactMethod
  fun getAsrLanguage(promise: Promise) {
    promise.resolve(LocalAsrModelManager.getLanguage(context))
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  private fun statusMap(): WritableMap {
    val snapshot = CaptureStateStore.snapshot(context)
    val pending = PendingSegmentStore.list(context)
    val elapsed = if (snapshot.active && snapshot.startedAt > 0L) {
      (System.currentTimeMillis() - snapshot.startedAt).coerceAtLeast(0L)
    } else 0L
    return Arguments.createMap().apply {
      putBoolean("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
      putDouble("apiLevel", Build.VERSION.SDK_INT.toDouble())
      putBoolean("modelReady", LocalAsrModelManager.isReady(context))
      putBoolean("modelBundled", LocalAsrModelManager.isBundled(context))
      putBoolean("modelDownloading", LocalAsrModelManager.isDownloading())
      putString("modelName", LocalAsrModelManager.MODEL_NAME)
      putDouble("modelSize", LocalAsrModelManager.EXPECTED_SIZE.toDouble())
      putString("asrLanguage", LocalAsrModelManager.getLanguage(context))
      putBoolean("overlayGranted", Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Settings.canDrawOverlays(context))
      putBoolean("overlayVisible", snapshot.overlayVisible)
      putBoolean("active", snapshot.active)
      putString("phase", snapshot.phase)
      putDouble("startedAt", snapshot.startedAt.toDouble())
      putDouble("elapsedMs", elapsed.toDouble())
      putString("partialText", snapshot.partialText)
      putString("error", snapshot.error)
      putDouble("capturedBytes", snapshot.capturedBytes.toDouble())
      putInt("pendingSegments", pending.size)
    }
  }

  private fun segmentMap(segment: CaptureSegment): WritableMap = Arguments.createMap().apply {
    putString("id", segment.id)
    putString("text", segment.text)
    putDouble("startMs", segment.startMs.toDouble())
    putDouble("endMs", segment.endMs.toDouble())
    putString("createdAt", segment.createdAt)
  }

  private fun emit(eventName: String, payload: WritableMap) {
    if (!context.hasActiveReactInstance()) return
    context.runOnJSQueueThread {
      runCatching {
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(eventName, payload)
      }
    }
  }
}
