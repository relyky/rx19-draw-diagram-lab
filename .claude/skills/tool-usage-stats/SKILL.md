---
name: tool-usage-stats
description: 檢視並解讀本專案的 Claude Code 工具使用統計(由 PostToolUse hook 記錄於 .claude/tool-usage-stats.local.db),整理成表格並附觀察重點。
disable-model-invocation: true
---

# Tool Usage Stats

本專案有一支 PostToolUse hook(`.claude/hooks/tool-usage-stats.mjs`)持續統計各工具的使用次數:Bash/PowerShell 細分到第一個命令名稱(如 `git`、`gh`),Skill 細分到 skill 名稱,存於 SQLite DB `.claude/tool-usage-stats.local.db`,資料表 `tool_usage(tool_name, command, count, first_used_at, last_used_at)`。

## 步驟

1. 執行報表:

   ```bash
   node .claude/hooks/tool-usage-stats.mjs --report
   ```

   需要自訂切面(如只看 Bash 細分、依 last_used_at 排序)時,用 Node 的 `node:sqlite` 直接下 SQL 查該 DB——不要假設環境有 sqlite3 CLI。

2. 把輸出整理成 markdown 表格:欄位 tool / command / count,依 count 降冪;count 為 1 的長尾項可合併成一列「其他(各 1)」以免表格冗長。

3. 表格後附 2–4 點觀察,幫使用者解讀而不只是轉述數字,例如:哪些是主力工具、異常偏高或偏低的用量、與近期工作型態(實作、驗證、issue 操作)的對應關係。

## 解讀時必提的盲點

統計有三個已知低估來源,呈現觀察時要說明,避免使用者誤讀:

- **sub-agent 不計入**:hook 只記錄主 session 的工具呼叫,Agent/Workflow 內部的工具用量不在統計中。
- **Skill 次數偏低**:以 slash command 展開執行的 skill(如 `/to-spec`)不會經過 Skill 工具,不被記錄;只有以 Skill 工具呼叫的才計入。
- **無時間區間**:`--report` 是全期累計,無法只看某段期間;`last_used_at` 僅供參考最近一次使用時間。
