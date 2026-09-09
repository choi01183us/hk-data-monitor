// 差餉物業估價署私人住宅指數：同一支小型 CSV adapter 只取官方 All Classes。
// 口徑／基期：Data_Dic.pdf 表 1.3、1.4；唔解析 PDF，唔自行平均 A–E 類。
import { fetchText, UpstreamError } from "./http.js";
import { parseCsv } from "./csv.js";
import { buildIndicator } from "./schema.js";
import { anchorVersusYear, collectAnchors } from "../../components/anchor.js";

const DATASET = "https://data.gov.hk/tc-data/dataset/hk-rvd-tsinfo_rvd-property-market-statistics";
const DICTIONARY = "https://www.rvd.gov.hk/datagovhk/Data_Dic.pdf";
const TECHNICAL_NOTES = "https://www.rvd.gov.hk/doc/tc/statistics/15_technotes.pdf";
export const PROPERTY_HEADERS = ["Month", ...["Class A", "Class B", "Class C", "Class D", "Class E", "Classes A, B & C", "Classes D & E", "All Classes"].flatMap((name) => [name, `${name} - Remarks`])];

export const PROPERTY_INDICATORS = {
  private_domestic_price: {
    file: "1.4M.csv", kind: "PRICE", column: "All Classes",
    resource: "99e60368-7e2f-482d-9464-d96f3c6f6cdf",
    name_zh: "私人住宅售價指數", name_en: "Private domestic price index, all classes",
    question_zh: "樓價點變？同租金走勢一樣嗎？",
    basis_zh: "全港私人住宅所有類別售價指數，1999 年 = 100，反映樓宇質素不變下的售價轉變；不包括住宅首次買賣",
    notes_zh: "指數唔係一個單位嘅平均樓價，亦唔代表個別物業估值或供樓開支。住宅首次買賣不包括在分析內。",
  },
  private_domestic_rent: {
    file: "1.3M.csv", kind: "RENTAL", column: "All Classes",
    resource: "979574f2-77ef-4d30-9e4f-26fb4c85a4b4",
    name_zh: "私人住宅租金指數", name_en: "Private domestic rental index, all classes",
    question_zh: "租樓嘅市場成本升咗幾多？",
    basis_zh: "全港私人住宅所有類別租金指數，1999 年 = 100，反映樓宇質素不變下的租金轉變；以新訂租約淨租金分析，不包括差餉、管理費及其他費用",
    notes_zh: "指數唔係每月租金金額，亦唔係所有現有租客嘅租金升幅。新訂租約淨租金同消費物價指數嘅住屋項目，涵蓋範圍及量度方法不同。",
  },
};

export function parsePropertyMonth(text) {
  const match = /^(0[1-9]|1[0-2])-(\d{4})$/.exec(text);
  if (!match) throw new UpstreamError(`物業 CSV 月份格式改變：${text}`);
  return `${match[2]}-${match[1]}`;
}

export function propertyIndexValue(text) {
  if (text === "") return null;
  // 字典指定 Number；未知文字／符號唔默認成缺值或零。
  if (typeof text !== "string" || !/^\d+(?:\.\d)?$/.test(text) || Number(text) <= 0) {
    throw new UpstreamError(`物業 CSV 指數應為正數（一位小數）：${text}`);
  }
  return Number(text);
}

export function propertyRemark(text) {
  // 字典只定義 P、Z。空白或分隔符並非另一種統計狀態。
  if (typeof text !== "string" || !/^(?:|P|Z|PZ|ZP|P Z|Z P)$/.test(text)) {
    throw new UpstreamError(`物業 CSV 未知註記：${text}`);
  }
  return [text.includes("P") ? "臨時數字，日後可能修訂" : "", text.includes("Z") ? "由少於 20 宗交易推算" : ""].filter(Boolean).join("；");
}

export function propertyUpdatedAt(lastModified) {
  if (typeof lastModified !== "string" || !/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(lastModified) || !Number.isFinite(Date.parse(lastModified)) || new Date(lastModified).toUTCString() !== lastModified) {
    throw new UpstreamError("物業 CSV 缺少有效 Last-Modified 更新日期，唔用抓取日期頂替");
  }
  return new Date(lastModified).toISOString().slice(0, 10);
}

export function verifyPropertyBase(rows) {
  const base = rows.filter((row) => row.Month.endsWith("-1999"));
  // 1999 年平均 = 100；每月數字四捨五入至 0.1，可相差 0.05。
  // 用整數十分位相加，十二個月最多差 6。呢個唔係財政分類相加門檻。
  if (base.length !== 12 || new Set(base.map((row) => row.Month)).size !== 12 || base.some((row) => propertyIndexValue(row["All Classes"]) === null)) {
    throw new UpstreamError("物業 CSV 缺少完整 1999 年基期，唔能確認 1999 = 100");
  }
  const sumTenths = base.reduce((sum, row) => sum + Math.round(propertyIndexValue(row["All Classes"]) * 10), 0);
  if (Math.abs(sumTenths - 12000) > 6) throw new UpstreamError("物業 CSV 的 1999 年平均不再為 100，可能改咗基期或單位");
}

export function parsePropertyCsv(text, kind) {
  if (!["PRICE", "RENTAL"].includes(kind)) throw new Error(`未知物業指數類型：${kind}`);
  if (typeof text !== "string") throw new UpstreamError("物業 CSV 回應唔係文字");
  const source = text.replace(/^\uFEFF/, "");
  const end = source.indexOf("\n");
  const title = source.slice(0, end).replace(/,+\s*$/, "").replace(/\s+/g, " ").trim();
  if (end < 0 || title !== `PRIVATE DOMESTIC - ${kind} INDICES BY CLASS ( TERRITORY-WIDE ) [MONTHLY]`) {
    throw new UpstreamError(`物業 CSV 標題／指數類型／地域／頻率改變：${title}`);
  }
  let parsed;
  try { parsed = parseCsv(source.slice(end + 1)); }
  catch (error) { throw new UpstreamError(`物業 CSV 結構改變：${error.message}`, { cause: error }); }
  const { headers, rows } = parsed;
  if (headers.length !== PROPERTY_HEADERS.length || new Set(headers).size !== headers.length || PROPERTY_HEADERS.some((header) => !headers.includes(header))) {
    throw new UpstreamError("物業 CSV 欄名／單位改變；必須有唯一 All Classes 及其 Remarks");
  }
  if (rows.length === 0) throw new UpstreamError("物業 CSV 冇月份數據");
  let previous = null;
  for (const row of rows) {
    const period = parsePropertyMonth(row.Month);
    const month = Number(period.slice(0, 4)) * 12 + Number(period.slice(5)) - 1;
    if (previous !== null && month !== previous + 1) throw new UpstreamError("物業 CSV 月份缺少、重複或次序改變");
    propertyIndexValue(row["All Classes"]);
    propertyRemark(row["All Classes - Remarks"]);
    previous = month;
  }
  if (rows[0].Month !== "01-1993") throw new UpstreamError("物業 CSV 起點改變；需要 1993 年 1 月起完整月度數列");
  verifyPropertyBase(rows);
  return parsed;
}

/** 驗最終輸出逐點等於來源 All Classes；唔只驗来源自己似唔似啱。 */
export function verifyPropertyResult(rows, series, periodNotes) {
  if (!Array.isArray(series) || rows.length !== series.length) throw new Error("物業最終數列遺失或增加月份");
  const expectedNotes = {};
  rows.forEach((row, index) => {
    const point = series[index];
    const period = parsePropertyMonth(row.Month);
    const note = propertyRemark(row["All Classes - Remarks"]);
    if (note) expectedNotes[period] = note;
    if (point.period !== period || point.category !== undefined || point.value !== propertyIndexValue(row["All Classes"])) {
      throw new Error("物業最終數列唔等於來源 All Classes，可能讀錯欄、改單位或缺值填零");
    }
  });
  if (JSON.stringify(periodNotes) !== JSON.stringify(expectedNotes)) throw new Error("物業最終註記遺失或錯配月份");
}

export function propertyAnchors(series) {
  const latest = series.at(-1);
  if (!latest || latest.value === null) return [];
  const previous = `${Number(latest.period.slice(0, 4)) - 1}${latest.period.slice(4)}`;
  return collectAnchors(anchorVersusYear(series, previous, { label: "去年同月", labelEn: "same month a year earlier" }));
}

export async function loadPropertyIndicator(id) {
  const spec = PROPERTY_INDICATORS[id];
  if (!spec) throw new Error(`物業指標 ${id} 唔喺登記冊`);
  const url = `https://www.rvd.gov.hk/datagovhk/${spec.file}`;
  const { text, response, fetchedAt } = await fetchText(url);
  const { rows } = parsePropertyCsv(text, spec.kind);
  const series = rows.map((row) => ({ period: parsePropertyMonth(row.Month), value: propertyIndexValue(row[spec.column]) }));
  const periodNotes = {};
  for (const row of rows) {
    const note = propertyRemark(row["All Classes - Remarks"]);
    if (note) periodNotes[parsePropertyMonth(row.Month)] = note;
  }
  verifyPropertyResult(rows, series, periodNotes);
  return buildIndicator({
    indicator_id: id, name_zh: spec.name_zh, name_en: spec.name_en,
    unit_zh: "指數（1999 年 = 100）", unit_en: "Index (1999 = 100)", unit_short_zh: "點", unit_source_zh: "1999 = 100", value_digits: 1,
    source_zh: "差餉物業估價署（經資料一線通 DATA.GOV.HK 提供）", source_en: "Rating and Valuation Department, via DATA.GOV.HK",
    source_url: `${DATASET}/resource/${spec.resource}`,
    source_note_zh: `原始 CSV：${url}；基期及註記：${DICTIONARY}（表 ${spec.kind === "PRICE" ? "1.4" : "1.3"}）；技術附註：${TECHNICAL_NOTES}`,
    licence: "data.gov.hk 使用條款", licence_url: "https://data.gov.hk/tc/terms-and-conditions",
    updated_at: propertyUpdatedAt(response.headers.get("last-modified")), fetched_at: fetchedAt,
    frequency: "monthly", acquisition: "api", category: "住屋與生活成本", question_zh: spec.question_zh,
    basis_zh: spec.basis_zh,
    notes_zh: "原始指數以 1999 年 = 100，數值未換算，按月更新；本頁只取官方 All Classes，唔把各類指數相加。" + spec.notes_zh + "標記 P 代表臨時數字；Z 代表少於 20 宗交易，詳見資料表嘅逐月註記。",
    chart: { type: "line", y_zero: false }, anchors: propertyAnchors(series), period_notes: periodNotes, series,
  });
}
