#!/usr/bin/env node
// 重抓全部 acquisition: "api" 嘅指標,寫入 src/data/_snapshots/。
//
// SPEC 第 7 節:
//   · Fail-soft —— 任何一個 loader 抓唔到數,保留 repo 入面上一版 JSON,
//     唔好覆蓋、唔好清空、唔好用空陣列頂替
//   · 只有 UpstreamError 而且全部有舊快照 -> exit 0，Actions summary 標紅
//   · 程式／schema／換算錯，或首次抓取失敗冇舊快照 -> exit 1，阻止提交部署
//   · manual/ 嘅檔案永遠唔碰
//   · 每次數據有實際變動先 commit
//
// 呢個 script **唔會**自己 commit —— 佢淨係更新檔案同出報告,
// commit 由 workflow 負責。咁本機都跑得,唔會意外改咗你嘅 git 狀態。

import { appendFile } from "node:fs/promises";

import { CENSTATD_INDICATORS, FISCAL_INDICATORS, loadCenstatdIndicator, loadFiscalIndicator } from "../src/data/_lib/indicators.js";
import { PROPERTY_INDICATORS, loadPropertyIndicator } from "../src/data/_lib/property.js";
import { MONEY_INDICATORS, loadMoneyIndicator } from "../src/data/_lib/money.js";
import { readSnapshot, finaliseIndicator, writeSnapshot } from "../src/data/_lib/snapshot.js";
import { withFixtureTransaction, UpstreamError } from "../src/data/_lib/http.js";
import { resetTableMetaCache } from "../src/data/_lib/censtatd.js";

const TARGETS = [
  ...Object.keys(CENSTATD_INDICATORS).map((id) => ({ id, load: () => loadCenstatdIndicator(id) })),
  ...Object.keys(FISCAL_INDICATORS).map((id) => ({ id, load: () => loadFiscalIndicator(id) })),
  ...Object.keys(PROPERTY_INDICATORS).map((id) => ({ id, load: () => loadPropertyIndicator(id) })),
  ...Object.keys(MONEY_INDICATORS).map((id) => ({ id, load: () => loadMoneyIndicator(id) })),
];

const results = [];

for (const { id, load } of TARGETS) {
  const previous = await readSnapshot(id);
  // 元資料快取要逐個指標清 —— 見 resetTableMetaCache() 嘅註解。
  resetTableMetaCache();
  try {
    // 錄影同快照原子更新:呢個指標中途死咗,佢啲錄影一齊丟棄,
    // 唔可以出現「錄影新、快照舊」。
    const fresh = await withFixtureTransaction(async () => finaliseIndicator(await load(), previous));
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
    // Fail-soft 入場券只係 UpstreamError；普通 Error／schema／寫入錯誤
    // 即使有上一版都要阻止本輪提交同部署，唔靠 message 判斷類型。
    const hardFailed = !(error instanceof UpstreamError);
    const reason = error?.message ?? String(error);
    results.push({
      id,
      status: hardFailed ? "程式／資料錯誤" : "取得失敗",
      detail: hardFailed
        ? `非上游取得錯誤，阻止本輪提交及部署。原因:${reason}`
        : previous
          ? `保留上一版 ${previous.data_version}(數據截至 ${previous.updated_at})。原因:${reason}`
          : `而且冇上一版可以退返去。原因:${reason}`,
      failed: true,
      hardFailed,
      orphan: !previous,
    });
  }
}

const failed = results.filter((r) => r.failed);
const changed = results.filter((r) => r.status === "有更新" || r.status === "新增");
const orphans = results.filter((r) => r.orphan);
const hardFailures = results.filter((r) => r.hardFailed);

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
  if (failed.some((r) => !r.hardFailed && !r.orphan)) {
    lines.push(
      "> 上游取得失敗而有舊快照嘅指標保留上一版，版本及數據日期見上表。",
      ""
    );
  }
  if (hardFailures.length > 0) {
    lines.push(
      `> **${hardFailures.map((r) => r.id).join("、")} 發生程式／資料錯誤：本輪 exit 1，阻止提交及部署。**`,
      "> 即使有上一版，都唔可以當作成功刷新。",
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

// 只有上游失敗兼有舊數據先能 exit 0。其餘一切預設 hard fail。
if (hardFailures.length > 0 || orphans.length > 0) {
  console.error(`\n${hardFailures.length} 個程式／資料錯誤，${orphans.length} 個失敗指標冇上一版；停止本輪提交及部署`);
  process.exit(1);
}
