// 驗實際輸出對返來源 DC／Total，避免 18 區互換、男性冒充人口、工作住戶冒充全體住戶。
import { DISTRICT_WITH_HK } from "../../components/district-categories.js";
import { toValue } from "./censtatd.js";

const SEXES = ["", "M", "F"];
const AGES = ["", "0-14", "15-24", "25-64", "65_and_over"];
const NAMES = new Map(DISTRICT_WITH_HK.map(({ code, label_zh }) => [code, code === "" ? "Total" : label_zh]));

export function districtThousandsToPersons(value) {
  return value === null ? null : Math.round(value * 1000);
}

function sourceValue(row, population) {
  const sv = population ? "PP" : "MED_DH_INC";
  const unit = population ? "千人" : "港元";
  if (row.freq !== "Y" || row.sv !== sv || row.svDesc !== unit) {
    throw new Error("分區資料:統計變項、年度頻率或來源單位改變");
  }
  if (!Object.hasOwn(row, "DC") || !NAMES.has(row.DC) || row.DCDesc !== NAMES.get(row.DC)) {
    throw new Error("分區資料:DC 識別碼或官方區名改變");
  }
  if (population && (!SEXES.includes(row.SEX) || !AGES.includes(row.AGE))) {
    throw new Error("分區人口:性別或年齡維度缺少或代碼改變");
  }
  const flags = String(row.sd_value ?? "").split(",").map((flag) => flag.trim());
  if (!flags.every((flag) => ["", "r", "p", "a", "-", "N.A.", "n.y.a."].includes(flag) || /^\[\*\d+\]$/.test(flag))) {
    throw new Error("分區資料:未知資料狀態標記");
  }
  if (row.figure !== "" && row.figure !== null && row.figure !== undefined && !Number.isFinite(Number(row.figure))) {
    throw new Error("分區資料:來源數值格式改變");
  }
  const value = toValue(row);
  const scale = population ? 10 : 0.01; // 原表分別四捨五入至 0.1 千人及 100 港元。
  if (value !== null && (value < 0 || !Number.isSafeInteger(Math.round(value * scale)) || Math.abs(value * scale - Math.round(value * scale)) > 1e-7)) {
    throw new Error("分區資料:來源必須係非負數，並符合公布精度");
  }
  return value;
}

// 只用於可相加嘅人口分項。中位數永遠唔可以送入呢個檢查。
function checkPopulationParts(whole, parts, maxTenths) {
  if ([whole, ...parts].some((value) => value === null)) return;
  const residual = Math.abs(Math.round(whole * 10) - parts.reduce((sum, value) => sum + Math.round(value * 10), 0));
  if (residual > maxTenths) throw new Error("分區人口:分項之和超出原表百人捨入差");
}

function verifyDistrict(rows, series, population) {
  const years = new Map();
  for (const row of rows) {
    if (!/^\d{4}$/.test(row.period) || row.period < "2018") throw new Error("分區資料:只接受 2018 起可比年度");
    if (!years.has(row.period)) years.set(row.period, new Map());
    const cells = years.get(row.period);
    const value = sourceValue(row, population);
    const key = population ? [row.DC, row.SEX, row.AGE].join("|") : row.DC;
    if (cells.has(key)) throw new Error("分區資料:原表年度分類重複");
    cells.set(key, value);
  }
  const expected = new Map();
  const nonemptyYears = [];
  const orderedYears = [...years.keys()].sort();
  if (orderedYears.some((year, index) => index > 0 && Number(year) !== Number(orderedYears[index - 1]) + 1)) {
    throw new Error("分區資料:原表中間年度消失");
  }
  for (const [period, cells] of years) {
    if (cells.size !== (population ? 285 : 19)) throw new Error("分區資料:每年必須齊 18 區及全港所需分類");
    const totals = [];
    for (const { code, label_zh } of DISTRICT_WITH_HK) {
      const key = population ? `${code}||` : code;
      const value = cells.get(key);
      if (value === undefined) throw new Error("分區資料:原表 Total 缺少");
      totals.push(value);
      // 同 converter 分開寫，×1001 嘅程式突變仍要被最終切片守衛捉到。
      expected.set(`${period}|${label_zh}`, value === null ? null : population ? Math.round(value * 1e3) : value);
      if (population) {
        checkPopulationParts(value, [cells.get(`${code}|M|`), cells.get(`${code}|F|`)], 1);
        checkPopulationParts(value, AGES.slice(1).map((age) => cells.get(`${code}||${age}`)), 2);
      }
    }
    if (population) checkPopulationParts(totals[0], totals.slice(1), 9);
    if (totals.some((value) => value !== null)) nonemptyYears.push(period);
  }
  // 同共用 loader 一樣只剪全空嘅頭尾年；中間年份與個別區缺值必須保留。
  nonemptyYears.sort();
  const keptYears = [...years.keys()].filter((year) => year >= nonemptyYears[0] && year <= nonemptyYears.at(-1));
  if (series.length === 0 || series.length !== keptYears.length * 19) throw new Error("分區資料:最終數列缺年、缺區或重複");
  const seen = new Set();
  for (const point of series) {
    const key = `${point.period}|${point.category}`;
    if (!keptYears.includes(point.period) || !expected.has(key) || seen.has(key)) throw new Error("分區資料:最終年度或分類錯誤");
    seen.add(key);
    if (point.value !== expected.get(key)) throw new Error("分區資料:最終數列唔等於原表指定 DC 及 Total 換算");
  }
}

export function verifyDistrictPopulation(rows, series) { verifyDistrict(rows, series, true); }
export function verifyDistrictHouseholdIncome(rows, series) { verifyDistrict(rows, series, false); }
