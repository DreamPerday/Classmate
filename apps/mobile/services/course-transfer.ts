import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { exportCourse, importCourse, type CourseExportPayload, type ImportOptions } from "./database";

export async function exportCourseToFile(courseId: string, courseName: string) {
  const payload = await exportCourse(courseId);
  const json = JSON.stringify(payload, null, 2);
  const directory = `${FileSystem.documentDirectory}exports/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const safeName = courseName.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 60) || "course";
  const date = new Date().toISOString().slice(0, 10);
  const uri = `${directory}${safeName}-${date}.json`;
  await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
  if (!await Sharing.isAvailableAsync()) throw new Error("当前设备不支持系统分享");
  await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "导出课程文件", UTI: "public.json" });
  return { uri, sessionCount: payload.sessions.length };
}

export async function pickCourseFile(): Promise<CourseExportPayload | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  const file = result.assets[0]!;
  const content = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
  const payload = JSON.parse(content) as CourseExportPayload;
  if (!payload || payload.format !== "classmate-course" || !Array.isArray(payload.sessions)) {
    throw new Error("文件不是有效的 Classmate 课程包");
  }
  return payload;
}

export async function importCourseFromPayload(payload: CourseExportPayload, options: ImportOptions) {
  return importCourse(payload, options);
}
