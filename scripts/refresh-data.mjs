#!/usr/bin/env node
// 重抓全部 acquisition: "api" 嘅指標,寫入 src/data/_snapshots/。
//
// SPEC 第 7 節:
//   · Fail-soft —— 任何一個 loader 抓唔到數,保留 repo 入面上一版 JSON,
//     唔好覆蓋、唔好清空、唔好用空陣列頂替
//   · 全部 loader 都失敗 -> 呢個 script 仍然 exit 0(用晒舊數據),
//     但要喺 Actions summary 標紅
//   · manual/ 嘅檔案永遠唔碰
//   · 每次數據有實際變動先 commit
//
// 呢個 script **唔會**自己 commit —— 佢淨係更新檔案同出報告,
// commit 由 workflow 負責。咁本機都跑得,唔會意外改咗你嘅 git 狀態。

import { appendFile } from "node:fs/promises";

import { CENSTATD_INDICATORS, FISCAL_INDICATORS, loadCenstatdIndicator, loadFiscalIndicator } from "../src/data/_lib/indicators.js";
import { readSnapshot, finaliseIndicator, writeSnapshot } from "../src/data/_lib/snapshot.js";
import { withFixtureTransaction } from "../src/data/_lib/http.js";
import { resetTableMetaCache } from "../src/data/_lib/censtatd.js";

const TARGETS = [
  ...Object.keys(CENSTATD_INDICATORS).map((id) => ({ id, load: () => loadCenstatdIndicator(id) })),
  ...Object.keys(FISCAL_INDICATORS).map((id) => ({ id, load: () => loadFiscalIndicator(id) })),
];

const results = [];

for (const { id, load } of TARGETS) {
  const previous = await readSnapshot(id);
  // 元資料快取要逐個指標清 —— 見 resetTableMetaCache() 嘅註解。
  resetTableMetaCache();
  try {
    // 錄影同快照原子更新:呢個指標中途死咗,佢啲錄影一齊丟棄,
    // 唔可以出現「錄影新、快照舊」。
    const fresh = finaliseIndicator(await withFixtureTransaction(load), previous);
    const outcome = await writeSnapshot(id, fresh);
    results.push({
      id,
      status: outcome.written ? (outcome.reason === "created" ? "新增" : "有更新") : "冇變",
      detail: outcome.written
        ? `${previous?.data_version ?? "(新)"} → ${outcome.data_version},數據截至 ${fresh.updated_at}`
        : `${outcome.data_version},數據截至 ${fresh.updated_at}`,
      failed: false,
    });
  } catch (error) {
    // 呢度唔會掂 src/data/_snapshots/<id>.json —— writeSnapshot 冇跑過,
    // 舊檔一個 byte 都冇改。呢個就係 SPEC 第 7 節嘅「保留上一版」。
    results.push({
      id,
      status: "失敗",
      detail: previous
        ? `保留上一版 ${previous.data_version}(數據截至 ${previous.updated_at})。原因:${error.message}`
        : `而且冇上一版可以退返去。原因:${error.message}`,
      failed: true,
      orphan: !previous,
    });
  }
}

const failed = results.filter((r) => r.failed);
const changed = results.filter((r) => r.status === "有更新" || r.status === "新增");
const orphans = results.filter((r) => r.orphan);

// ── 終端輸出 ──────────────────────────────────────────────────
console.log("");
for (const r of results) {
  const mark = r.failed ? "FAIL" : r.status === "冇變" ? "  = " : "  + ";
  console.log(`${mark} ${r.id.padEnd(32)} ${r.status.padEnd(4)} ${r.detail}`);
}
console.log(
  `\n${results.length} 個指標:${changed.length} 個有更新,` +
    `${results.length - changed.length - failed.length} 個冇變,${failed.length} 個失敗`
);
console.log("manual/ 冇掂過(SPEC 第 7 節)");

// ── GitHub Actions summary ────────────────────────────────────
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  const icon = (r) => (r.failed ? "🔴" : r.status === "冇變" ? "⚪️" : "🟢");
  const lines = [
    failed.length > 0
      ? `## 🔴 每週重抓數據 — ${failed.length} 個失敗`
      : `## 🟢 每週重抓數據 — 全部成功`,
    "",
    `${changed.length} 個有更新 · ${results.length - changed.length - failed.length} 個冇變 · ${failed.length} 個失敗`,
    "",
    "| | 指標 | 結果 | 詳情 |",
    "|---|---|---|---|",
    ...results.map((r) => `| ${icon(r)} | \`${r.id}\` | ${r.status} | ${r.detail.replace(/\|/g, "\\|").slice(0, 300)} |`),
    "",
  ];
  if (failed.length > 0) {
    lines.push(
      "> **失敗嘅指標保留咗上一版數據**,網站照樣出得街,",
      "> 但嗰幾版會顯示「上一次成功更新嗰時嘅版本」提示。",
      ""
    );
  }
  if (orphans.length > 0) {
    lines.push(
      `> ⚠️ **${orphans.map((r) => r.id).join("、")} 連上一版都冇。** 呢個指標喺網站上面會令 build 失敗。`,
      "> 通常代表呢個係新加嘅指標而第一次抓就失敗。",
      ""
    );
  }
  lines.push("`manual/` 嘅檔案冇被碰過。");
  await appendFile(summaryPath, lines.join("\n"), "utf8");
}

// SPEC 第 7 節:全部失敗都仲要 exit 0(用晒舊數據),紅色由 summary 表達。
// 唯一例外:有指標連上一版都冇 —— 咁 build 一定會死,不如喺呢度就講清楚。
if (orphans.length > 0) {
  console.error(`\n有 ${orphans.length} 個指標抓唔到而且冇上一版,build 會失敗`);
  process.exit(1);
}
