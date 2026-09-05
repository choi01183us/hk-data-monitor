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
//   5. 交畀 buildIndicator(),之後同自動抓嘅走同一條 schema 驗證同快照流程

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildIndicator } from "./schema.js";

/** 分類相加同 expected_totals 最多差幾多(原始單位)。抄數應該係一個都唔差。 */
const SUM_TOLERANCE_SOURCE_UNITS = 1;

const HERE = dirname(fileURLToPath(import.meta.url));
export const MANUAL_DIR = join(HERE, "..", "..", "..", "manual");

export async function loadManualIndicator(id) {
  const path = join(MANUAL_DIR, `${id}.json`);
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
