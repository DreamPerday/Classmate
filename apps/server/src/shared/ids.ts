import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
export const id = (prefix: string): string => `${prefix}_${nanoid(12)}`;
export const fingerprint = (...parts: string[]): string => createHash("sha256").update(parts.join("\u241f")).digest("hex").slice(0, 32);
export const normalizeTerm = (value: string): string => value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s+＋_\-]/g, "").replace(/[，。；：、,.!?！？()（）]/g, "");

