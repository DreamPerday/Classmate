import type { CourseExportPayload } from "./database";

let current: CourseExportPayload | null = null;
const listeners = new Set<(payload: CourseExportPayload | null) => void>();

export function setIncomingCourse(payload: CourseExportPayload | null) {
  current = payload;
  for (const listener of listeners) listener(payload);
}

export function consumeIncomingCourse(): CourseExportPayload | null {
  const payload = current;
  current = null;
  return payload;
}

export function onIncomingCourse(listener: (payload: CourseExportPayload | null) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
