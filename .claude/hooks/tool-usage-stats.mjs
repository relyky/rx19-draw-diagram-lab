#!/usr/bin/env node
// PostToolUse hook:統計各工具使用次數(Bash/PowerShell/Skill 細分到命令名稱),存入 .claude/tool-usage-stats.local.db。
// 用法:預設從 stdin 讀 hook JSON 記錄一次;--report 印出統計表。
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DB_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "tool-usage-stats.local.db");

function openDb() {
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`CREATE TABLE IF NOT EXISTS tool_usage (
    tool_name TEXT NOT NULL,
    command TEXT NOT NULL DEFAULT '',
    count INTEGER NOT NULL DEFAULT 0,
    first_used_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL,
    PRIMARY KEY (tool_name, command)
  );`);
  return db;
}

// Bash/PowerShell 取第一個命令名稱(跳過 cd 前導段與 VAR=x 前綴),Skill 取 skill 名稱,其餘回空字串。
function extractCommand(toolName, toolInput) {
  if (toolName === "Skill") return toolInput?.skill ?? "";
  if (toolName !== "Bash" && toolName !== "PowerShell") return "";
  const segments = String(toolInput?.command ?? "").split(/&&|\|\||[;|]/);
  for (let segment of segments) {
    segment = segment.trim();
    let prev;
    do {
      prev = segment;
      segment = segment.replace(/^\w+=\S*\s+/, "");
    } while (segment !== prev);
    const token = segment.split(/\s+/)[0] ?? "";
    if (token === "" || token === "cd") continue;
    return token;
  }
  return "";
}

function record() {
  let input = "";
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", () => {
    try {
      const payload = JSON.parse(input);
      const toolName = payload.tool_name;
      if (!toolName) return;
      const command = extractCommand(toolName, payload.tool_input);
      const db = openDb();
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO tool_usage (tool_name, command, count, first_used_at, last_used_at)
        VALUES (?, ?, 1, ?, ?)
        ON CONFLICT(tool_name, command) DO UPDATE SET count = count + 1, last_used_at = excluded.last_used_at`
      ).run(toolName, command, now, now);
      db.close();
    } catch {
      // hook 失敗不得干擾工具呼叫,靜默結束
    }
  });
}

function report() {
  const db = openDb();
  const rows = db.prepare("SELECT tool_name, command, count, last_used_at FROM tool_usage ORDER BY count DESC").all();
  db.close();
  if (rows.length === 0) {
    console.log("(尚無統計資料)");
    return;
  }
  const display = rows.map((r) => ({ ...r, command: r.command === "" ? "-" : r.command }));
  const nameWidth = Math.max(9, ...display.map((r) => r.tool_name.length));
  const cmdWidth = Math.max(7, ...display.map((r) => r.command.length));
  console.log(`${"tool_name".padEnd(nameWidth)}  ${"command".padEnd(cmdWidth)}  ${"count".padStart(5)}  last_used_at`);
  for (const r of display) {
    console.log(`${r.tool_name.padEnd(nameWidth)}  ${r.command.padEnd(cmdWidth)}  ${String(r.count).padStart(5)}  ${r.last_used_at}`);
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
