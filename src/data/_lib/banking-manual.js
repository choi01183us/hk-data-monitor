// 金管局表 3.1 人手抄數守衛。數目唔容許一間誤差；唔沿用財政百萬元門檻。
// source_components 只係維護底稿，逐欄核對官方 XLS 仍不可省略。
export const BANKING_CATEGORIES = Object.freeze(["持牌銀行", "有限制牌照銀行", "接受存款公司"]);
const SOURCE_FIELDS = Object.freeze([
  ["lb_incorp_hk", "lb_incorp_outside_hk"],
  ["rlb_incorp_hk", "rlb_incorp_outside_hk"],
  ["dtc_incorp_hk", "dtc_incorp_outside_hk"],
]);
const SOURCE_URL = "https://www.hkma.gov.hk/media/eng/doc/market-data-and-statistics/monthly-statistical-bulletin/T0301.xls";
const count = (value) => value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
const sameOrder = (values, expected) => Array.isArray(values) && values.length === expected.length && values.every((value, index) => value === expected[index]);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function monthEnd(period) {
  if (typeof period !== "string" || !/^(?:19|[2-9]\d)\d{2}-(?:0[1-9]|1[0-2])$/.test(period)) throw new Error("銀行抄數：period 必須是 YYYY-MM 月份，唔接受年度00、季度或完整日期");
  const [year, month] = period.split("-").map(Number);
  return `${period}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
}

/** 驗原始欄與輸出分類，所有錯誤 hard fail；不修改傳入物件。 */
export function verifyBankingManual(fields) {
  if (!object(fields) || fields.indicator_id !== "banking_institutions" || fields.acquisition !== "manual" || fields.frequency !== "monthly") throw new Error("銀行抄數：指標必須是 monthly manual banking_institutions");
  if (fields.source_value_multiplier !== 1 || fields.unit_zh !== "間" || fields.unit_en !== "institutions" || fields.unit_source_zh !== "間" || fields.value_digits !== 0) throw new Error("銀行抄數：原始數目單位為間，倍率固定1，精度為整數");
  if (fields.source_url !== SOURCE_URL || fields.source_zh !== "香港金融管理局") throw new Error("銀行抄數：必須保留金管局表3.1原始來源");
  if (!sameOrder(fields.category_order, BANKING_CATEGORIES) || !Array.isArray(fields.series) || fields.series.length === 0) throw new Error("銀行抄數：保留持牌／有限制／接受存款三類及原表次序");
  if (!object(fields.source_components) || !Array.isArray(fields.totals)) throw new Error("銀行抄數：必須提供逐月來源六欄底稿及原始總數");
  const periods = new Map();
  let previous = "";
  for (const point of fields.series) {
    if (!object(point)) throw new Error("銀行抄數：每一點必須是物件");
    monthEnd(point.period);
    if (point.period < previous || !count(point.value)) throw new Error("銀行抄數：月份順序或非負整數／null數目錯誤");
    previous = point.period;
    if (!periods.has(point.period)) periods.set(point.period, []);
    periods.get(point.period).push(point);
  }
  const months = [...periods.keys()];
  if (fields.updated_at !== monthEnd(months.at(-1))) throw new Error("銀行抄數：updated_at 必須是最後一期真正月末日期，唔係抄數日");
  if (!sameOrder(Object.keys(fields.source_components).sort(), [...months].sort()) || fields.totals.length !== months.length) throw new Error("銀行抄數：來源底稿或總數月份缺漏／多出");
  const totals = new Map();
  for (const total of fields.totals) {
    if (!object(total) || !periods.has(total.period) || totals.has(total.period) || !count(total.value)) throw new Error("銀行抄數：總數月份重複／錯誤或數值唔合法");
    totals.set(total.period, total.value);
  }
  for (const [period, parts] of periods) {
    if (!sameOrder(parts.map((point) => point.category), BANKING_CATEGORIES)) throw new Error("銀行抄數：每月必須完整跟原表三類次序，包括null；不能加入代表辦事處");
    const source = fields.source_components[period];
    const keys = [...SOURCE_FIELDS.flat(), "all_ais", "lros"].sort();
    if (!object(source) || !sameOrder(Object.keys(source).sort(), keys) || !keys.every((key) => count(source[key]))) throw new Error("銀行抄數：來源必須有六欄、all_ais、lros，值為非負整數或null");
    SOURCE_FIELDS.forEach(([local, overseas], index) => {
      const expected = source[local] === null || source[overseas] === null ? null : source[local] + source[overseas];
      if (!count(expected) || parts[index].value !== expected) throw new Error("銀行抄數：分類數目必須精確等於同一牌照的本地加境外欄，缺欄保持null");
    });
    if (totals.get(period) !== source.all_ais) throw new Error("銀行抄數：總數必須逐期等於原表all_ais，唔加lros");
    if (parts.every((point) => point.value !== null)) {
      const sum = parts.reduce((total, point) => total + point.value, 0);
      if (!Number.isSafeInteger(sum) || source.all_ais === null || sum !== source.all_ais) throw new Error("銀行抄數：三類填齊後必須等於原表所有認可機構，零誤差");
    }
  }
}
