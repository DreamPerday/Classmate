package cn.classmate.mobile

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.abs

class CaptureOverlayController(
  private val service: PlaybackCaptureService,
  private val onStop: () -> Unit,
) {
  private val handler = Handler(Looper.getMainLooper())
  private val windowManager = service.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  private var root: LinearLayout? = null
  private var timer: TextView? = null
  private var preview: TextView? = null
  private var bytesView: TextView? = null
  private var indicator: TextView? = null
  private var expandButton: TextView? = null
  private var params: WindowManager.LayoutParams? = null
  private var startedAt = 0L
  private var minimized = false
  private var expanded = false

  private val ticker = object : Runnable {
    override fun run() {
      updateTimer()
      if (root != null) handler.postDelayed(this, 1_000L)
    }
  }

  fun show(startedAt: Long): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || !Settings.canDrawOverlays(service)) return false
    if (root != null) return true
    this.startedAt = startedAt

    val latch = java.util.concurrent.CountDownLatch(1)
    var result = false
    handler.post {
      result = runCatching {
        val container = LinearLayout(service).apply {
          orientation = LinearLayout.VERTICAL
          elevation = dp(8).toFloat()
          background = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(7).toFloat()
            setColor(Color.rgb(250, 252, 250))
            setStroke(dp(1), Color.rgb(201, 211, 203))
          }
        }

        val row = LinearLayout(service).apply {
          orientation = LinearLayout.HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          setPadding(dp(12), dp(6), dp(4), dp(6))
        }

        val indicatorView = TextView(service).apply {
          text = "\u25CF"
          textSize = 13f
          setTextColor(Color.rgb(170, 180, 175))
          setPadding(0, 0, dp(6), 0)
          contentDescription = service.getString(R.string.capture_overlay_signal)
        }
        val timerView = TextView(service).apply {
          minWidth = dp(88)
          gravity = Gravity.CENTER_VERTICAL
          setTextColor(Color.rgb(40, 97, 78))
          textSize = 14f
          contentDescription = service.getString(R.string.capture_overlay_open)
          setPadding(0, 0, dp(8), 0)
        }
        val bytesTextView = TextView(service).apply {
          minWidth = dp(54)
          gravity = Gravity.CENTER_VERTICAL
          setTextColor(Color.rgb(120, 134, 126))
          textSize = 11f
          setPadding(0, 0, dp(6), 0)
        }
        val expandView = TextView(service).apply {
          width = dp(32)
          height = dp(40)
          gravity = Gravity.CENTER
          text = "\u25BC"
          textSize = 12f
          setTextColor(Color.rgb(120, 134, 126))
          contentDescription = service.getString(R.string.capture_overlay_expand)
          setOnClickListener { toggleExpand() }
        }
        val stopView = TextView(service).apply {
          width = dp(44)
          height = dp(44)
          gravity = Gravity.CENTER
          text = "\u25A0"
          textSize = 17f
          setTextColor(Color.rgb(181, 68, 51))
          contentDescription = service.getString(R.string.capture_overlay_stop)
          setOnClickListener { onStop() }
        }
        row.addView(indicatorView)
        row.addView(timerView)
        row.addView(bytesTextView)
        row.addView(expandView)
        row.addView(stopView)

        val previewView = TextView(service).apply {
          maxWidth = dp(260)
          setTextColor(Color.rgb(70, 84, 76))
          textSize = 12f
          setPadding(dp(12), 0, dp(12), dp(8))
          setSingleLine(true)
          ellipsize = android.text.TextUtils.TruncateAt.END
          visibility = View.GONE
          contentDescription = service.getString(R.string.capture_overlay_preview)
        }

        container.addView(row)
        container.addView(previewView)

        val layoutParams = WindowManager.LayoutParams(
          WindowManager.LayoutParams.WRAP_CONTENT,
          WindowManager.LayoutParams.WRAP_CONTENT,
          WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
          PixelFormat.TRANSLUCENT,
        ).apply {
          gravity = Gravity.TOP or Gravity.START
          x = dp(18)
          y = dp(150)
        }
        installDrag(timerView, container, layoutParams)
        installDrag(indicatorView, container, layoutParams)
        installDrag(bytesTextView, container, layoutParams)

        windowManager.addView(container, layoutParams)
        root = container
        timer = timerView
        preview = previewView
        bytesView = bytesTextView
        indicator = indicatorView
        expandButton = expandView
        params = layoutParams
        updateTimer()
        handler.postDelayed(ticker, 1_000L)
        true
      }.getOrDefault(false)
      latch.countDown()
    }
    latch.await(2, java.util.concurrent.TimeUnit.SECONDS)
    return result
  }

  fun updateProgress(partialText: String, capturedBytes: Long, hasSignal: Boolean) {
    handler.post {
      if (root == null) return@post
      bytesView?.text = formatBytes(capturedBytes)
      indicator?.setTextColor(if (hasSignal) Color.rgb(64, 145, 108) else Color.rgb(170, 180, 175))
      val trimmed = partialText.trim()
      if (trimmed.isNotEmpty() && expanded) {
        preview?.text = trimmed
        preview?.visibility = View.VISIBLE
      } else if (!expanded) {
        preview?.visibility = View.GONE
      }
    }
  }

  private fun toggleExpand() {
    expanded = !expanded
    expandButton?.text = if (expanded) "\u25B2" else "\u25BC"
    preview?.visibility = if (expanded && preview?.text?.isNotEmpty() == true) View.VISIBLE else View.GONE
  }

  private fun toggleMinimize() {
    minimized = !minimized
    handler.post {
      val currentParams = params ?: return@post
      if (minimized) {
        timer?.visibility = View.GONE
        bytesView?.visibility = View.GONE
        expandButton?.visibility = View.GONE
        preview?.visibility = View.GONE
        indicator?.contentDescription = service.getString(R.string.capture_overlay_restore)
      } else {
        timer?.visibility = View.VISIBLE
        bytesView?.visibility = View.VISIBLE
        expandButton?.visibility = View.VISIBLE
        indicator?.contentDescription = service.getString(R.string.capture_overlay_signal)
      }
      runCatching { windowManager.updateViewLayout(root, currentParams) }
    }
  }

  fun hide() {
    handler.removeCallbacks(ticker)
    val currentRoot = root
    root = null
    timer = null
    preview = null
    bytesView = null
    indicator = null
    expandButton = null
    params = null
    if (currentRoot != null) {
      handler.post { runCatching { windowManager.removeView(currentRoot) } }
    }
  }

  private fun updateTimer() {
    val elapsed = ((System.currentTimeMillis() - startedAt).coerceAtLeast(0L) / 1_000L)
    val minutes = elapsed / 60L
    val seconds = elapsed % 60L
    timer?.text = "%02d:%02d".format(minutes, seconds)
  }

  private fun formatBytes(bytes: Long): String {
    val kb = bytes / 1024.0
    val mb = kb / 1024.0
    return when {
      mb >= 1.0 -> "%.1fMB".format(mb)
      kb >= 1.0 -> "${kb.toInt()}KB"
      else -> "${bytes}B"
    }
  }

  private fun openApplication() {
    val intent = Intent(service, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    service.startActivity(intent)
  }

  private fun installDrag(touchView: View, rootView: View, layoutParams: WindowManager.LayoutParams) {
    val slop = ViewConfiguration.get(service).scaledTouchSlop
    var startX = 0
    var startY = 0
    var touchX = 0f
    var touchY = 0f
    var moved = false
    touchView.setOnTouchListener { _, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          startX = layoutParams.x
          startY = layoutParams.y
          touchX = event.rawX
          touchY = event.rawY
          moved = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val deltaX = (event.rawX - touchX).toInt()
          val deltaY = (event.rawY - touchY).toInt()
          moved = moved || abs(deltaX) > slop || abs(deltaY) > slop
          if (moved) {
            layoutParams.x = startX + deltaX
            layoutParams.y = startY + deltaY
            runCatching { windowManager.updateViewLayout(rootView, layoutParams) }
            true
          }
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!moved) openApplication()
          true
        }
        else -> true
      }
    }
  }

  private fun dp(value: Int): Int = (value * service.resources.displayMetrics.density).toInt()
}
