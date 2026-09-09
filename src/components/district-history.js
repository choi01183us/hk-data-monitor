// 選區、歷年及變化共用一份模型；只讀共同年度，缺值唔借用另一年。
import {districtPeriods, districtFrame} from "./district-view.js";

export function districtChange(from, to) {
  for (const value of [from, to]) if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error("變化需要非負數字或明確缺值");
  if (from === null || to === null) return {from, to, delta: null, percent: null};
  const delta = to - from;
  return {from, to, delta, percent: from > 0 ? delta / from * 100 : null};
}

export function districtShare(value, national) {
  for (const number of [value, national]) if (number !== null && (!Number.isFinite(number) || number < 0)) throw new Error("人口比例需要非負數字或明確缺值");
  return value !== null && national !== null && national > 0 ? value / national * 100 : null;
}

export function districtHistory({population, income, districts, selectedId, compareId = "", period, fromPeriod}) {
  if (!Array.isArray(districts) || districts.length !== 18) throw new Error("地區概況需要完整十八區");
  const selected = districts.find((district) => district.id === selectedId);
  const comparison = compareId === "" ? {id: "", label: "全港"} : districts.find((district) => district.id === compareId);
  if (!selected || !comparison) throw new Error("選取或對照地區不存在，唔會改用全港");
  const categories = ["全港", ...districts.map((district) => district.label)];
  for (const doc of [population, income]) {
    if (doc?.frequency !== "annual" || !Array.isArray(doc.series) || !doc.series.length) throw new Error("地區歷史只接受有資料嘅年度指標");
    if (doc.category_order !== undefined && JSON.stringify(doc.category_order) !== JSON.stringify(categories)) throw new Error("地區分類次序必須同地圖及官方全港分類一致");
    const keys = new Set();
    for (const row of doc.series) {
      if (typeof row.period !== "string" || !/^\d{4}$/.test(row.period) || !categories.includes(row.category)) throw new Error("地區歷史有未知年份或分類");
      const key = `${row.period}/${row.category}`;
      if (keys.has(key)) throw new Error("同區同年唔可以有重複資料");
      keys.add(key);
      if (row.value !== null && (!Number.isFinite(row.value) || row.value < 0)) throw new Error("地區歷史有無效數值");
    }
  }
  const periods = districtPeriods(population, income).sort();
  if (!periods.includes(period)) throw new Error("所選年度必須喺人口及入息嘅共同年度內");
  const shownPeriods = periods.filter((year) => year <= period);
  const baseline = fromPeriod ?? shownPeriods.at(-2) ?? period;
  if (!shownPeriods.includes(baseline) || baseline > period) throw new Error("比較基準必須係所選年度或之前嘅共同年度");
  const rows = shownPeriods.map((year) => {
    const frame = districtFrame(population, income, districts, year);
    const current = frame.rows.find((row) => row.id === selectedId);
    const context = compareId === "" ? frame.national : frame.rows.find((row) => row.id === compareId);
    const values = (row) => ({population: row.population, income: row.income, share: districtShare(row.population, frame.national.population)});
    return {period: year, selected: values(current), comparison: values(context), nationalPopulation: frame.national.population};
  });
  const first = rows.find((row) => row.period === baseline), latest = rows.at(-1);
  const changes = (key) => ({population: districtChange(first[key].population, latest[key].population), income: districtChange(first[key].income, latest[key].income)});
  return {period, fromPeriod: baseline, periods, selected, comparison, rows, latest, changes: {selected: changes("selected"), comparison: changes("comparison")}};
}

// 兩條線共用同一項量度嘅零起點刻度；人口與入息分圖。明確缺值及缺年都斷線。
export function districtHistoryChart(rows, measure) {
  if (!["population", "income"].includes(measure) || !Array.isArray(rows) || !rows.length) throw new Error("歷史圖需要人口或入息資料");
  if (rows.some((row, i) => typeof row.period !== "string" || !/^\d{4}$/.test(row.period) || (i > 0 && rows[i - 1].period >= row.period))) throw new Error("歷史圖年份必須唯一及由早至後");
  const values = rows.flatMap((row) => [row.selected[measure], row.comparison[measure]]);
  if (values.some((value) => value !== null && (!Number.isFinite(value) || value < 0))) throw new Error("歷史圖唔接受無效數值");
  const maximum = Math.max(0, ...values.filter((value) => value !== null));
  const start = Number(rows[0].period), end = Number(rows.at(-1).period);
  const x = (year) => end === start ? 305 : 70 + (Number(year) - start) / (end - start) * 470;
  const y = (value) => 155 - (maximum > 0 ? value / maximum * 130 : 0);
  const lines = ["selected", "comparison"].map((key) => {
    const segments = []; let segment = [];
    for (const [i, row] of rows.entries()) {
      if (row[key][measure] === null || (i > 0 && Number(row.period) - Number(rows[i - 1].period) !== 1)) {
        if (segment.length) segments.push(segment);
        segment = [];
      }
      if (row[key][measure] !== null) segment.push({period: row.period, value: row[key][measure], x: x(row.period), y: y(row[key][measure])});
    }
    if (segment.length) segments.push(segment);
    return {key, segments};
  });
  return {maximum, lines, ticks: rows.map((row) => ({period: row.period, x: x(row.period)}))};
}
