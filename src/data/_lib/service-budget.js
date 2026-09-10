// One official annual CSV; no PDF parser or browser-side API requests.
import {fetchText, UpstreamError} from "./http.js";
import {parseCsv} from "./csv.js";
import {buildIndicator} from "./schema.js";
import {SERVICE_PROGRAMMES, SERVICE_TEXT, SERVICE_PERIODS, SERVICE_CSV} from "../../components/service-programmes.js";

export {SERVICE_PERIODS};
export const SERVICE_INDICATORS = {service_programme_provision: {name_zh: SERVICE_TEXT.name_zh}};
export const SERVICE_HEADERS = ["總目", "綱領編號", "綱領", "機構", "2024-25\r\n(實際)\r\n(百萬元)", "2025-26\r\n(原來預算)\r\n(百萬元)", "2025-26\r\n(修訂)\r\n(百萬元)", "2026-27\r\n(預算)\r\n(百萬元)"];
const selectedHeads = new Set(SERVICE_PROGRAMMES.map((p) => p.head));
const key = (row) => `${row.總目}/${row.綱領編號}`;

/** CSV is in millions with exactly one decimal: retain integer tenths until conversion. */
export function serviceBudgetValue(text) {
  if (typeof text !== "string" || !/^\d+\.\d$/.test(text)) throw new UpstreamError(`綱領撥款數值／精度改變：${text}`);
  const tenths = Number(text.replace(".", ""));
  if (!Number.isSafeInteger(tenths) || !Number.isSafeInteger(tenths * 100000)) throw new UpstreamError("綱領撥款超出安全整數範圍");
  return tenths;
}

export function parseServiceBudgetCsv(text) {
  if (typeof text !== "string") throw new UpstreamError("綱領 CSV 回應唔係文字");
  let parsed;
  try { parsed = parseCsv(text); }
  catch (error) { throw new UpstreamError("綱領 CSV 結構改變", {cause: error}); }
  const {headers} = parsed;
  if (headers.length !== SERVICE_HEADERS.length || new Set(headers).size !== headers.length || SERVICE_HEADERS.some((h) => !headers.includes(h))) throw new UpstreamError("綱領 CSV 年份／預算狀態／單位／欄名改變，需要核對新版 PDF");
  const rows = parsed.rows.filter((row) => selectedHeads.has(row.總目));
  const seen = new Set();
  for (const row of rows) {
    const programme = SERVICE_PROGRAMMES.find((p) => `${p.head}/${p.programme}` === key(row));
    if (!programme || row.綱領 !== programme.name_zh || !programme.sectors.includes(row.機構)) throw new UpstreamError(`綱領／名稱／機構分類改變：${key(row)}`);
    const sectorKey = `${key(row)}:${row.機構}`;
    if (seen.has(sectorKey)) throw new UpstreamError(`綱領 CSV 重複機構：${sectorKey}`);
    seen.add(sectorKey);
    for (const column of SERVICE_HEADERS.slice(4)) serviceBudgetValue(row[column]);
  }
  for (const p of SERVICE_PROGRAMMES) for (const sector of p.sectors) {
    if (!seen.has(`${p.head}/${p.programme}:${sector}`)) throw new UpstreamError(`綱領 CSV 遺失機構：${p.head}/${p.programme}:${sector}`);
  }
  return {headers, rows};
}

export function buildServiceSeries(rows) {
  return SERVICE_PERIODS.flatMap(({period, column}) => SERVICE_PROGRAMMES.map((p) => {
    // Combine only the sectors of one programme, as in the PDF programme total.
    const tenths = rows.filter((row) => key(row) === `${p.head}/${p.programme}`).reduce((sum, row) => sum + serviceBudgetValue(row[column]), 0);
    const value = tenths * 100000;
    if (!Number.isSafeInteger(value)) throw new Error("綱領港元換算超出安全整數範圍");
    return {period, category: p.category, value};
  }));
}

/** Check the final output, independently looking up each exact source cell. */
export function verifyServiceProgrammeResult(rows, series) {
  if (!Array.isArray(series) || series.length !== SERVICE_PROGRAMMES.length * SERVICE_PERIODS.length) throw new Error("綱領最終數列遺失或增加資料");
  let index = 0;
  for (const {period, column} of SERVICE_PERIODS) for (const p of SERVICE_PROGRAMMES) {
    let expected = 0;
    for (const sector of p.sectors) {
      const source = rows.filter((row) => row.總目 === p.head && row.綱領編號 === p.programme && row.綱領 === p.name_zh && row.機構 === sector);
      if (source.length !== 1) throw new Error("綱領最終核對找不到唯一來源格");
      // Independent decimal-string conversion; never reuse the output's category or multiplier.
      const match = /^(\d+)\.(\d)$/.exec(source[0][column]);
      if (!match) throw new Error("綱領最終核對來源格格式錯誤");
      expected += Number(match[1]) * 1000000 + Number(match[2]) * 100000;
    }
    const point = series[index++];
    if (!point || point.period !== period || point.category !== p.category || point.value !== expected || !Number.isSafeInteger(expected)) throw new Error("綱領最終數列唔等於來源，可能對調綱領、讀錯原來預算欄或換算錯");
  }
}

export async function loadServiceProgrammeIndicator(id) {
  if (!Object.hasOwn(SERVICE_INDICATORS, id)) throw new Error(`未登記綱領指標：${id}`);
  const {text, fetchedAt} = await fetchText(SERVICE_CSV);
  const {rows} = parseServiceBudgetCsv(text);
  const series = buildServiceSeries(rows);
  verifyServiceProgrammeResult(rows, series);
  return buildIndicator({
    indicator_id: id, name_zh: SERVICE_TEXT.name_zh, name_en: SERVICE_TEXT.name_en,
    unit_zh: "港元", unit_en: "HK$", unit_short_zh: "元", unit_source_zh: "百萬元", value_digits: 0,
    source_zh: "財政預算案《開支預算》", source_en: "Budget Estimates of Expenditure",
    source_url: SERVICE_CSV, source_note_zh: SERVICE_TEXT.source_note_zh,
    licence: "data.gov.hk 使用條款", licence_url: "https://data.gov.hk/tc/terms-and-conditions",
    updated_at: "2026-02-25", fetched_at: fetchedAt, frequency: "annual", acquisition: "api",
    category: "公共服務與預算", question_zh: SERVICE_TEXT.question_zh,
    basis_zh: SERVICE_TEXT.basis_zh, basis_en: SERVICE_TEXT.basis_en, notes_zh: SERVICE_TEXT.notes_zh,
    category_order: SERVICE_PROGRAMMES.map((p) => p.category),
    period_notes: Object.fromEntries(SERVICE_PERIODS.map((p) => [p.period, p.status_zh])),
    chart: {type: "line", y_zero: true}, anchors: [], series,
  });
}
