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

import { writeFile, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

import { validateIndicator, buildIndicator, computeContentHash, nextDataVersion } from "../src/data/_lib/schema.js";
import { parseCsv, toNumber } from "../src/data/_lib/csv.js";
import { parseFiscalYear } from "../src/data/_lib/fstb.js";
import { parseMonth } from "../src/data/_lib/treasury.js";
import { isFiscalPeriodSeries, toDate, formatPeriodZh } from "../src/components/format.js";
import { CENSTATD_INDICATORS } from "../src/data/_lib/indicators.js";
import { readSnapshot } from "../src/data/_lib/snapshot.js";
import { pickDataAsOf, isDisplayed } from "../src/data/_lib/site-meta.js";
import { readdir, stat, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:http";

let passed = 0;
let failed = 0;

// R8 用:記低錄影目錄喺測試開始之前嘅狀態。
// 「零網絡」嘅測試如果會順手錄影,R5 嘅突變測試就係假嘅 ——
// 改壞 transform 之後錄影跟住變,永遠對得上。
const FIXTURE_DIR_FOR_AUDIT = join(HERE_ROOT, "src", "data", "_fixtures");
async function fixtureDirState() {
  if (!existsSync(FIXTURE_DIR_FOR_AUDIT)) return [];
  const names = (await readdir(FIXTURE_DIR_FOR_AUDIT)).sort();
  const out = [];
  for (const name of names) {
    const info = await stat(join(FIXTURE_DIR_FOR_AUDIT, name));
    out.push(`${name}:${info.size}:${info.mtimeMs}`);
  }
  return out;
}
const fixtureStateAtStart = await fixtureDirState();

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

// ── 5. 人手公共開支:總額、PDF 次序、跨來源錨 ─────────────────
// 固定已知答案:2026 年預算版本 FSTB 三個共同組別,原始百萬元已換成港元。
// 呢份只供 §5/R3 自證,唔係網站數據或 fallback。正式 loader 預設仍讀目前政府快照。
// 刻意唔讀會每年修訂嘅 live snapshot,否則明年 GOOD 基準會因預算變修訂預算而失效。
const MANUAL_GOVT_ANCHOR_FIXTURE = {
  indicator_id: "govt_expenditure", unit_zh: "港元", unit_en: "HK$",
  series: [
    { period: "2024-25", category: "教育", value: 105281000000 },
    { period: "2024-25", category: "社會福利", value: 116887000000 },
    { period: "2024-25", category: "衞生", value: 109247000000 },
    { period: "2025-26", category: "教育", value: 101991000000 },
    { period: "2025-26", category: "社會福利", value: 123614000000 },
    { period: "2025-26", category: "衞生", value: 114347000000 },
    { period: "2026-27", category: "教育", value: 102308000000 },
    { period: "2026-27", category: "社會福利", value: 135865000000 },
    { period: "2026-27", category: "衞生", value: 118881000000 },
  ],
};
console.log("\n[5] manual/ 公共經常開支 — 總額、PDF 次序、跨來源錨突變測試");
{
  const { loadManualIndicator, validatePublicExpenditure } = await import("../src/data/_lib/manual.js");
  // 2026-27 附錄 B 第 II 部 PDF p8,數字同標籤逐項照原表,相加 = 625033。
  const GOOD = [102308, 135865, 118881, 60517, 35001, 26728, 22875, 22635, 18913, 81310];
  const LABELS = ["教育", "社會福利", "衞生", "保安", "基礎建設", "環境及食物", "經濟", "房屋", "社區及對外事務", "輔助服務"];
  const id = "public_expenditure_policy_groups";
  const tempDir = await mkdtemp(join(tmpdir(), "hkdm-manual-test-"));
  const path = join(tempDir, `${id}.json`);
  const govtSnapshotPath = join(tempDir, "govt_expenditure.json");
  const govt = MANUAL_GOVT_ANCHOR_FIXTURE;
  await writeFile(govtSnapshotPath, JSON.stringify(govt), "utf8");
  const base = {
    indicator_id: id, name_zh: "自我測試", name_en: "Self test",
    unit_zh: "港元", unit_en: "HK$", source_zh: "測試", source_en: "Test",
    source_url: "https://example.gov.hk/", licence: "測試", licence_url: "https://example.gov.hk/terms",
    updated_at: "2026-02-25", frequency: "annual", acquisition: "manual",
    source_value_multiplier: 1000000,
    category_order: LABELS,
    expected_totals: { "2026-27": 625033 },
    series: GOOD.map((value, index) => ({ period: "2026-27", category: LABELS[index], value })),
  };

  // 跑正式 loader,人手輸入同固定 govt 錨都真係寫入臨時目錄再讀檔。
  // 唔會覆寫擁有人嘅 null 骨架,亦證明新檢查真係接咗正式入口。
  async function tryLoad(overrides = {}) {
    await writeFile(path, JSON.stringify({ ...base, ...overrides }), "utf8");
    try {
      return { doc: await loadManualIndicator(id, { manualDir: tempDir, govtSnapshotPath }), error: null };
    } catch (error) {
      return { doc: null, error: error.message };
    }
  }
  const withValues = (values) => ({ series: base.series.map((point, i) => ({ ...point, value: values[i] })) });
  const bump = (index, delta) => withValues(GOOD.map((v, i) => (i === index ? v + delta : v)));
  async function rejects(name, overrides, fragment) {
    const { error } = await tryLoad(overrides);
    check(name, error?.includes(fragment) === true, error ?? "冇掟錯");
  }
  function rejectsAnchor(name, mutate) {
    const snapshot = structuredClone(govt);
    const altered = mutate(snapshot);
    const error = throwsWith(() => validatePublicExpenditure(base, altered === undefined ? snapshot : altered));
    check(name, error?.includes("跨來源錨") === true, error ?? "冇掟錯");
  }

  try {
    const good = await tryLoad();
    check("公共十組抄啱(相加 = 625033)通過正式 loader", good.error === null && good.doc.manual_status === "filled", good.error);
    check("百萬元換成港元,教育同固定 CSV 錨完全相等", good.doc?.series[0].value === 102308000000);
    const changedOnDisk = structuredClone(govt);
    changedOnDisk.series.find((p) => p.period === "2026-27" && p.category === "教育").value += 1000000;
    await writeFile(govtSnapshotPath, JSON.stringify(changedOnDisk), "utf8");
    await rejects("正式 loader 真係讀錨檔:檔內教育改壞 -> hard fail", {}, "跨來源錨對唔上");
    await rm(govtSnapshotPath);
    await rejects("正式 loader 錨檔被刪 -> hard fail,唔借用正式快照", {}, "跨來源錨 govt_expenditure 快照讀唔到");
    await writeFile(govtSnapshotPath, JSON.stringify(govt), "utf8");
    await rejects("一個數大咗 5000 百萬 -> 總額捉到", bump(8, 5000), "分類相加");
    await rejects("一個數大咗 1000 百萬 -> 捉到(舊 0.2% 門檻捉唔到)", bump(3, 1000), "分類相加");
    await rejects("一個數大咗 100 百萬 -> 捉到", bump(3, 100), "分類相加");
    await rejects("一個數大咗 2 百萬 -> 捉到", bump(3, 2), "分類相加");
    await rejects("一個數細咗 3 百萬 -> 捉到", bump(5, -3), "分類相加");

    const swappedOrder = [...LABELS];
    [swappedOrder[5], swappedOrder[6]] = [swappedOrder[6], swappedOrder[5]];
    await rejects("category_order 環境及食物／經濟對調 -> 捉到", { category_order: swappedOrder }, "category_order");
    const relabelled = base.series.map((point, i) => ({ ...point, category: swappedOrder[i] }));
    await rejects("series 值留原位、只對調標籤 -> PDF 次序捉到", { series: relabelled }, "series 類別");
    await rejects("category_order 同 series 一齊排錯 -> 仍然捉到", { category_order: swappedOrder, series: relabelled }, "category_order");
    await rejects("null 骨架次序錯都要捉到", { series: relabelled.map((p) => ({ ...p, value: null })) }, "series 類別");
    await rejects("少咗一個類別、其餘未填 -> 捉到", { series: base.series.slice(0, 9).map((p) => ({ ...p, value: null })) }, "series 類別");

    const swappedValues = [GOOD[1], GOOD[0], ...GOOD.slice(2)];
    await rejects("教育／福利值對調、總和不變 -> 跨來源錨捉到", withValues(swappedValues), "跨來源錨");
    await rejects("教育差 1 百萬元(總額容忍範圍內) -> 精確錨捉到", bump(0, 1), "跨來源錨");
    await rejects("福利差 1 百萬元 -> 精確錨捉到", bump(1, 1), "跨來源錨");
    await rejects("衞生差 1 百萬元 -> 精確錨捉到", bump(2, 1), "跨來源錨");
    await rejects("乘數改成 1000 -> 單位閘捉到", { source_value_multiplier: 1000 }, "原始百萬元");
    await rejects("value 寫空字串 -> 唔可以變成 0", withValues(GOOD.map((v, i) => i === 7 ? "" : v)), "value 必須");

    rejectsAnchor("快照缺相同期數 -> 唔會借用最新一期", (snapshot) => {
      snapshot.series = snapshot.series.filter((p) => p.period !== "2026-27");
    });
    rejectsAnchor("快照缺教育類別 -> hard fail", (snapshot) => {
      snapshot.series = snapshot.series.filter((p) => !(p.period === "2026-27" && p.category === "教育"));
    });
    rejectsAnchor("快照錨係 null -> hard fail", (snapshot) => {
      snapshot.series.find((p) => p.period === "2026-27" && p.category === "教育").value = null;
    });
    rejectsAnchor("快照錨係 NaN -> hard fail", (snapshot) => {
      snapshot.series.find((p) => p.period === "2026-27" && p.category === "教育").value = NaN;
    });
    rejectsAnchor("快照有重複錨 -> 唔可以揀第一個過關", (snapshot) => {
      snapshot.series.push({ ...snapshot.series.find((p) => p.period === "2026-27" && p.category === "教育") });
    });
    rejectsAnchor("錯嘅指標唔可以冒充政府快照", (snapshot) => { snapshot.indicator_id = "wrong"; });
    rejectsAnchor("快照單位係百萬元 -> 唔可以當港元", (snapshot) => { snapshot.unit_zh = "百萬元"; });
    rejectsAnchor("快照不存在 -> hard fail,唔用預設值", () => null);

    await rejects("十組填齊但 expected_totals 係 null -> 捉到", { expected_totals: { "2026-27": null } }, "必須填寫 PDF 嘅 expected_totals");
    await rejects("十組填齊但漏填該年 expected_totals -> 捉到", { expected_totals: {} }, "必須填寫 PDF 嘅 expected_totals");
    await rejects("刪晒 expected_totals 都唔可以繞過檢查", { expected_totals: undefined }, "必須填寫 PDF 嘅 expected_totals");
    await rejects("expected_totals 寫非數字 -> 唔可以 NaN 繞過", { expected_totals: { "2026-27": "未抄" } }, "expected_totals 必須");

    const partial = withValues(GOOD.map((v, i) => i < 5 ? v : null));
    const partialResult = await tryLoad({ ...partial, expected_totals: { "2026-27": null } });
    check("未填齊可留空總額,已填三個錨照驗", partialResult.error === null && partialResult.doc.manual_status === "partial", partialResult.error);
    await rejects("部分未填但教育已填錯 -> 一樣捉到", withValues(GOOD.map((v, i) => i === 0 ? v + 1 : null)), "跨來源錨");
    const todo = await tryLoad({ ...withValues(GOOD.map(() => null)), expected_totals: { "2026-27": null } });
    check("正確次序全 null 骨架通過,維持 todo", todo.error === null && todo.doc.manual_status === "todo", todo.error);
    check("全 null 骨架無須錨快照", throwsWith(() => validatePublicExpenditure({ ...base, ...withValues(GOOD.map(() => null)) }, null)) === null);

    // 多年度係人造測例,只用嚟證明按期數對錨同總額;唔係抄入網站嘅公共歷史數字。
    const multi = { series: [], expected_totals: {} };
    for (const period of ["2024-25", "2025-26", "2026-27"]) {
      const parts = base.series.map((point, i) => ({
        ...point, period,
        value: i < 3 ? govt.series.find((p) => p.period === period && p.category === point.category).value / 1000000 : point.value,
      }));
      multi.series.push(...parts);
      multi.expected_totals[period] = parts.reduce((sum, p) => sum + p.value, 0);
    }
    const multiResult = await tryLoad(multi);
    check("三年度逐期對返各年 CSV 錨及總額 -> 通過", multiResult.error === null && multiResult.doc.series.length === 30, multiResult.error);
    const wrongYear = structuredClone(multi);
    wrongYear.series[0].value = GOOD[0];
    await rejects("舊年度誤用最新教育值 -> 逐期錨捉到", wrongYear, "跨來源錨");
    const wrongEarlierOrder = structuredClone(multi);
    [wrongEarlierOrder.series[7], wrongEarlierOrder.series[8]] = [wrongEarlierOrder.series[8], wrongEarlierOrder.series[7]];
    await rejects("只有舊年度房屋／社區及對外事務調轉 -> 捉到", wrongEarlierOrder, "series 類別");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}


// ══ 回歸測試 ══════════════════════════════════════════════════
// 以下四組釘死四個真實出現過嘅 bug。全部係「唔報錯,淨係會錯」嗰類,
// 所以特別易返潮 —— 改壞咗冇人會即刻發現。

// ── R1. 財政年度「2000-01」唔可以當成 2000 年 1 月 ──────────────
//
// 真實 bug:toDate("2000-01") 當咗係 2000 年 1 月。政府收入係財政年度序列,
// 結果 30 個年度入面只有 2000-01 至 2011-12 十二個轉到日期,其餘全部變 null 俾人
// 靜靜哋掉走 —— 圖上得 12 年,冇任何錯誤訊息。
//
// 呢度用**真實快照**嚟測,唔用人造資料:一條真財政年度序列(govt_revenue)
// 同一條真月度序列(cpi,入面正正有「2005-06」,係 2005 年 6 月唔係 2005–06 年度)。
console.log("\n[R1] 財政年度 vs 年月 — 用真實快照,確認冇一個期數被靜默掉走");
{
  const fiscal = await readSnapshot("govt_revenue");
  const monthly = await readSnapshot("cpi");

  if (!fiscal || !monthly) {
    check("R1 需要 govt_revenue 同 cpi 快照", false, "行 `npm run build` 先");
  } else {
    const fiscalPeriods = fiscal.series.map((p) => p.period);
    const monthlyPeriods = monthly.series.map((p) => p.period);

    check("govt_revenue 認得出係財政年度序列", isFiscalPeriodSeries(fiscalPeriods) === true);
    check("cpi 唔會被誤判成財政年度序列", isFiscalPeriodSeries(monthlyPeriods) === false);

    // 核心:成條 series 逐個轉,一個 null 都唔准有。
    const fiscalDates = fiscalPeriods.map((period) => toDate(period, { fiscal: true }));
    const monthlyDates = monthlyPeriods.map((period) => toDate(period, { fiscal: false }));
    check(
      `govt_revenue ${fiscalPeriods.length} 個期數全部轉到日期(冇靜默截短)`,
      fiscalDates.every((d) => d instanceof Date && !Number.isNaN(d.getTime())),
      `${fiscalDates.filter((d) => d === null).length} 個轉唔到`
    );
    check(
      `cpi ${monthlyPeriods.length} 個期數全部轉到日期(冇靜默截短)`,
      monthlyDates.every((d) => d instanceof Date && !Number.isNaN(d.getTime())),
      `${monthlyDates.filter((d) => d === null).length} 個轉唔到`
    );

    // 呢個係 bug 嘅震央:同一個字串,兩條 series 要有兩個唔同答案。
    check("財政年度 series 入面 2000-01 -> 2000 年 4 月", toDate("2000-01", { fiscal: true }).getUTCMonth() === 3);
    check("月度 series 入面 2005-06 -> 2005 年 6 月", toDate("2005-06", { fiscal: false }).getUTCMonth() === 5);
    check("cpi 快照真係有「2005-06」呢個期數(唔係我砌出嚟)", monthlyPeriods.includes("2005-06"));

    // 如果有人日後把 fiscal 判斷寫死做 true,月度序列就會全部飛去 4 月 —— 呢條會即刻嘈。
    const wrong = monthlyPeriods.map((period) => toDate(period, { fiscal: true }));
    check(
      "把月度 series 當成財政年度會出唔同答案(證明呢個判斷真係有作用)",
      wrong.some((d, i) => d.getTime() !== monthlyDates[i].getTime())
    );
  }
}

// ── R2. 人口不變式:抽出嚟嘅係總人口,唔係男性人口 ─────────────
//
// 真實 bug:第一版嘅 verify 驗「來源資料自己一致唔一致」,而唔係驗「我揀咗嘅行啱唔啱」。
// 把 pin 由 { SEX: "" }(總計)改成 { SEX: "M" }(男性)—— **完全捉唔到**,
// 男性人口照樣當成「香港人口」出街。
//
// 呢度用人造 API 回應(離線),直接餵畀登記冊入面真正嗰個 verify 函式。
console.log("\n[R2] 人口不變式 — pin 揀錯行要捉到");
{
  const verify = CENSTATD_INDICATORS.population.verify;
  check("population 有 verify 函式", typeof verify === "function");

  if (typeof verify === "function") {
    // 模擬統計處回嘅 long-format:每期有 Total、男、女三行(單位千人)
    const periods = Array.from({ length: 60 }, (_, i) => `${1996 + Math.floor(i / 2)}${i % 2 ? "12" : "06"}`);
    const rows = periods.flatMap((period, i) => {
      const male = 3000 + i;
      const female = 3500 + i;
      return [
        { period, SEX: "", AGE: "", freq: "H", figure: male + female, sd_value: "" },
        { period, SEX: "M", AGE: "", freq: "H", figure: male, sd_value: "" },
        { period, SEX: "F", AGE: "", freq: "H", figure: female, sd_value: "" },
      ];
    });
    const asSeries = (pick) =>
      periods.map((period) => ({
        period: `${period.slice(0, 4)}-${period.slice(4)}`,
        value: rows.find((r) => r.period === period && (r.SEX ?? "") === pick && (r.AGE ?? "") === "").figure * 1000,
      }));

    check("pin 喺 Total(啱)-> 通過", throwsWith(() => verify(rows, asSeries(""))) === null);

    const male = throwsWith(() => verify(rows, asSeries("M")));
    check("pin 改成男性(就係嗰個真實突變)-> 捉到", male !== null, "靜靜哋過關咗");

    const female = throwsWith(() => verify(rows, asSeries("F")));
    check("pin 改成女性 -> 捉到", female !== null, "靜靜哋過關咗");

    // 換算寫錯(千人 -> 人 用錯乘數)亦要捉到
    const wrongScale = asSeries("").map((p) => ({ ...p, value: p.value / 10 }));
    check("換算乘數寫錯 10 倍 -> 捉到", throwsWith(() => verify(rows, wrongScale)) !== null);

    // 「冇數」嘅格唔可以當成 0 —— Number("") 係 0 而且係 finite,呢個坑撞過
    const withGaps = rows.map((r) => (r.period === "199612" && r.SEX !== "" ? { ...r, figure: "" } : r));
    check(
      "某期只有 Total 冇男女細分 -> 唔可以當成「男+女 = 0」而誤報",
      throwsWith(() => verify(withGaps, asSeries(""))) === null
    );
  }
}

// ── R3. 分類相加:2 百萬元嘅抄錯都要捉到 ────────────────────────
//
// 真實 bug:原本用 0.2% **相對**誤差。一個 1,000 百萬元(10 億)嘅抄錯
// 只係 0.167% 偏差,靜靜哋過關。實測 FSTB 兩份檔 30 個年度相加全部**零誤差**,
// 所以來源根本冇四捨五入,門檻改成絕對值。
// (呢組同下面第 5 節嗰組唔同:嗰組測嘅係「捉唔捉到」,呢組釘死嘅係**靈敏度**。)
console.log("\n[R3] 公共經常開支分類相加 — 絕對誤差門檻嘅靈敏度");
{
  const { loadManualIndicator } = await import("../src/data/_lib/manual.js");
  const GOOD = [102308, 135865, 118881, 60517, 35001, 26728, 22875, 22635, 18913, 81310];
  const LABELS = ["教育", "社會福利", "衞生", "保安", "基礎建設", "環境及食物", "經濟", "房屋", "社區及對外事務", "輔助服務"];
  const id = "public_expenditure_policy_groups";
  const tempDir = await mkdtemp(join(tmpdir(), "hkdm-manual-sensitivity-"));
  const path = join(tempDir, `${id}.json`);
  const govtSnapshotPath = join(tempDir, "govt_expenditure.json");
  await writeFile(govtSnapshotPath, JSON.stringify(MANUAL_GOVT_ANCHOR_FIXTURE), "utf8");

  async function tryLoad(values) {
    await writeFile(
      path,
      JSON.stringify({
        indicator_id: id, name_zh: "靈敏度測試", name_en: "Sensitivity",
        unit_zh: "港元", unit_en: "HK$", source_zh: "測試", source_en: "Test",
        source_url: "https://example.gov.hk/", licence: "測試", licence_url: "https://example.gov.hk/t",
        updated_at: "2026-02-25", frequency: "annual", acquisition: "manual",
        category_order: LABELS,
        source_value_multiplier: 1000000, expected_totals: { "2026-27": 625033 },
        series: values.map((value, i) => ({ period: "2026-27", category: LABELS[i], value })),
      }),
      "utf8"
    );
    try { await loadManualIndicator(id, { manualDir: tempDir, govtSnapshotPath }); return null; } catch (e) { return e.message; }
  }
  const bump = (i, d) => GOOD.map((v, k) => (k === i ? v + d : v));

  try {
    check("抄啱 -> 通過", (await tryLoad(GOOD)) === null);
    // 呢條就係釘死靈敏度嗰條:公共總額用舊門檻(0.2% ≈ 1,250 百萬)之下,2 百萬完全唔會嘈
    check("差 2 百萬元 -> 捉到(舊嘅 0.2% 門檻要差過 1,250 百萬先嘈)", (await tryLoad(bump(3, 2))) !== null);
    check("差 −2 百萬元 -> 捉到", (await tryLoad(bump(7, -2))) !== null);
    check("差 1,000 百萬元 -> 捉到(呢個就係舊門檻放咗生嗰個)", (await tryLoad(bump(3, 1000))) !== null);
    check("差 1 百萬元(= 容忍度,防浮點用)-> 唔嘈", (await tryLoad(bump(3, 1))) === null);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// ── R4. 離線導航一定要走真網絡 ─────────────────────────────────
//
// 真實 bug:GitHub Pages 對每個檔送 cache-control: max-age=600(改唔到,冇 _headers 支援)。
// service worker 個 fetch() 冇 cache: "reload" 就會俾瀏覽器嘅 HTTP 快取答咗 ——
// 明明斷咗網,fetch 照回 200,worker 以為仲喺線上,離線橫額永遠唔出。
// 同一次實測仲確認咗 navigator.onLine 斷晒網都回 true,所以佢做唔到後備。
//
// ⚠️ 呢度係**源碼層守衛**,唔係行為測試 —— 行為要開瀏覽器,而 Playwright 唔係
//    本專案嘅依賴(SPEC 第 3 節:避免引入額外 runtime 依賴)。
//    真正嘅行為測試喺 `npm run test:offline`(要 Playwright + 已 build 嘅 dist)。
console.log("\n[R4] service worker 導航 — 源碼守衛");
{
  const templatePath = join(HERE_ROOT, "public", "sw-template.js");
  const template = await readFile(templatePath, "utf8");
  const navBody = template.slice(
    template.indexOf("async function handleNavigation"),
    template.indexOf("async function handleAsset")
  );

  check("導航嘅 fetch 帶住 cache: \"reload\"", /fetch\(\s*request\s*,\s*\{[^}]*cache:\s*"reload"/.test(navBody));
  check("導航搵唔到快取嗰陣唔會退返首頁(soft-404)", !/caches\.match\(\s*url\(\s*"\.\/"\s*\)\s*\)/.test(navBody));
  check("導航搵唔到快取嗰陣會出 404 版", navBody.includes('url("./404")'));
  check("有處理 GitHub Pages 嘅 301 redirect", navBody.includes("response.redirected"));

  // 已 build 嘅 sw.js 都要有 —— 模板啱但 postbuild 出錯嘅話,上線嗰個都係錯。
  const builtPath = join(HERE_ROOT, "dist", "sw.js");
  if (existsSync(builtPath)) {
    const built = await readFile(builtPath, "utf8");
    // ⚠️ 一定要收窄到 handleNavigation 嗰段先搵。
    //    第一版寫成搵成份檔,結果拆走導航嗰個 cache:"reload" 之後佢照樣「ok」——
    //    因為 install 嗰個 precache 迴圈自己都有一個 cache: "reload"。
    //    突變測試捉到嘅,唔係產品 bug,係我呢條斷言本身太鬆。
    const builtNav = built.slice(
      built.indexOf("async function handleNavigation"),
      built.indexOf("async function handleAsset")
    );
    check("已 build 嘅 dist/sw.js 嘅導航段有 cache: \"reload\"", /fetch\(\s*request\s*,\s*\{[^}]*cache:\s*"reload"/.test(builtNav));
    check("已 build 嘅 dist/sw.js 冇剩低未取代嘅佔位符", !built.includes("__CRITICAL__") && !built.includes("__VERSION__"));
  } else {
    console.log("  skip dist/sw.js 未 build,跳過已建置檔案嘅檢查");
  }
}


// ── R5. Fixture:零網絡跑一次完整 transform ─────────────────────
//
// 釘住嘅真實問題:快照有 6 日新鮮期,期間 `observable build` **根本唔會跑 loader**,
// 所以改壞咗 transform 要等 6 日先浮現;而 CI 部署用 HKDM_OFFLINE=1,永遠唔會浮現。
// 實測過:loader 寫漏 source_url,build 照樣綠燈,出緊舊快照。
//
// 解法:錄低一次上游回應(`npm run fixtures`),喺度重播。
// 零網絡、0.2 秒跑晒 11 個指標,改壞 transform 即刻嘈。
//
// 除咗驗 schema,仲要對返已 commit 嘅快照 —— 「合規」同「數啱」係兩件事。
console.log("\n[R5] Fixture 重播 — 零網絡跑完整 transform,對返快照");
{
  const previousMode = process.env.HKDM_FIXTURES;
  process.env.HKDM_FIXTURES = "replay";
  try {
    const { CENSTATD_INDICATORS: censtatd, FISCAL_INDICATORS: fiscal, loadCenstatdIndicator, loadFiscalIndicator } =
      await import("../src/data/_lib/indicators.js");
    const { finaliseIndicator } = await import("../src/data/_lib/snapshot.js");

    const targets = [
      ...Object.keys(censtatd).map((id) => ({ id, load: () => loadCenstatdIndicator(id) })),
      ...Object.keys(fiscal).map((id) => ({ id, load: () => loadFiscalIndicator(id) })),
    ];

    if (!existsSync(join(HERE_ROOT, "src", "data", "_fixtures"))) {
      check("有錄影可以重播", false, "行 `npm run fixtures` 先");
    } else {
      for (const { id, load } of targets) {
        let doc;
        try {
          doc = await load();
        } catch (error) {
          check(`${id} transform 跑得完`, false, error.message.split("\n")[0]);
          continue;
        }

        // 1. 出嚟嘅嘢要符合 SPEC 第 5 節
        const finalised = throwsWith(() => finaliseIndicator(doc, null));
        check(`${id} transform 輸出符合 schema`, finalised === null, finalised?.split("\n").slice(0, 2).join(" "));

        // 2. 同已 commit 嘅快照對數。合規唔等於數啱 —— 呢條先捉到「靜靜哋計錯」。
        const snapshot = await readSnapshot(id);
        if (!snapshot) {
          check(`${id} 有快照可以對`, false, "冇快照");
          continue;
        }
        check(
          `${id} 重播結果同快照一致(${doc.series.length} 點)`,
          doc.content_hash === snapshot.content_hash,
          `重播 ${doc.content_hash} vs 快照 ${snapshot.content_hash}`
        );
      }
    }

    // 重播模式唔准偷偷上網 —— 錄影唔齊就要大聲死,唔可以跌返去 fetch
    const { fetchJson } = await import("../src/data/_lib/http.js");
    let leaked = null;
    try {
      await fetchJson("https://example.invalid/never-recorded.json");
    } catch (error) {
      leaked = error.message;
    }
    check(
      "重播模式撞到冇錄影嘅 URL 會大聲死(唔會偷偷上網)",
      leaked !== null && leaked.includes("搵唔到錄影"),
      leaked ?? "冇掟錯 —— 即係佢真係上咗網"
    );
  } finally {
    if (previousMode === undefined) delete process.env.HKDM_FIXTURES;
    else process.env.HKDM_FIXTURES = previousMode;
  }
}


// ── R6. 離線橫額日期只計首頁顯示緊嘅指標 ───────────────────────
//
// 真實 bug:橫額顯示「數據截至 2026 年 2 月 25 日」,但嗰個日期嚟自
// public_expenditure_policy_groups —— 一個 manual_status: "todo"、一個數都冇填、
// 首頁根本唔會出嘅指標。學生見到嘅 11 個指標入面最舊其實係 2026-03-23。
console.log("\n[R6] 離線橫額日期 — 未填數嘅指標唔可以拉低佢");
{
  const displayed = { indicator_id: "shown", updated_at: "2026-03-23", series: [{ period: "2025", value: 1 }] };
  const todoManual = {
    indicator_id: "todo_manual",
    updated_at: "2020-01-01", // 特登設成好舊
    manual_status: "todo",
    series: [{ period: "2026-27", value: null }],
  };
  const filledManual = {
    indicator_id: "filled_manual",
    updated_at: "2026-02-25",
    manual_status: "filled",
    series: [{ period: "2026-27", value: 42 }],
  };

  check("未填數嘅 manual 指標唔算「顯示緊」", isDisplayed(todoManual) === false);
  check("填咗數嘅 manual 指標算「顯示緊」", isDisplayed(filledManual) === true);
  check("全部值係 null 嘅指標唔算「顯示緊」", isDisplayed({ series: [{ period: "2025", value: null }] }) === false);

  check(
    "2020 年嘅 todo 指標唔會拉低橫額日期",
    pickDataAsOf([displayed, todoManual]) === "2026-03-23",
    pickDataAsOf([displayed, todoManual])
  );
  check(
    "但佢一填咗數就要計入(規則係「有冇顯示」,唔係「係咪 manual」)",
    pickDataAsOf([displayed, { ...todoManual, manual_status: "filled", series: [{ period: "2026-27", value: 7 }] }]) ===
      "2020-01-01"
  );
  check("取最舊唔取最新(橫額要保守)", pickDataAsOf([displayed, filledManual]) === "2026-02-25");
  check("一個都冇顯示 -> null", pickDataAsOf([todoManual]) === null);

  // 對返真實快照:而家 13 份入面有 2 份未填
  const realDocs = [];
  for (const id of ["gdp", "median_wage", "public_expenditure_policy_groups", "phr_waiting_time"]) {
    const doc = await readSnapshot(id);
    if (doc) realDocs.push(doc);
  }
  if (realDocs.length === 4) {
    check(
      "真實快照:兩個未填嘅 manual 指標唔會拉低日期",
      pickDataAsOf(realDocs) === "2026-03-23",
      `而家係 ${pickDataAsOf(realDocs)}`
    );
  }
}


// ── R7. 錄影同快照要原子更新 ───────────────────────────────────
//
// 真實 bug(實測重現過):一個指標唔止打一個 endpoint —— 統計處每個打 3 個
// (comp.json、lang.json、POST),財政儲備打 8 個。錄影做喺 HTTP 層,
// 所以「頭幾個成功、最後一個死」嘅時候,成功嗰幾個嘅錄影已經落咗磁碟,
// 而 fail-soft 保留咗**舊**快照 —— 錄影新、快照舊。
// 下星期 test:checks 就會攞住半新半舊嘅錄影去對舊快照,爆咗但唔係因為有 bug。
//
// 呢度用一個本機 server 測真實路徑(唔係測 mock):一個 200、一個 404,
// 包喺同一個交易入面,確認 200 嗰個唔會偷步落磁碟。
console.log("\n[R7] 錄影原子更新 — 一個 endpoint 死咗,同一指標嘅錄影全部丟棄");
{
  const { withFixtureTransaction, pendingFixtureCount, fetchJson: fetchJsonForTest } =
    await import("../src/data/_lib/http.js");

  const server = createServer((request, response) => {
    if (request.url === "/good") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    } else {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("nope");
    }
  });
  // port 0 = 由系統派一個冇人用嘅。寫死 port 會撞到殘留 process。
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  // ⚠️ 寫去臨時目錄,唔好掂真嘅錄影目錄。
  //    R8 嘅前提係「測試唔准錄影」;R7 如果寫入真目錄,就算佢自己清返都好,
  //    錄影目錄設唯讀之後 R7 就會爆 —— 撞過。
  const tempDir = await mkdtemp(join(tmpdir(), "hkdm-fixture-test-"));
  const listFixtures = async () => (existsSync(tempDir) ? (await readdir(tempDir)).sort() : []);
  const before = await listFixtures();

  const previousMode = process.env.HKDM_FIXTURES;
  const previousDir = process.env.HKDM_FIXTURE_DIR;
  process.env.HKDM_FIXTURES = "record";
  process.env.HKDM_FIXTURE_DIR = tempDir;
  try {
    // 交易中途死 -> 全部丟棄
    let threw = null;
    try {
      await withFixtureTransaction(async () => {
        await fetchJsonForTest(`${base}/good`, { retries: 1 });
        check("交易入面成功嘅錄影係入咗緩衝,未落磁碟", pendingFixtureCount() === 1, `緩衝 ${pendingFixtureCount()} 個`);
        await fetchJsonForTest(`${base}/bad`, { retries: 1 });
      });
    } catch (error) {
      threw = error;
    }
    check("交易入面有 endpoint 死咗 -> 掟錯出嚟", threw !== null);
    check("緩衝已清空", pendingFixtureCount() === 0);
    const afterRollback = await listFixtures();
    check(
      "回滾之後磁碟上一個新錄影都冇",
      afterRollback.length === before.length && afterRollback.every((f, i) => f === before[i]),
      `多咗 ${afterRollback.filter((f) => !before.includes(f)).join("、")}`
    );

    // 交易全部成功 -> 要落磁碟
    await withFixtureTransaction(async () => {
      await fetchJsonForTest(`${base}/good`, { retries: 1 });
    });
    const afterCommit = await listFixtures();
    const added = afterCommit.filter((f) => !before.includes(f));
    check("交易成功之後錄影落咗磁碟", added.length === 1, `多咗 ${added.length} 個`);

  } finally {
    if (previousMode === undefined) delete process.env.HKDM_FIXTURES;
    else process.env.HKDM_FIXTURES = previousMode;
    if (previousDir === undefined) delete process.env.HKDM_FIXTURE_DIR;
    else process.env.HKDM_FIXTURE_DIR = previousDir;
    server.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

// ── 公共開支頁面:總額註腳及年度比較 ──────────────────────────
const { testPublicExpenditureViews } = await import("./test-public-expenditure-views.mjs");
testPublicExpenditureViews(check);
const { testExpenditureScopeGate } = await import("./test-expenditure-scope-gate.mjs");
await testExpenditureScopeGate(check);

// ── 教學讀數與引用:已知答案／缺數／錯口徑突變 ───────────────
const { testTeachingAnchors } = await import("./test-teaching-anchors.mjs");
await testTeachingAnchors(check);
const { testCitations } = await import("./test-citations.mjs");
testCitations(check);
const { testSparklines } = await import("./test-sparklines.mjs");
await testSparklines(check);
const { testTechnologyData } = await import("./test-technology-data.mjs");
await testTechnologyData(check);

// ── R8. test:checks 唔准寫錄影 ─────────────────────────────────
//
// R5 嘅突變測試前提係「改壞 transform,錄影唔跟住變」。
// 如果測試流程任何一條路會觸發錄影,成個突變測試就係假嘅 ——
// 改壞咗之後錄影一齊變,永遠對得上,永遠綠燈。
console.log("\n[R8] 測試流程唔准寫錄影");
{
  check("HKDM_FIXTURES 唔係 record", process.env.HKDM_FIXTURES !== "record", process.env.HKDM_FIXTURES);
  const now = await fixtureDirState();
  check(
    `跑完成套測試,錄影目錄一個 byte 都冇改(${now.length} 個檔)`,
    now.length === fixtureStateAtStart.length && now.every((entry, i) => entry === fixtureStateAtStart[i]),
    "有錄影被改咗 —— R5 嘅突變測試會變成假綠燈"
  );
}

// ── 總結 ──────────────────────────────────────────────────────
console.log(`\n${passed} 個通過,${failed} 個失敗`);
if (failed > 0) {
  console.error("\n有檢查器捉唔到佢應該捉到嘅嘢。喺呢個狀態下,「驗證通過」係冇意義嘅。");
  process.exit(1);
}
console.log("全部檢查器都自證過:整壞嘢佢哋真係會嘈。");
