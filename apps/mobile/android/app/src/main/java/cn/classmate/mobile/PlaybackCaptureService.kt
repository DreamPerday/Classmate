package cn.classmate.mobile

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Process
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineStream
import com.k2fsa.sherpa.onnx.OfflineWhisperModelConfig
import java.io.ByteArrayOutputStream
import java.io.File
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean

class PlaybackCaptureService : Service() {
  companion object {
    private const val CHANNEL_ID = "classmate_system_capture"
    private const val NOTIFICATION_ID = 4107
    private const val SAMPLE_RATE = 16_000
    private const val BYTES_PER_SAMPLE = 2
    private const val SILENCE_THRESHOLD_SAMPLES = 8_000
    private const val MAX_SEGMENT_SAMPLES = SAMPLE_RATE * 30
    private const val SIGNAL_THRESHOLD = 96
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private val finishing = AtomicBoolean(false)
  @Volatile private var running = false
  @Volatile private var requestedStop = false
  private var captureThread: Thread? = null
  private var projection: MediaProjection? = null
  private var audioRecord: AudioRecord? = null
  private var overlay: CaptureOverlayController? = null
  @Volatile private var recognizer: OfflineRecognizer? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      CaptureContract.ACTION_STOP -> requestStop()
      CaptureContract.ACTION_START -> startProjectionCapture(intent)
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    running = false
    runCatching { audioRecord?.stop() }
    overlay?.hide()
    super.onDestroy()
  }

  private fun startProjectionCapture(intent: Intent) {
    if (running || captureThread?.isAlive == true) return
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      notification(getString(R.string.capture_notification_starting)),
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION else 0,
    )

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      finishWithError("capture_requires_android_10")
      return
    }
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      finishWithError("record_audio_permission_required")
      return
    }
    if (!LocalAsrModelManager.isReady(this)) {
      finishWithError("local_asr_model_required")
      return
    }

    val resultCode = intent.getIntExtra(CaptureContract.EXTRA_RESULT_CODE, 0)
    val resultData = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(CaptureContract.EXTRA_RESULT_DATA, Intent::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(CaptureContract.EXTRA_RESULT_DATA)
    }
    if (resultData == null) {
      finishWithError("capture_permission_result_missing")
      return
    }

    val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    val mediaProjection = runCatching { manager.getMediaProjection(resultCode, resultData) }.getOrNull()
    if (mediaProjection == null) {
      finishWithError("capture_projection_unavailable")
      return
    }
    projection = mediaProjection
    mediaProjection.registerCallback(object : MediaProjection.Callback() {
      override fun onStop() {
        if (!finishing.get()) finishWithError("capture_projection_stopped")
      }
    }, mainHandler)

    requestedStop = false
    finishing.set(false)
    running = true
    val showOverlay = intent.getBooleanExtra(CaptureContract.EXTRA_SHOW_OVERLAY, false)
    captureThread = Thread({ runCapture(mediaProjection, showOverlay) }, "classmate-playback-capture").apply { start() }
  }

  private fun runCapture(mediaProjection: MediaProjection, showOverlay: Boolean) {
    Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
    var failure: String? = null
    var record: AudioRecord? = null
    val startedAt = System.currentTimeMillis()
    var capturedBytes = 0L
    var lastPublishAt = 0L
    var heardAudio = false
    val speechBuffer = ByteArrayOutputStream()
    var inSpeech = false
    var silenceSamples = 0
    var segmentStartMs = 0L
    var segmentSampleCount = 0
    try {
      val language = LocalAsrModelManager.getLanguage(this)
      val bundled = LocalAsrModelManager.isBundled(this)
      val modelDir = LocalAsrModelManager.modelDirectory(this)

      fun modelPath(name: String): String =
        if (bundled) "${LocalAsrModelManager.BUNDLED_ASSET_DIR}/$name"
        else File(modelDir, name).absolutePath

      val config = OfflineRecognizerConfig(
        featConfig = FeatureConfig(sampleRate = SAMPLE_RATE, featureDim = 80),
        modelConfig = OfflineModelConfig(
          whisper = OfflineWhisperModelConfig(
            encoder = modelPath("tiny-encoder.int8.onnx"),
            decoder = modelPath("tiny-decoder.int8.onnx"),
            language = language,
            task = "transcribe",
          ),
          tokens = modelPath("tiny-tokens.txt"),
          modelType = "whisper",
          numThreads = 2,
          debug = false,
        ),
      )
      recognizer = if (bundled) OfflineRecognizer(assets, config) else OfflineRecognizer(config = config)

      val captureConfig = android.media.AudioPlaybackCaptureConfiguration.Builder(mediaProjection)
        .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
        .addMatchingUsage(AudioAttributes.USAGE_GAME)
        .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
        .build()
      val format = AudioFormat.Builder()
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .setSampleRate(SAMPLE_RATE)
        .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
        .build()
      val minimum = AudioRecord.getMinBufferSize(
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
      )
      val bufferSize = maxOf(if (minimum > 0) minimum * 4 else 0, 160 * 1024)
      record = AudioRecord.Builder()
        .setAudioPlaybackCaptureConfig(captureConfig)
        .setAudioFormat(format)
        .setBufferSizeInBytes(bufferSize)
        .build()
      if (record.state != AudioRecord.STATE_INITIALIZED) throw IllegalStateException("audio_record_init_failed")
      audioRecord = record
      record.startRecording()

      val overlayController = CaptureOverlayController(this) { requestStop() }
      val overlayVisible = showOverlay && overlayController.show(startedAt)
      overlay = overlayController
      CaptureStateStore.capturing(this, startedAt, overlayVisible)
      updateNotification(getString(R.string.capture_notification_title))

      val buffer = ByteArray(bufferSize)
      while (running) {
        val count = record.read(buffer, 0, buffer.size, AudioRecord.READ_BLOCKING)
        if (count <= 0) {
          if (count == AudioRecord.ERROR_DEAD_OBJECT) throw IllegalStateException("audio_device_lost")
          continue
        }
        capturedBytes += count
        val hasSig = hasSignal(buffer, count)
        if (!heardAudio && hasSig) heardAudio = true

        if (!inSpeech) {
          if (hasSig) {
            inSpeech = true
            speechBuffer.reset()
            speechBuffer.write(buffer, 0, count)
            silenceSamples = 0
            segmentSampleCount = count / BYTES_PER_SAMPLE
            segmentStartMs = durationMs(capturedBytes - count)
          }
        } else {
          speechBuffer.write(buffer, 0, count)
          segmentSampleCount += count / BYTES_PER_SAMPLE
          if (hasSig) {
            silenceSamples = 0
          } else {
            silenceSamples += count / BYTES_PER_SAMPLE
          }

          if (silenceSamples >= SILENCE_THRESHOLD_SAMPLES) {
            val samples = bytesToShorts(speechBuffer.toByteArray())
            recognizeSegment(samples, startedAt, segmentStartMs, durationMs(capturedBytes - silenceSamples * BYTES_PER_SAMPLE.toLong()))
            speechBuffer.reset()
            inSpeech = false
            silenceSamples = 0
            segmentSampleCount = 0
          } else if (segmentSampleCount >= MAX_SEGMENT_SAMPLES) {
            val samples = bytesToShorts(speechBuffer.toByteArray())
            recognizeSegment(samples, startedAt, segmentStartMs, durationMs(segmentStartMs + segmentSampleCount * 1000L / SAMPLE_RATE))
            speechBuffer.reset()
            inSpeech = false
            silenceSamples = 0
            segmentSampleCount = 0
          }
        }

        val now = System.currentTimeMillis()
        if (now - lastPublishAt >= 750L) {
          val partial = if (inSpeech) "识别中…" else ""
          val phase = if (!heardAudio && now - startedAt >= 5_000L) "silent" else "capturing"
          CaptureStateStore.progress(this, phase, partial, capturedBytes)
          overlayController.updateProgress(partial, capturedBytes, heardAudio)
          lastPublishAt = now
        }
      }

      if (inSpeech && speechBuffer.size() > 0) {
        val samples = bytesToShorts(speechBuffer.toByteArray())
        recognizeSegment(samples, startedAt, segmentStartMs, durationMs(capturedBytes))
      }
    } catch (error: SecurityException) {
      failure = "capture_not_permitted"
    } catch (error: Throwable) {
      failure = when (error.message) {
        "audio_record_init_failed" -> "audio_record_init_failed"
        "audio_device_lost" -> "audio_device_lost"
        else -> "capture_runtime_failed"
      }
    } finally {
      runCatching { record?.stop() }
      runCatching { record?.release() }
      runCatching { recognizer?.release() }
      audioRecord = null
      recognizer = null
      val finalFailure = if (requestedStop) null else failure
      mainHandler.post { finishCapture(finalFailure) }
    }
  }

  private fun recognizeSegment(samples: ShortArray, startedAt: Long, startMs: Long, endMs: Long) {
    if (samples.isEmpty()) return
    val rec = recognizer ?: return
    var stream: OfflineStream? = null
    try {
      stream = rec.createStream()
      val floats = FloatArray(samples.size) { samples[it] / 32768.0f }
      stream.acceptWaveform(floats, SAMPLE_RATE)
      rec.decode(stream)
      val text = rec.getResult(stream).text.trim()
      if (text.isEmpty()) return
      val safeEnd = maxOf(endMs, startMs + 1L)
      PendingSegmentStore.add(
        this,
        CaptureSegment(
          id = "capture_${startedAt}_$safeEnd",
          text = text,
          startMs = startMs,
          endMs = safeEnd,
          createdAt = Instant.ofEpochMilli(startedAt + safeEnd).toString(),
        ),
      )
    } catch (error: Throwable) {
      // Skip segment on recognition error, continue capturing
    } finally {
      runCatching { stream?.release() }
    }
  }

  private fun requestStop() {
    requestedStop = true
    running = false
    runCatching { audioRecord?.stop() }
    if (captureThread?.isAlive != true) finishCapture(null)
  }

  private fun finishWithError(code: String) {
    requestedStop = false
    running = false
    finishCapture(code)
  }

  private fun finishCapture(errorCode: String?) {
    if (!finishing.compareAndSet(false, true)) return
    running = false
    overlay?.hide()
    overlay = null
    runCatching { projection?.stop() }
    projection = null
    captureThread = null
    if (errorCode == null) CaptureStateStore.idle(this) else CaptureStateStore.failed(this, errorCode)
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun durationMs(capturedBytes: Long): Long =
    capturedBytes * 1_000L / (SAMPLE_RATE * BYTES_PER_SAMPLE)

  private fun hasSignal(buffer: ByteArray, count: Int): Boolean {
    var index = 0
    while (index + 1 < count) {
      val sample = ((buffer[index + 1].toInt() shl 8) or (buffer[index].toInt() and 0xff)).toShort().toInt()
      if (kotlin.math.abs(sample) >= SIGNAL_THRESHOLD) return true
      index += 2
    }
    return false
  }

  private fun bytesToShorts(bytes: ByteArray): ShortArray {
    val shorts = ShortArray(bytes.size / 2)
    var i = 0
    while (i + 1 < bytes.size) {
      shorts[i / 2] = ((bytes[i + 1].toInt() shl 8) or (bytes[i].toInt() and 0xff)).toShort()
      i += 2
    }
    return shorts
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      getString(R.string.capture_channel_name),
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = getString(R.string.capture_channel_description)
      setSound(null, null)
      enableVibration(false)
    }
    (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
  }

  private fun notification(content: String): Notification {
    val openIntent = PendingIntent.getActivity(
      this,
      1,
      Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val stopIntent = PendingIntent.getService(
      this,
      2,
      Intent(this, PlaybackCaptureService::class.java).setAction(CaptureContract.ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle(getString(R.string.capture_notification_title))
      .setContentText(content)
      .setContentIntent(openIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .addAction(android.R.drawable.ic_media_pause, getString(R.string.capture_notification_stop), stopIntent)
      .build()
  }

  private fun updateNotification(content: String) {
    (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
      .notify(NOTIFICATION_ID, notification(content))
  }
}
