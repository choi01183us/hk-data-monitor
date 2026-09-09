#!/usr/bin/env node
import { appendFile } from "node:fs/promises";
import { refreshCitySnapshots } from "../src/data/_lib/city-feeds.js";

const results = await refreshCitySnapshots();
for (const result of results) {
  console.log(`${result.status} ${result.kind} — 快照取得 ${result.snapshot.fetched_at}；來源截至 ${result.snapshot.updated_at}`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const failed = results.some((r) => r.status === "retained");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, [
    `## ${failed ? "🔴 部分來源保留上一版" : "🟢 城市快照完成"}`,
    "", "| 來源 | 結果 | 快照取得時間 |", "|---|---|---|",
    ...results.map((r) => `| ${r.kind} | ${r.status} | ${r.snapshot.fetched_at} |`),
    "", "新聞係政府公報；航班係前一日原定日期紀錄。站內並非即時資訊。", "",
  ].join("\n"));
}
