package cn.classmate.mobile

import android.content.Context
import android.content.res.AssetManager
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

object LocalAsrModelManager {
  const val MODEL_NAME = "sherpa-onnx-whisper-tiny"
  const val EXPECTED_SIZE = 102_000_000L
  const val BUNDLED_ASSET_DIR = "sherpa-onnx-whisper-tiny"

  private const val HF_BASE = "https://hf-mirror.com/csukuangfj/sherpa-onnx-whisper-tiny/resolve/main"
  private const val PREFS_NAME = "classmate_prefs"
  private const val KEY_ASR_LANGUAGE = "asr_language"
  const val DEFAULT_LANGUAGE = "zh"

  private data class ModelFile(val name: String, val url: String, val minSize: Long)

  private val MODEL_FILES = listOf(
    ModelFile("tiny-encoder.int8.onnx", "$HF_BASE/tiny-encoder.int8.onnx", 9_000_000L),
    ModelFile("tiny-decoder.int8.onnx", "$HF_BASE/tiny-decoder.int8.onnx", 80_000_000L),
    ModelFile("tiny-tokens.txt", "$HF_BASE/tiny-tokens.txt", 1_000L),
  )

  private val downloading = AtomicBoolean(false)

  fun modelDirectory(context: Context): File = File(File(context.filesDir, "models"), MODEL_NAME)

  fun isBundled(context: Context): Boolean {
    val am = context.assets
    return MODEL_FILES.all { file ->
      runCatching { am.open("$BUNDLED_ASSET_DIR/${file.name}").use { it.available() > 0 } }.getOrDefault(false)
    }
  }

  fun isReady(context: Context): Boolean {
    if (isBundled(context)) return true
    val root = modelDirectory(context)
    return MODEL_FILES.all { file ->
      val f = File(root, file.name)
      f.isFile && f.length() >= file.minSize
    }
  }

  fun isDownloading(): Boolean = downloading.get()

  fun getLanguage(context: Context): String {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    return prefs.getString(KEY_ASR_LANGUAGE, DEFAULT_LANGUAGE) ?: DEFAULT_LANGUAGE
  }

  fun setLanguage(context: Context, language: String) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_ASR_LANGUAGE, language)
      .apply()
  }

  fun assetPaths(): List<String> = MODEL_FILES.map { "$BUNDLED_ASSET_DIR/${it.name}" }

  fun download(context: Context, progress: (String, Long, Long) -> Unit) {
    if (isBundled(context)) {
      progress("ready", EXPECTED_SIZE, EXPECTED_SIZE)
      return
    }
    if (!downloading.compareAndSet(false, true)) throw IllegalStateException("model_download_in_progress")
    try {
      if (isReady(context)) {
        progress("ready", EXPECTED_SIZE, EXPECTED_SIZE)
        return
      }

      val root = modelDirectory(context)
      root.mkdirs()

      val totalEstimated = EXPECTED_SIZE
      var downloadedAccumulated = 0L

      for (modelFile in MODEL_FILES) {
        val target = File(root, modelFile.name)
        if (target.isFile && target.length() >= modelFile.minSize) {
          downloadedAccumulated += target.length()
          progress("downloading", downloadedAccumulated, totalEstimated)
          continue
        }

        val fileStartOffset = downloadedAccumulated
        downloadFile(modelFile.url, target) { fileDownloaded ->
          progress("downloading", fileStartOffset + fileDownloaded, totalEstimated)
        }

        if (target.length() < modelFile.minSize) {
          throw IllegalStateException("model_file_too_small_${modelFile.name}_${target.length()}_need_${modelFile.minSize}")
        }

        downloadedAccumulated += target.length()
      }

      progress("verifying", EXPECTED_SIZE, EXPECTED_SIZE)
      if (!isReady(context)) throw IllegalStateException("model_verification_failed")
      progress("ready", EXPECTED_SIZE, EXPECTED_SIZE)
    } catch (error: Throwable) {
      throw error
    } finally {
      downloading.set(false)
    }
  }

  fun delete(context: Context) {
    if (isBundled(context)) return
    if (downloading.get()) throw IllegalStateException("model_download_in_progress")
    val model = modelDirectory(context)
    if (model.exists()) model.deleteRecursively()
  }

  private fun downloadFile(url: String, target: File, progress: (Long) -> Unit) {
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 30_000
      readTimeout = 120_000
      instanceFollowRedirects = true
      requestMethod = "GET"
      setRequestProperty("Accept-Encoding", "identity")
    }
    try {
      val status = connection.responseCode
      if (status !in 200..299) throw IllegalStateException("model_download_http_$status")
      val total = connection.contentLengthLong
      connection.inputStream.use { input ->
        BufferedInputStream(input).use { bufferedInput ->
          BufferedOutputStream(FileOutputStream(target)).use { output ->
            val buffer = ByteArray(64 * 1024)
            var downloaded = 0L
            var lastPublished = 0L
            while (true) {
              val count = bufferedInput.read(buffer)
              if (count < 0) break
              output.write(buffer, 0, count)
              downloaded += count
              if (downloaded - lastPublished >= 512 * 1024 || (total > 0 && downloaded == total)) {
                progress(downloaded)
                lastPublished = downloaded
              }
            }
          }
        }
      }
    } finally {
      connection.disconnect()
    }
  }
}
