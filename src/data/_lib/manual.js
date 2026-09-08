// 讀 manual/ 入面人手抄嘅 JSON,同自動抓嘅一視同仁。
//
// SPEC 第 6 節:「PDF / HTML-only 的處理方式:唔好寫 PDF parser。一律人手抄一次,
// 寫成 manual/<id>.json,acquisition: "manual"。」
// SPEC 第 7 節:「manual/ 的檔案 Actions 永遠唔碰。」
//
// 呢度做嘅嘢:
//   1. 讀檔、剝走 "_" 開頭嘅維護筆記欄位
//   2. 數值係「原始單位」(例如百萬元)嘅話,按 source_value_multiplier 換算
//   3. 全部 value 都係 null = 未填 -> manual_status: "todo",首頁唔出卡(SPEC 第 2 節第 4 條)
//   4. 有 expected_totals 就驗分類相加,抄錯一個數即刻知
//   5. 公共經常開支另驗 PDF 次序、完整年度有總額、三組跨來源錨
//   6. 交畀 buildIndicator(),之後同自動抓嘅走同一條 schema 驗證同快照流程

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildIndicator } from "./schema.js";

/** 分類相加同 expected_totals 最多差幾多(原始單位)。抄數應該係一個都唔差。 */
const SUM_TOLERANCE_SOURCE_UNITS = 1;

const HERE = dirname(fileURLToPath(import.meta.url));
export const MANUAL_DIR = join(HERE, "..", "..", "..", "manual");
const GOVT_EXPENDITURE_SNAPSHOT = join(HERE, "..", "_snapshots", "govt_expenditure.json");
const PUBLIC_EXPENDITURE_ID = "public_expenditure_policy_groups";

// 2026-27 預算案附錄 B 第 II 部,PDF p8。不可用 manual 檔自身嘅次序做標準,
// 否則骨架同 category_order 一齊排錯,檢查器會一齊信錯。
const PUBLIC_EXPENDITURE_PDF_ORDER = Object.freeze([
  "教育", "社會福利", "衞生", "保安", "基礎建設", "環境及食物", "經濟", "房屋", "社區及對外事務", "輔助服務",
]);
const SHARED_EXPENDITURE_CATEGORIES = Object.freeze(["教育", "社會福利", "衞生"]);

/** 跨來源檢查用原始百萬元;快照值係港元。純函式畀突變測試自證,loader 必須呼叫。 */
export function validatePublicExpenditure(fields, govtExpenditure) {
  const where = `manual/${PUBLIC_EXPENDITURE_ID}.json`;
  const matchesPdfOrder = (categories) => Array.isArray(categories) &&
    categories.length === PUBLIC_EXPENDITURE_PDF_ORDER.length &&
    categories.every((category, i) => category === PUBLIC_EXPENDITURE_PDF_ORDER[i]);

  if (!matchesPdfOrder(fields.category_order)) {
    throw new Error(`${where}:category_order 必須照附錄 B PDF 次序:${PUBLIC_EXPENDITURE_PDF_ORDER.join("、")}`);
  }
  if (fields.source_value_multiplier !== 1000000 || fields.unit_zh !== "港元" || fields.unit_en !== "HK$") {
    throw new Error(`${where}:原始百萬元必須乘 1000000 換算成港元(HK$),唔可以改跨來源錨嘅單位`);
  }
  if (!Array.isArray(fields.series) || fields.series.length === 0) {
    throw new Error(`${where}:series 必須保留每期十個 PDF 組別,未填值用 null`);
  }
  const periods = new Map();
  for (const point of fields.series) {
    if (!point || typeof point.period !== "string" || !point.period) {
      throw new Error(`${where}:series 每點必須有 period 字串`);
    }
    if (point.value !== null && (typeof point.value !== "number" || !Number.isFinite(point.value))) {
      throw new Error(`${where} ${point.period}/${point.category}:value 必須係有效數字或 null`);
    }
    if (!periods.has(point.period)) periods.set(point.period, []);
    periods.get(point.period).push(point);
  }

  const expected = fields.expected_totals ?? {};
  for (const [period, parts] of periods) {
    if (!matchesPdfOrder(parts.map((point) => point.category))) {
      throw new Error(`${where} ${period}:series 類別必須完整照附錄 B PDF 次序,包括 null 骨架`);
    }
    const total = expected[period];
    if (parts.every((point) => point.value !== null) && (total === null || total === undefined)) {
      throw new Error(`${where} ${period}:十組已填齊,必須填寫 PDF 嘅 expected_totals,唔可以略過總額檢查`);
    }
    if (total !== null && total !== undefined && (typeof total !== "number" || !Number.isFinite(total))) {
      throw new Error(`${where} ${period}:expected_totals 必須係有效數字`);
    }
  }

  const filledAnchors = fields.series.filter((point) =>
    SHARED_EXPENDITURE_CATEGORIES.includes(point.category) && point.value !== null
  );
  if (filledAnchors.length === 0) return; // 未填數唔係錯;次序同已填年度嘅總額仍然已驗。
  if (govtExpenditure?.indicator_id !== "govt_expenditure" || govtExpenditure.unit_zh !== "港元" ||
      govtExpenditure.unit_en !== "HK$" || !Array.isArray(govtExpenditure.series)) {
    throw new Error(`${where}:跨來源錨需要有效嘅 govt_expenditure 港元快照,唔可以用預設值`);
  }
  for (const point of filledAnchors) {
    const anchors = govtExpenditure.series.filter((anchor) =>
      anchor.period === point.period && anchor.category === point.category
    );
    if (anchors.length !== 1 || typeof anchors[0].value !== "number" || !Number.isFinite(anchors[0].value)) {
      throw new Error(`${where} ${point.period}/${point.category}:govt_expenditure 必須有唯一有效跨來源錨`);
    }
    if (point.value * 1000000 !== anchors[0].value) {
      throw new Error(`${where} ${point.period}/${point.category}:跨來源錨對唔上 govt_expenditure` +
        `(manual ${point.value} 百萬元,快照 ${anchors[0].value / 1000000} 百萬元),必須完全相等`);
    }
  }
}

// 兩個讀檔位置都係測試 seam;正式入口預設永遠讀 repo 嘅人手數據同政府快照。
// 固定測試錨唔係網站 fallback,亦唔會喺正式載入失敗時被採用。
export async function loadManualIndicator(id, {
  manualDir = MANUAL_DIR,
  govtSnapshotPath = GOVT_EXPENDITURE_SNAPSHOT,
} = {}) {
  const path = join(manualDir, `${id}.json`);
  let raw;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`manual/${id}.json 讀唔到:${error.message}`, { cause: error });
  }

  // "_" 開頭嘅係畀維護者寫筆記用,唔出街
  const fields = Object.fromEntries(Object.entries(raw).filter(([key]) => !key.startsWith("_")));

  if (fields.acquisition !== "manual") {
    throw new Error(`manual/${id}.json 嘅 acquisition 一定要係 "manual",而家係 "${fields.acquisition}"`);
  }
  if (fields.indicator_id !== id) {
    throw new Error(`manual/${id}.json 嘅 indicator_id 係 "${fields.indicator_id}",同檔名對唔上`);
  }
  if (!Array.isArray(fields.series) || fields.series.length === 0) {
    throw new Error(`manual/${id}.json 嘅 series 係空的 —— 就算未填數,都要列出期數同分類,value 填 null`);
  }

  if (id === PUBLIC_EXPENDITURE_ID) {
    // 只喺有已填嘅共享組別先讀錨;驗證函式會連未填骨架一齊驗。檔案或內容有錯一律
    // 普通 Error -> hard fail,唔屬於網絡 UpstreamError 嘅 fail-soft 範圍。
    const hasFilledAnchor = fields.series.some((point) =>
      SHARED_EXPENDITURE_CATEGORIES.includes(point?.category) && point?.value !== null
    );
    let govtExpenditure;
    if (hasFilledAnchor) {
      try {
        govtExpenditure = JSON.parse(await readFile(govtSnapshotPath, "utf8"));
      } catch (error) {
        throw new Error(`manual/${id}.json:跨來源錨 govt_expenditure 快照讀唔到:${error.message}`, { cause: error });
      }
    }
    validatePublicExpenditure(fields, govtExpenditure);
  }

  const multiplier = Number(fields.source_value_multiplier ?? 1);
  const series = fields.series.map((point) => ({
    ...point,
    value: point.value === null || point.value === undefined ? null : Number(point.value) * multiplier,
  }));

  const filled = series.filter((point) => point.value !== null).length;
  const status = filled === 0 ? "todo" : filled < series.length ? "partial" : "filled";

  // 有預期總額就驗:十個組別相加要等於 PDF 自己寫嘅總額
  const expected = fields.expected_totals ?? {};
  for (const [period, totalRaw] of Object.entries(expected)) {
    if (totalRaw === null || totalRaw === undefined) continue;
    const parts = series.filter((point) => point.period === period);
    if (parts.length === 0 || parts.some((point) => point.value === null)) continue; // 未填齊唔驗
    const sum = parts.reduce((acc, point) => acc + point.value, 0);
    const total = Number(totalRaw) * multiplier;
    // 用原始單位嘅絕對差,唔用百分比。PDF 嘅十個組別係整數百萬元,相加一定等於總額;
    // 用「0.2% 相對誤差」嘅話,一個 1,000 百萬元嘅抄錯只係 0.167% 偏差,會靜靜哋過關。
    const diffSourceUnits = Math.abs(sum - total) / multiplier;
    if (diffSourceUnits > SUM_TOLERANCE_SOURCE_UNITS) {
      throw new Error(
        `manual/${id}.json ${period}:分類相加 ${sum / multiplier} 對唔上 expected_totals 寫嘅 ${totalRaw}` +
          `(差 ${diffSourceUnits.toFixed(0)},單位同 JSON 入面一樣)。多數係抄錯咗一個數,逐個對返 PDF。`
      );
    }
  }

  const { series: _ignored, source_value_multiplier: _m, expected_totals: _t, transcribed_at, ...rest } = fields;

  return buildIndicator({
    ...rest,
    // 人手抄嘅「抓數時間」= 抄嗰日。未填就用 updated_at 頂住,schema 要求呢欄非空。
    fetched_at: transcribed_at ? `${transcribed_at}T00:00:00Z` : `${fields.updated_at}T00:00:00Z`,
    manual_status: status,
    manual_filled: `${filled}/${series.length}`,
    series,
  });
}
