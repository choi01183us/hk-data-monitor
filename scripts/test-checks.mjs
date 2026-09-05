#!/usr/bin/env node
// 檢查器嘅自證測試。
//
// 呢個專案有幾道「擋住錯數上網」嘅閘:schema 驗證、分類相加對總額、
// 人口 Total = 男+女、財政年度期數解析……但**一個冇用嘅檢查器同冇檢查器一樣**,
// 而且更差 —— 佢會令你以為驗過。
//
// 所以每道閘都要做突變測試:故意整壞一樣嘢,睇下佢捉唔捉到。
// 呢個 script 就係咁做。全部離線,唔會打任何 API。
//
//   npm run test:checks
//
// 真實踩過嘅坑(所以呢個 script 存在):
//   · 人口不變式第一版驗「來源資料自己一致唔一致」,把 pin 由 Total 改成男性
//     完全捉唔到 —— 男性人口照樣當成香港人口出街。
//   · 分類相加原本用 0.2% 相對誤差,一個 1,000 百萬元嘅抄錯只係 0.167% 偏差,
//     靜靜哋過關。改成絕對誤差先捉到。
//
// SPEC 第 3 節「避免引入額外 runtime 依賴」,所以唔用測試框架,純 node。

import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validateIndicator, buildIndicator, computeContentHash, nextDataVersion } from "../src/data/_lib/schema.js";
import { parseCsv, toNumber } from "../src/data/_lib/csv.js";
import { parseFiscalYear } from "../src/data/_lib/fstb.js";
import { parseMonth } from "../src/data/_lib/treasury.js";
import { isFiscalPeriodSeries, toDate, formatPeriodZh } from "../src/components/format.js";

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** 跑一個應該掟錯嘅動作;回傳錯誤訊息,冇掟就回 null。 */
function throwsWith(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error.message;
  }
}

// ── 1. schema 驗證:每條必要欄位都要真係擋到 ──────────────────
console.log("\n[1] schema 驗證 — 逐條必要欄位做突變");

function sampleIndicator(overrides = {}) {
  return buildIndicator({
    indicator_id: "sample",
    name_zh: "樣本",
    name_en: "Sample",
    unit_zh: "港元",
    unit_en: "HK$",
    source_zh: "政府統計處",
    source_en: "C&SD",
    source_url: "https://www.censtatd.gov.hk/tc/web_table.html?id=310-31001",
    licence: "政府統計處《知識產權公告》",
    licence_url: "https://www.censtatd.gov.hk/tc/page_31.html",
    updated_at: "2026-08-14",
    frequency: "annual",
    acquisition: "api",
    series: [
      { period: "2024", value: 1 },
      { period: "2025", value: 2 },
    ],
    ...overrides,
  });
}

{
  const base = { ...sampleIndicator(), data_version: "2026.09.1" };
  check("完整文件通過", validateIndicator(base).ok, validateIndicator(base).errors.join("；"));

  for (const field of ["source_url", "licence", "updated_at", "unit_zh", "name_zh", "acquisition"]) {
    const broken = { ...base };
    delete broken[field];
    const result = validateIndicator(broken);
    check(
      `刪走 ${field} 會被捉到`,
      !result.ok && result.errors.some((e) => e.includes(field)),
      result.errors.join("；")
    );
  }

  const mutations = [
    ["data_version 用錯格式(2026.9.1)", { data_version: "2026.9.1" }],
    ["updated_at 用咗 build 時間戳", { updated_at: "2026-09-05T01:00:00Z" }],
    ["source_url 用 http 唔係 https", { source_url: "http://www.censtatd.gov.hk/" }],
    ["acquisition 用咗唔存在嘅值", { acquisition: "scraped" }],
    ["series 空陣列頂替", { series: [] }],
    ["series 用咗 date 唔係 period", { series: [{ date: "2025", value: 1 }] }],
    ["value 用 0 頂替冇數(字串)", { series: [{ period: "2025", value: "冇" }] }],
    ["同一個 period + category 出現兩次", {
      series: [{ period: "2025", category: "甲", value: 1 }, { period: "2025", category: "甲", value: 2 }],
    }],
  ];
  for (const [name, override] of mutations) {
    const result = validateIndicator({ ...base, ...override });
    check(name, !result.ok, "冇被捉到");
  }

  // content_hash 要偵測到有人手改過快照
  const tampered = { ...base, series: [{ period: "2024", value: 999 }, { period: "2025", value: 2 }] };
  const result = validateIndicator(tampered);
  check("人手改過 series 但冇更新 content_hash", !result.ok && result.errors.some((e) => e.includes("content_hash")));
}

// ── 2. data_version:SPEC 第 5 節 YYYY.MM.序號 ────────────────
console.log("\n[2] data_version — 內容冇變就唔可以加序號");
{
  const previous = { content_hash: "sha256:aaaa", data_version: "2026.09.3" };
  check("內容冇變 -> 沿用舊版本號", nextDataVersion(previous, "sha256:aaaa", "2026-09-05") === "2026.09.3");
  check("內容變咗 -> 同月序號 +1", nextDataVersion(previous, "sha256:bbbb", "2026-09-05") === "2026.09.4");
  check("內容變咗 -> 跨月重新由 1 開始", nextDataVersion(previous, "sha256:bbbb", "2026-10-01") === "2026.10.1");
  check("冇上一版 -> .1", nextDataVersion(null, "sha256:bbbb", "2026-09-05") === "2026.09.1");

  // content_hash 唔可以受 fetched_at 影響,否則每星期都會有空 commit
  const a = sampleIndicator();
  const b = sampleIndicator();
  a.fetched_at = "2026-09-01T00:00:00Z";
  b.fetched_at = "2026-09-08T00:00:00Z";
  check("fetched_at 唔同但 content_hash 一樣(唔會產生空 commit)", computeContentHash(a) === computeContentHash(b));

  const c = sampleIndicator({ source_zh: "改咗嘅來源" });
  check("中繼資料改咗 -> content_hash 一定要變(否則修正上唔到畫面)", computeContentHash(a) !== computeContentHash(c));
}

// ── 3. 財政年度 vs 年月:靜靜哋掉走數據嗰個 bug ────────────────
console.log("\n[3] 期數解析 — 「2000-01」係年度定 1 月?");
{
  const fiscalSeries = ["1997-98", "1999-00", "2000-01", "2011-12", "2026-27"];
  const monthlySeries = ["1981-10", "2000-01", "2011-12", "2026-07"];
  check("財政年度序列認得出", isFiscalPeriodSeries(fiscalSeries));
  check("月度序列唔會被當成財政年度", !isFiscalPeriodSeries(monthlySeries));
  check("2000-01 當年度 -> 2000 年 4 月", toDate("2000-01", { fiscal: true }).toISOString().startsWith("2000-04"));
  check("2000-01 當月度 -> 2000 年 1 月", toDate("2000-01").toISOString().startsWith("2000-01"));
  check("1999-00 當年度轉得到(唔係 null)", toDate("1999-00", { fiscal: true }) !== null);
  check("1999-00 當月度轉唔到(月份 00 唔合法,要 null 唔好靜靜哋當 1 月)", toDate("1999-00") === null);
  check("2026-Q3 -> 7 月", toDate("2026-Q3").toISOString().startsWith("2026-07"));
  check("formatPeriodZh 年度", formatPeriodZh("2000-01", { fiscal: true }) === "2000–01 年度");
  check("formatPeriodZh 月度", formatPeriodZh("2000-01") === "2000 年 1 月");
}

// ── 4. 來源格式解析 ───────────────────────────────────────────
console.log("\n[4] 來源格式解析");
{
  check("FSTB「2026-27 (原來預算)」", parseFiscalYear("2026-27 (原來預算)").period === "2026-27");
  check("FSTB 註釋讀得返", parseFiscalYear("2026-27 (原來預算)").note === "原來預算");
  check("FSTB「1999-2000」正規化做 1999-00", parseFiscalYear("1999-2000").period === "1999-00");
  check("FSTB 認唔到嘅年度會 throw", throwsWith(() => parseFiscalYear("廿六至廿七")) !== null);

  check("庫務署「2026年4月」", parseMonth("2026年4月").period === "2026-04");
  check("庫務署「2020年3月(臨時數字)」認得出臨時", parseMonth("2020年3月(臨時數字)").provisional === true);
  check("庫務署非臨時唔會誤標", parseMonth("2026年4月").provisional === false);

  const csv = parseCsv('﻿a,b\r\n1,"x,y"\n2,"say ""hi"""\n');
  check("CSV 剝走 BOM + 認得引號入面嘅逗號", csv.rows[0].b === "x,y");
  check("CSV 認得逃脫嘅雙引號", csv.rows[1].b === 'say "hi"');
  check("CSV 格數對唔上會 throw", throwsWith(() => parseCsv("a,b\n1\n")) !== null);
  check("toNumber 認得千位逗號", toNumber("1,234.5") === 1234.5);
  check('toNumber("") 回 null 唔係 0', toNumber("") === null);
  check('toNumber("-") 回 null 唔係 0', toNumber("-") === null);
}

// ── 5. 人手數據:分類相加對總額 ────────────────────────────────
console.log("\n[5] manual/ 分類相加對總額 — 突變測試");
{
  const { loadManualIndicator, MANUAL_DIR } = await import("../src/data/_lib/manual.js");
  const GOOD = [102308, 135865, 118881, 60517, 34727, 26728, 19202, 1226, 18913, 81310]; // 相加 = 599677
  const LABELS = ["教育", "社會福利", "衞生", "保安", "基礎建設", "經濟", "環境及食物", "社區及對外事務", "房屋", "輔助服務"];

  // 喺 manual/ 度開一個臨時指標,測完即刻刪 —— 唔會掂真檔案
  const id = "_selftest_sum";
  const path = join(MANUAL_DIR, `${id}.json`);

  async function tryLoad(values) {
    await writeFile(
      path,
      JSON.stringify({
        indicator_id: id,
        name_zh: "自我測試",
        name_en: "Self test",
        unit_zh: "港元",
        unit_en: "HK$",
        source_zh: "測試",
        source_en: "Test",
        source_url: "https://example.gov.hk/",
        licence: "測試",
        licence_url: "https://example.gov.hk/terms",
        updated_at: "2026-02-25",
        frequency: "annual",
        acquisition: "manual",
        source_value_multiplier: 1000000,
        expected_totals: { "2026-27": 599677 },
        series: values.map((value, index) => ({ period: "2026-27", category: LABELS[index], value })),
      }),
      "utf8"
    );
    try {
      await loadManualIndicator(id);
      return null;
    } catch (error) {
      return error.message;
    }
  }

  const bump = (index, delta) => GOOD.map((v, i) => (i === index ? v + delta : v));

  try {
    check("抄啱(相加 = 599677)通過", (await tryLoad(GOOD)) === null);
    check("一個數大咗 5000 百萬 -> 捉到", (await tryLoad(bump(8, 5000))) !== null);
    check("一個數大咗 1000 百萬 -> 捉到(舊嘅 0.2% 門檻捉唔到)", (await tryLoad(bump(3, 1000))) !== null);
    check("一個數大咗 100 百萬 -> 捉到", (await tryLoad(bump(3, 100))) !== null);
    check("一個數大咗 2 百萬 -> 捉到", (await tryLoad(bump(3, 2))) !== null);
    check("一個數細咗 3 百萬 -> 捉到", (await tryLoad(bump(5, -3))) !== null);
    // 已知限制:加總法驗唔到次序
    const swapped = [GOOD[1], GOOD[0], ...GOOD.slice(2)];
    check("(已知限制)兩個數調轉位 -> 捉唔到,靠 category_order 鎖次序", (await tryLoad(swapped)) === null);
    // 未填齊唔應該報錯 —— 唔係「錯」,係「未做」
    check("未填齊(有 null)唔會報錯", (await tryLoad(GOOD.map((v, i) => (i < 5 ? v : null)))) === null);
  } finally {
    await rm(path, { force: true });
  }
}

// ── 總結 ──────────────────────────────────────────────────────
console.log(`\n${passed} 個通過,${failed} 個失敗`);
if (failed > 0) {
  console.error("\n有檢查器捉唔到佢應該捉到嘅嘢。喺呢個狀態下,「驗證通過」係冇意義嘅。");
  process.exit(1);
}
console.log("全部檢查器都自證過:整壞嘢佢哋真係會嘈。");
