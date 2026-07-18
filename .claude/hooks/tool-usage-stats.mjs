#!/usr/bin/env node
// PostToolUse hook:統計各工具使用次數,存入 .claude/tool-usage-stats.local.db。
// 用法:預設從 stdin 讀 hook JSON 記錄一次;--report 印出統計表。
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DB_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "tool-usage-stats.local.db");

function openDb() {
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`CREATE TABLE IF NOT EXISTS tool_usage (
    tool_name TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    first_used_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL
  );`);
  return db;
}

function record() {
  let input = "";
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", () => {
    try {
      const toolName = JSON.parse(input).tool_name;
      if (!toolName) return;
      const db = openDb();
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO tool_usage (tool_name, count, first_used_at, last_used_at)
        VALUES (?, 1, ?, ?)
        ON CONFLICT(tool_name) DO UPDATE SET count = count + 1, last_used_at = excluded.last_used_at`
      ).run(toolName, now, now);
      db.close();
    } catch {
      // hook 失敗不得干擾工具呼叫,靜默結束
    }
  });
}

function report() {
  const db = openDb();
  const rows = db.prepare("SELECT tool_name, count, last_used_at FROM tool_usage ORDER BY count DESC").all();
  db.close();
  if (rows.length === 0) {
    console.log("(尚無統計資料)");
    return;
  }
  const nameWidth = Math.max(9, ...rows.map((r) => r.tool_name.length));
  console.log(`${"tool_name".padEnd(nameWidth)}  ${"count".padStart(5)}  last_used_at`);
  for (const r of rows) {
    console.log(`${r.tool_name.padEnd(nameWidth)}  ${String(r.count).padStart(5)}  ${r.last_used_at}`);
  }
}

try {
  if (process.argv.includes("--report")) {
    report();
  } else {
    record();
  }
} catch {
  // 靜默結束
}
process.exitCode = 0;
