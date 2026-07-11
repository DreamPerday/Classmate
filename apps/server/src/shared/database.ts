import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./config.js";

export const db = new DatabaseSync(config.databasePath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

export function transaction<T>(work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try { const value = work(); db.exec("COMMIT"); return value; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function migrate(): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const dir = resolve(config.root, "apps/server/src/shared/migrations");
  const applied = new Set((db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: string }>).map((r) => r.version));
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    const sql = readFileSync(resolve(dir, file), "utf8");
    transaction(() => { db.exec(sql); db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(file, new Date().toISOString()); });
  }
}

export function closeDatabase(): void { db.close(); }
