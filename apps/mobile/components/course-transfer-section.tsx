import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "@/components/ui/action-button";
import { LoadingState } from "@/components/ui/states";
import { colors, spacing } from "@/constants/theme";
import { listCourses } from "@/services/database";
import { exportCourseToFile, importCourseFromPayload, pickCourseFile } from "@/services/course-transfer";
import type { CourseExportPayload } from "@/services/database";

type ImportMode = "new" | "merge";

export function CourseTransferSection() {
  const queryClient = useQueryClient();
  const courses = useQuery({ queryKey: ["mobile-courses"], queryFn: listCourses });
  const [importPayload, setImportPayload] = useState<CourseExportPayload | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("new");
  const [newCourseName, setNewCourseName] = useState("");
  const [targetCourseId, setTargetCourseId] = useState("");
  const [order, setOrder] = useState<number[]>([]);

  const exportMut = useMutation({
    mutationFn: ({ courseId, name }: { courseId: string; name: string }) => exportCourseToFile(courseId, name),
    onSuccess: (data) => {
      Alert.alert("导出成功", `已生成课程文件，包含 ${data.sessionCount} 个课次。`);
    },
    onError: (error: any) => Alert.alert("导出失败", error?.message || "无法导出课程"),
  });

  const pickFile = useMutation({
    mutationFn: async () => {
      const payload = await pickCourseFile();
      return payload;
    },
    onSuccess: (payload) => {
      if (!payload) return;
      setImportPayload(payload);
      setNewCourseName(payload.course.name);
      setImportMode("new");
      setTargetCourseId("");
      setOrder(payload.sessions.map((_, i) => i));
    },
    onError: (error: any) => Alert.alert("选择文件失败", error?.message || "无法读取所选文件"),
  });

  const confirmImport = useMutation({
    mutationFn: async () => {
      if (!importPayload) throw new Error("没有可导入的课程");
      const options = importMode === "merge"
        ? { mode: "merge" as const, targetCourseId, sessionOrder: order }
        : { mode: "new" as const, newCourseName: newCourseName.trim() || importPayload.course.name, sessionOrder: order };
      return importCourseFromPayload(importPayload, options);
    },
    onSuccess: (result) => {
      Alert.alert("导入成功", `已导入 ${result.sessionCount} 个课次。`);
      setImportPayload(null);
      queryClient.invalidateQueries({ queryKey: ["mobile-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-courses"] });
    },
    onError: (error: any) => Alert.alert("导入失败", error?.message || "无法导入课程"),
  });

  function moveUp(index: number) {
    if (index <= 0) return;
    setOrder(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }
  function moveDown(index: number) {
    setOrder(prev => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  if (courses.isLoading) return <LoadingState />;

  return <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Ionicons name="swap-horizontal-outline" size={20} color={colors.primary} />
      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>课程移植</Text>
        <Text style={styles.sectionHint}>导出课程到文件，或从文件导入并合并到现有课程。支持课次重排。</Text>
      </View>
    </View>

    <Text style={styles.subTitle}>导出课程</Text>
    {courses.data && courses.data.length > 0 ? courses.data.map(course => (
      <View key={course.id} style={styles.courseRow}>
        <View style={styles.courseInfo}>
          <Text style={styles.courseName} numberOfLines={1}>{course.name}</Text>
        </View>
        <ActionButton
          label="导出"
          icon="download-outline"
          variant="secondary"
          busy={exportMut.isPending && exportMut.variables?.courseId === course.id}
          onPress={() => exportMut.mutate({ courseId: course.id, name: course.name })}
        />
      </View>
    )) : <Text style={styles.empty}>暂无课程可导出</Text>}

    <Text style={styles.subTitle}>导入课程</Text>
    <ActionButton
      label="选择课程文件"
      icon="document-attach-outline"
      variant="secondary"
      busy={pickFile.isPending}
      onPress={() => pickFile.mutate()}
      disabled={pickFile.isPending}
    />

    <Modal visible={!!importPayload} animationType="slide" transparent={false} onRequestClose={() => setImportPayload(null)}>
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Pressable onPress={() => setImportPayload(null)} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.modalTitle}>导入课程</Text>
          <View style={{ width: 24 }} />
        </View>
        {importPayload ? <ScrollView contentContainerStyle={styles.modalBody}>
          <View style={styles.previewCard}>
            <Text style={styles.previewName}>{importPayload.course.name}</Text>
            <Text style={styles.previewMeta}>
              {importPayload.sessions.length} 个课次 · {importPayload.knowledgeNodes.length} 个知识节点 · {importPayload.knowledgeEdges.length} 条关系
            </Text>
            <Text style={styles.previewDetail}>
              共 {importPayload.sessions.reduce((sum, s) => sum + s.transcripts.length, 0)} 条字幕、{importPayload.sessions.reduce((sum, s) => sum + s.events.length, 0)} 个事件、{importPayload.sessions.reduce((sum, s) => sum + s.tasks.length, 0)} 个任务
            </Text>
          </View>

          <Text style={styles.fieldLabel}>导入方式</Text>
          <View style={styles.modeRow}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: importMode === "new" }}
              onPress={() => setImportMode("new")}
              style={[styles.modeBtn, importMode === "new" && styles.modeBtnActive]}
            >
              <Text style={[styles.modeText, importMode === "new" && styles.modeTextActive]}>作为新课程</Text>
            </Pressable>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: importMode === "merge" }}
              onPress={() => setImportMode("merge")}
              style={[styles.modeBtn, importMode === "merge" && styles.modeBtnActive]}
            >
              <Text style={[styles.modeText, importMode === "merge" && styles.modeTextActive]}>合并到现有</Text>
            </Pressable>
          </View>

          {importMode === "new" ? (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>新课程名称</Text>
              <TextInput
                value={newCourseName}
                onChangeText={setNewCourseName}
                placeholder="输入课程名称"
                placeholderTextColor="#909891"
                style={styles.input}
              />
            </View>
          ) : (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>目标课程</Text>
              {(courses.data ?? []).length === 0 ? (
                <Text style={styles.empty}>没有可选的目标课程</Text>
              ) : (
                <ScrollView style={styles.targetList} nestedScrollEnabled>
                  {(courses.data ?? []).map(course => (
                    <Pressable
                      key={course.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: targetCourseId === course.id }}
                      onPress={() => setTargetCourseId(course.id)}
                      style={[styles.targetRow, targetCourseId === course.id && styles.targetRowActive]}
                    >
                      <Ionicons
                        name={targetCourseId === course.id ? "radio-button-on" : "radio-button-off"}
                        size={17}
                        color={targetCourseId === course.id ? colors.primary : colors.muted}
                      />
                      <Text style={[styles.targetName, targetCourseId === course.id && styles.targetNameActive]}>{course.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          <Text style={styles.fieldLabel}>课次排序（可调整）</Text>
          <View style={styles.orderList}>
            {order.map((originalIdx, position) => {
              const session = importPayload.sessions[originalIdx]!;
              return (
                <View key={`order-${position}`} style={styles.orderRow}>
                  <Text style={styles.orderPosition}>第 {position + 1} 位</Text>
                  <View style={styles.orderInfo}>
                    <Text style={styles.orderTitle} numberOfLines={1}>{session.title}</Text>
                    <Text style={styles.orderMeta}>{session.transcripts.length} 字幕 · {session.events.length} 事件</Text>
                  </View>
                  <View style={styles.orderActions}>
                    <Pressable onPress={() => moveUp(position)} disabled={position === 0} hitSlop={8}>
                      <Ionicons name="arrow-up" size={18} color={position === 0 ? colors.line : colors.primary} />
                    </Pressable>
                    <Pressable onPress={() => moveDown(position)} disabled={position === order.length - 1} hitSlop={8}>
                      <Ionicons name="arrow-down" size={18} color={position === order.length - 1 ? colors.line : colors.primary} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.modalFooter}>
            <ActionButton
              label="取消"
              icon="close-outline"
              variant="secondary"
              onPress={() => setImportPayload(null)}
              disabled={confirmImport.isPending}
            />
            <ActionButton
              label="确认导入"
              icon="cloud-download-outline"
              busy={confirmImport.isPending}
              disabled={confirmImport.isPending || (importMode === "merge" && !targetCourseId)}
              onPress={() => confirmImport.mutate()}
            />
          </View>
        </ScrollView> : null}
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  section: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 14, marginBottom: 16 },
  sectionHeader: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 14 },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.ink },
  sectionHint: { marginTop: 3, fontSize: 10, lineHeight: 16, color: colors.muted },
  subTitle: { fontSize: 12, fontWeight: "700", color: colors.ink, marginTop: 12, marginBottom: 8 },
  courseRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  courseInfo: { flex: 1 },
  courseName: { fontSize: 13, color: colors.ink },
  empty: { fontSize: 11, color: colors.muted, paddingVertical: 8 },
  modalRoot: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface },
  modalTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  modalBody: { padding: spacing.md, paddingBottom: 48 },
  previewCard: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 14, marginBottom: 16, backgroundColor: colors.surface },
  previewName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  previewMeta: { marginTop: 6, fontSize: 11, color: colors.primary },
  previewDetail: { marginTop: 4, fontSize: 10, lineHeight: 16, color: colors.muted },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: colors.ink, marginBottom: 7 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 12, fontSize: 13, color: colors.ink },
  modeRow: { flexDirection: "row", gap: 0, borderWidth: 1, borderColor: colors.line, borderRadius: 7, overflow: "hidden", marginBottom: 4 },
  modeBtn: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  modeBtnActive: { backgroundColor: colors.primary },
  modeText: { fontSize: 12, fontWeight: "600", color: colors.muted },
  modeTextActive: { color: "#fff" },
  targetList: { maxHeight: 200, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface },
  targetRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  targetRowActive: { backgroundColor: colors.primarySoft },
  targetName: { flex: 1, fontSize: 13, color: colors.ink },
  targetNameActive: { fontWeight: "700", color: colors.primary },
  orderList: { borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, overflow: "hidden" },
  orderRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, gap: 10 },
  orderPosition: { fontSize: 10, color: colors.muted, width: 56 },
  orderInfo: { flex: 1 },
  orderTitle: { fontSize: 13, fontWeight: "600", color: colors.ink },
  orderMeta: { marginTop: 2, fontSize: 10, color: colors.muted },
  orderActions: { flexDirection: "row", gap: 10 },
  modalFooter: { flexDirection: "row", gap: 10, marginTop: 20, justifyContent: "flex-end" },
});
