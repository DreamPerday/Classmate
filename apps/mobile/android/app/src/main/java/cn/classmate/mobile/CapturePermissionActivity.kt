package cn.classmate.mobile

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import androidx.core.content.ContextCompat

class CapturePermissionActivity : Activity() {
  companion object {
    private const val REQUEST_CAPTURE = 7401
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != REQUEST_CAPTURE) return
    if (resultCode != RESULT_OK || data == null) {
      CaptureStateStore.failed(this, "capture_permission_denied")
      finish()
      return
    }

    val serviceIntent = Intent(this, PlaybackCaptureService::class.java).apply {
      action = CaptureContract.ACTION_START
      putExtra(CaptureContract.EXTRA_RESULT_CODE, resultCode)
      putExtra(CaptureContract.EXTRA_RESULT_DATA, data)
      putExtra(CaptureContract.EXTRA_SHOW_OVERLAY, intent.getBooleanExtra(CaptureContract.EXTRA_SHOW_OVERLAY, false))
    }
    runCatching { ContextCompat.startForegroundService(this, serviceIntent) }
      .onFailure { CaptureStateStore.failed(this, "capture_service_start_failed") }
    finish()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (savedInstanceState != null) return
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      CaptureStateStore.failed(this, "capture_requires_android_10")
      finish()
      return
    }
    CaptureStateStore.requesting(this)
    val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    @Suppress("DEPRECATION")
    startActivityForResult(manager.createScreenCaptureIntent(), REQUEST_CAPTURE)
  }
}
