#!/usr/bin/env node
// 探一張統計處表:列出佢有咩統計變項、呈現方式、維度同合法 class code。
//
//   node scripts/explore-table.mjs 110-01001
//   node scripts/explore-table.mjs 110-01001 210-06401 510-60001
//
// 點解要有呢個工具:統計處個 API 唔會話你知合法值係乜。sv 打錯會 Fail(仲好),
// 但 cv 打錯**唔會報錯**,會靜靜哋回 Total 冒充 —— 見 findings.md 第 2 節。
// 所以加新指標之前,一律先跑呢個 script 攞返真正嘅代碼,唔好靠估。
//
// 呢個亦係年度維護工具:半年後統計處改咗表結構,跑一次就知邊度唔同咗。

import { fetchTableMeta, requiredCvDimensions, legalClassCodes, tableInfo } from "../src/data/_lib/censtatd.js";

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("用法:node scripts/explore-table.mjs <表號> [表號 ...]");
  console.error("搵表號:https://www.censtatd.gov.hk/data/tc/all_web_tables.json(頂層係 dict,key 就係表號)");
  process.exit(1);
}

for (const id of ids) {
  let meta;
  try {
    meta = await fetchTableMeta(id);
  } catch (error) {
    console.log(`\n${"=".repeat(70)}\n${id}  攞唔到:${error.message}`);
    continue;
  }

  const info = tableInfo(meta);
  console.log(`\n${"=".repeat(70)}`);
  console.log(`${id}  ${info.title}`);
  console.log(`來源:${info.source}`);
  console.log(`起自 ${info.since} · 最後更新 ${info.lastModified} · 預設頻率代碼 ${meta.comp.default_series_period}`);

  console.log(`\n-- 統計變項 sv(每個下面係合法嘅呈現方式 stat_pres)--`);
  const legalPairs = new Set((meta.comp.table_component_list ?? []).map((c) => `${c.stat_var}|${c.stat_pres}`));
  for (const [sv, svInfo] of Object.entries(meta.labels.sv_list ?? {})) {
    console.log(`  ${sv}  ${svInfo.def_stat_desc ?? ""}`);
    for (const [pres, presInfo] of Object.entries(svInfo.sp_list ?? {})) {
      if (!legalPairs.has(`${sv}|${pres}`)) continue;
      console.log(`      ${pres.padEnd(22)} 單位:${presInfo.def_stat_pres_desc ?? "(冇)"}`);
    }
  }

  const required = requiredCvDimensions(meta);
  console.log(`\n-- 維度 cv --  必填:${required.length ? required.join("、") : "(冇,cv:{} 合法)"}`);
  for (const [dim, dimInfo] of Object.entries(meta.comp.table_component_ccg_list ?? {})) {
    const label = meta.labels.cv_list?.[dim];
    const isTime = label?.is_time_series === "1";
    const showTotal = (dimInfo.ccg_list ?? []).map((g) => g.show_total).join(",");
    console.log(
      `  ${dim.padEnd(20)} ${label?.def_class_desc ?? ""}` +
        `${isTime ? "  [時間維度,由 period 話事,唔好入 cv]" : `  [必填,show_total=${showTotal}]`}`
    );
    if (isTime) continue;
    const codes = legalClassCodes(meta, dim);
    const shown = [...codes.entries()].slice(0, 40);
    for (const [code, desc] of shown) console.log(`      ${code.padEnd(24)} ${desc}`);
    if (codes.size > shown.length) console.log(`      …仲有 ${codes.size - shown.length} 個`);
  }
}
