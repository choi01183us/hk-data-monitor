// 統計處 510-60001A：只取綜合指數九大類嘅官方按年率，唔自行平均或重算。
import { legalClassCodes, toValue } from "./censtatd.js";

export { CPI_COMPONENT_CATEGORIES, cpiBasketCost, cpiComponentAnchors } from "../../components/cpi-components-view.js";
import { CPI_COMPONENT_CATEGORIES, cpiComponentAnchors } from "../../components/cpi-components-view.js";

const NAMES = new Map([["", "Total"], ...CPI_COMPONENT_CATEGORIES.map(({ code, label_zh }) => [code, label_zh])]);
const TITLE = "消費物價指數（2019年10月至2020年9月 = 100）中各商品／服務類別指數";

function verifyMeta(meta) {
  if (meta?.labels?.tb_title !== TITLE || meta.labels.sv_list?.CC_CM_1920?.def_stat_desc !== "綜合消費物價指數") {
    throw new Error("CPI 分類:來源基期、表題或綜合指數定義改變");
  }
  const unit = meta.labels.sv_list.CC_CM_1920.sp_list?.["YoY_1dp_%_s"];
  if (unit?.def_stat_pres_desc !== "按年變動百分率" || unit.def_decimals !== "1" || unit.def_unit_mult !== "0") {
    throw new Error("CPI 分類:來源呈現方式、精度或倍率改變");
  }
  const names = legalClassCodes(meta, "GROUP");
  if (names.size !== 9 || CPI_COMPONENT_CATEGORIES.some(({ code, label_zh }) => names.get(code) !== label_zh)) {
    throw new Error("CPI 分類:來源九類識別碼或名稱改變");
  }
}

function readSource(row) {
  if (row.freq !== "M" || row.sv !== "CC_CM_1920" || row.svDesc !== "按年變動百分率") {
    throw new Error("CPI 分類:變項、月度頻率或按年百分率單位改變");
  }
  if (!Object.hasOwn(row, "GROUP") || !NAMES.has(row.GROUP) || row.GROUPDesc !== NAMES.get(row.GROUP)) {
    throw new Error("CPI 分類:GROUP 識別碼或來源分類名改變");
  }
  const flags = String(row.sd_value ?? "").split(",").map((flag) => flag.trim());
  if (!flags.every((flag) => ["", "r", "p", "a", "-", "N.A.", "n.y.a.", "[φ3]"].includes(flag) || /^\[\*\d+\]$/.test(flag))) {
    throw new Error("CPI 分類:未知資料狀態標記");
  }
  const missing = row.figure === "" || row.figure === null || row.figure === undefined;
  // Number(true)、Number([])、Number(" ") 都有數值，唔代表來源真係提供數字。
  const decimal = typeof row.figure === "number" || (typeof row.figure === "string" && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(row.figure));
  if (!missing && (!decimal || !Number.isFinite(Number(row.figure)))) {
    throw new Error("CPI 分類:來源數值格式改變");
  }
  if (flags.includes("[φ3]") && (missing || Number(row.figure) !== 0)) throw new Error("CPI 分類:少於 0.05% 標記嘅公布數值改變");
  const value = toValue(row);
  if (value !== null && (value < -100 || Math.abs(value * 10 - Math.round(value * 10)) > 1e-7)) {
    throw new Error("CPI 分類:按年率範圍或一位小數精度改變");
  }
  return value;
}

export function verifyCpiComponents(rows, series, meta) {
  verifyMeta(meta);
  const periods = new Map();
  for (const row of rows) {
    if (!/^\d{4}(0[1-9]|1[0-2])$/.test(row.period) || row.period < "201910") throw new Error("CPI 分類:只接受 2019 年 10 月起嘅月份");
    const value = readSource(row);
    if (!periods.has(row.period)) periods.set(row.period, new Map());
    const cells = periods.get(row.period);
    if (cells.has(row.GROUP)) throw new Error("CPI 分類:來源月份分類重複");
    cells.set(row.GROUP, value);
  }
  const ordered = [...periods.keys()].sort();
  const monthNumber = (period) => Number(period.slice(0, 4)) * 12 + Number(period.slice(4));
  if (ordered.some((period, index) => index > 0 && monthNumber(period) !== monthNumber(ordered[index - 1]) + 1)) {
    throw new Error("CPI 分類:來源中間月份消失");
  }
  const expected = new Map(), nonempty = [];
  for (const [period, cells] of periods) {
    if (CPI_COMPONENT_CATEGORIES.some(({ code }) => !cells.has(code))) throw new Error("CPI 分類:來源每月必須齊九類，包括缺值");
    const formatted = `${period.slice(0, 4)}-${period.slice(4)}`;
    for (const { code, label_zh } of CPI_COMPONENT_CATEGORIES) expected.set(`${formatted}|${label_zh}`, cells.get(code));
    if (CPI_COMPONENT_CATEGORIES.some(({ code }) => cells.get(code) !== null)) nonempty.push(period);
  }
  nonempty.sort();
  // 共用 loader 只剪全空頭尾，個別類別同中間全空月份仍必須保留。
  const kept = ordered.filter((period) => period >= nonempty[0] && period <= nonempty.at(-1));
  const keptFormatted = new Set(kept.map((period) => `${period.slice(0, 4)}-${period.slice(4)}`));
  if (series.length === 0 || series.length !== kept.length * 9) throw new Error("CPI 分類:最終數列缺月、缺類或重複");
  const seen = new Set();
  for (const point of series) {
    const key = `${point.period}|${point.category}`;
    if (!keptFormatted.has(point.period) || !expected.has(key) || seen.has(key)) throw new Error("CPI 分類:最終月份或分類錯誤");
    seen.add(key);
    if (point.value !== expected.get(key)) throw new Error("CPI 分類:最終數列唔等於原表指定 GROUP 按年率");
  }
}

export const CPI_COMPONENTS_SPEC = {
  table: "510-60001A",
  sv: "CC_CM_1920",
  stat_pres: "YoY_1dp_%_s",
  cv: { GROUP: CPI_COMPONENT_CATEGORIES.map(({ code }) => code) },
  freq: "M",
  period_start: "201910",
  category_dim: "GROUP",
  categories: CPI_COMPONENT_CATEGORIES,
  unit_zh: "%",
  unit_en: "% year-on-year",
  unit_short_zh: "%",
  value_digits: 1,
  name_zh: "九類消費物價按年變動",
  name_en: "Composite CPI sections, year-on-year change",
  category: "住屋與生活成本",
  question_zh: "食品、住屋、交通同水電，邊類比一年前同月升得快？",
  basis_zh: "綜合消費物價指數九大商品／服務類別嘅官方按年變動百分率；基期為 2019 年 10 月至 2020 年 9 月 = 100，唔係按月率、指數點或實際金額",
  notes_zh: "食品、住屋等九類反映唔同消費項目嘅價格變動；分類按年率唔可以相加或簡單平均，亦唔等於各類對整體通脹嘅貢獻。" +
    "綜合指數按涵蓋住戶嘅整體開支模式編製，唔係任何一戶嘅生活賬單，亦唔係自行編製嘅生活成本評分。住屋分類包括租金等項目，唔係買樓售價。" +
    "此處係未剔除政府一次性紓困措施影響嘅綜合指數；電費補貼等措施會影響部分類別嘅升跌，唔等同基本通脹率。" +
    "正數代表比一年前同月貴，負數代表較平；正數收窄只係升得慢咗。按年率由統計處以較高精度指數計算，唔用公開一位小數指數自行重算。" +
    "原表 [φ3] 表示增減少於 0.05%，本站顯示為缺值，唔當精確零；其他未公布數字亦保留缺值。此頁從 2019 年 10 月開始。",
  chart: { type: "bar", y_zero: true },
  verify: verifyCpiComponents,
  anchors: cpiComponentAnchors,
};
