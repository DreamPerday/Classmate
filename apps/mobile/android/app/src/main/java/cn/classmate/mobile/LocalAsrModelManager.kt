package cn.classmate.mobile

import android.content.Context
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import java.util.zip.ZipInputStream

object LocalAsrModelManager {
  const val MODEL_NAME = "vosk-model-small-cn-0.22"
  const val MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip"
  const val EXPECTED_SIZE = 43_898_754L
  const val EXPECTED_SHA256 = "3af8b0e7e0f835ae9d414ce5df580237a3cfb08d586c9fbbb0f7ff29ad5b14ba"

  private val downloading = AtomicBoolean(false)

  fun modelDirectory(context: Context): File = File(File(context.filesDir, "models"), MODEL_NAME)

  fun isReady(context: Context): Boolean {
    val root = modelDirectory(context)
    return File(root, "am/final.mdl").isFile && File(root, "conf/model.conf").isFile
  }

  fun isDownloading(): Boolean = downloading.get()

  fun download(context: Context, progress: (String, Long, Long) -> Unit) {
    if (!downloading.compareAndSet(false, true)) throw IllegalStateException("model_download_in_progress")
    try {
      if (isReady(context)) {
        progress("ready", EXPECTED_SIZE, EXPECTED_SIZE)
        return
      }

      val modelsRoot = File(context.filesDir, "models").apply { mkdirs() }
      val archive = File(modelsRoot, "$MODEL_NAME.zip.download")
      if (archive.exists()) archive.delete()
      downloadArchive(archive, progress)

      progress("verifying", archive.length(), EXPECTED_SIZE)
      if (archive.length() != EXPECTED_SIZE) throw IllegalStateException("model_size_mismatch")
      if (!sha256(archive).equals(EXPECTED_SHA256, ignoreCase = true)) {
        throw IllegalStateException("model_checksum_mismatch")
      }

      val unpackRoot = File(modelsRoot, ".$MODEL_NAME.unpack")
      if (unpackRoot.exists()) unpackRoot.deleteRecursively()
      unpackRoot.mkdirs()
      progress("unpacking", EXPECTED_SIZE, EXPECTED_SIZE)
      unzip(archive, unpackRoot)

      val unpackedModel = File(unpackRoot, MODEL_NAME)
      if (!File(unpackedModel, "am/final.mdl").isFile || !File(unpackedModel, "conf/model.conf").isFile) {
        throw IllegalStateException("model_layout_invalid")
      }

      val destination = modelDirectory(context)
      if (destination.exists()) destination.deleteRecursively()
      if (!unpackedModel.renameTo(destination)) {
        unpackedModel.copyRecursively(destination, overwrite = true)
      }
      unpackRoot.deleteRecursively()
      archive.delete()
      progress("ready", EXPECTED_SIZE, EXPECTED_SIZE)
    } catch (error: Throwable) {
      val partial = File(File(context.filesDir, "models"), "$MODEL_NAME.zip.download")
      if (partial.exists()) partial.delete()
      throw error
    } finally {
      downloading.set(false)
    }
  }

  fun delete(context: Context) {
    if (downloading.get()) throw IllegalStateException("model_download_in_progress")
    val model = modelDirectory(context)
    if (model.exists()) model.deleteRecursively()
  }

  private fun downloadArchive(target: File, progress: (String, Long, Long) -> Unit) {
    val connection = (URL(MODEL_URL).openConnection() as HttpURLConnection).apply {
      connectTimeout = 20_000
      readTimeout = 60_000
      instanceFollowRedirects = true
      requestMethod = "GET"
      setRequestProperty("Accept-Encoding", "identity")
    }
    try {
      val status = connection.responseCode
      if (status !in 200..299) throw IllegalStateException("model_download_http_$status")
      val total = connection.contentLengthLong
      if (total > 0 && total != EXPECTED_SIZE) throw IllegalStateException("model_remote_size_mismatch")
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
              if (downloaded - lastPublished >= 512 * 1024 || downloaded == EXPECTED_SIZE) {
                progress("downloading", downloaded, EXPECTED_SIZE)
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

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  private fun unzip(archive: File, destination: File) {
    val rootPath = destination.canonicalPath + File.separator
    ZipInputStream(BufferedInputStream(FileInputStream(archive))).use { zip ->
      while (true) {
        val entry = zip.nextEntry ?: break
        val target = File(destination, entry.name)
        if (!target.canonicalPath.startsWith(rootPath)) throw IllegalStateException("model_zip_path_invalid")
        if (entry.isDirectory) {
          target.mkdirs()
        } else {
          target.parentFile?.mkdirs()
          BufferedOutputStream(FileOutputStream(target)).use { output -> zip.copyTo(output) }
        }
        zip.closeEntry()
      }
    }
  }
}
