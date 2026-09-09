import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import * as view from "../src/components/district-view.js";

export async function testDistrictView(check) {
  console.log("\n[地區畫面] 同年、入息口徑及面積編碼自證");
  const districts = Array.from({length: 18}, (_, i) => ({id: String(i).padStart(2, "0"), label: `測試區${i}`}));
  const doc = (indicator_id, unit_zh, national) => ({indicator_id, unit_zh, series: [
    ...districts.map((d, i) => ({period: "2025", category: d.label, value: 1000 + i})),
    {period: "2025", category: "全港", value: national}
  ]});
  const pop = doc("district_population", "人", 19000), income = doc("district_household_income", "港元", 30000);
  const frame = (module, p = pop, i = income, d = districts, y = "2025") => module.districtFrame(p, i, d, y);
  const throws = (fn) => {try {fn(); return false;} catch {return true;}};
  const clone = (o, edit) => {const x = structuredClone(o); edit(x); return x;};
  const nationalCorrect = (module) => frame(module).national.income === 30000;
  const districtCorrect = (module) => frame(module).rows.every((r, i) => r.id === districts[i].id && r.population === 1000 + i && r.income === 1000 + i);
  const sourceCorrect = (module) => throws(() => frame(module, {...pop, indicator_id: "population"}));
  const unitsCorrect = (module) => throws(() => frame(module, {...pop, unit_zh: "千人"}));
  const commonOnly = (module) => module.districtPeriods({series: [{period: "2024"}, {period: "2025"}]}, {series: [{period: "2025"}, {period: "2026"}]}).join() === "2025";
  const nullPreserved = (module) => frame(module, clone(pop, (p) => p.series[0].value = null)).rows[0].population === null;
  const missingFails = (module) => throws(() => frame(module, clone(pop, (p) => p.series.shift())));
  const duplicateFails = (module) => throws(() => frame(module, clone(pop, (p) => p.series.push({...p.series[0]}))));
  check("共同年度只取交集，唔借用另一年", commonOnly(view));
  check("共同年度按最新先排並去重", view.districtPeriods({series: [{period: "2024"}, {period: "2025"}, {period: "2024"}]}, {series: [{period: "2024"}, {period: "2025"}]}).join() === "2025,2024");
  check("全港中位數讀官方全港一列，唔係十八區平均", nationalCorrect(view));
  check("十八區按標籤逐項匹配，原始數據倒序亦唔影響", districtCorrect(view) && frame(view, {...pop, series: [...pop.series].reverse()}).rows.every((r, i) => r.population === 1000 + i));
  check("錯人口指標硬失敗", sourceCorrect(view));
  check("未換成人嘅單位硬失敗", unitsCorrect(view));
  check("收入指標或單位錯誤硬失敗", throws(() => frame(view, pop, {...income, indicator_id: "household_income"})) && throws(() => frame(view, pop, {...income, unit_zh: "千元"})));
  check("共同年度以外硬失敗", throws(() => frame(view, pop, income, districts, "2024")));
  check("缺一區硬失敗", missingFails(view));
  check("同區同年重複硬失敗", duplicateFails(view));
  check("十八區以外或重複id／標籤硬失敗", throws(() => frame(view, pop, income, districts.slice(1))) && throws(() => frame(view, pop, income, clone(districts, (d) => d[1].id = d[0].id))) && throws(() => frame(view, pop, income, clone(districts, (d) => d[1].label = d[0].label))));
  check("null 保持缺數，唔補零", nullPreserved(view));
  check("負数、NaN、Infinity 硬失敗", [-1, NaN, Infinity].every((v) => throws(() => frame(view, clone(pop, (p) => p.series[0].value = v)))));
  const before = JSON.stringify([pop, income, districts]); frame(view);
  check("地區比較冇改來源物件", before === JSON.stringify([pop, income, districts]));
  const ranks = [{id: "B", income: 20}, {id: "D", income: null}, {id: "C", income: 30}, {id: "A", income: 20}];
  const rankingCorrect = (module) => module.rankDistricts(ranks, "income").map((r) => r.id).join() === "C,A,B,D";
  const preservesRanks = (module) => {const rows = structuredClone(ranks), before = JSON.stringify(rows); module.rankDistricts(rows, "income"); return JSON.stringify(rows) === before;};
  check("排名已知答案：降序、同值按id、缺數最後", rankingCorrect(view));
  check("排名唔排序來源陣列", preservesRanks(view));
  check("未知量度硬失敗", throws(() => view.rankDistricts(ranks, "wealth")));
  const radiusCorrect = (module) => [[0,0],[100000,10],[400000,20],[900000,30]].every(([v,r]) => module.populationRadius(v) === r);
  for (const [v, r] of [[0,0],[100000,10],[400000,20],[900000,30]]) check(`圓面積已知答案：${v} 人半徑 ${r}`, view.populationRadius(v) === r);
  const bandsCorrect = (module) => [[0,0],[19999,0],[20000,1],[29999,1],[30000,2],[39999,2],[40000,3]].every(([v,b]) => module.incomeBand(v) === b);
  check("收入固定分級已知答案：2萬、3萬、4萬界線", bandsCorrect(view));
  check("圖例缺值仍係 null；唔画最小值或當零", view.populationRadius(null) === null && view.incomeBand(null) === null);
  check("圖例唔接受負數／無限／NaN", [-1, Infinity, NaN].every((v) => throws(() => view.populationRadius(v)) && throws(() => view.incomeBand(v))));

  const source = await readFile(new URL("../src/components/district-view.js", import.meta.url), "utf8");
  const dir = await mkdtemp(join(tmpdir(), "hkdm-district-view-")); let seq = 0;
  async function mutate(from, to) {
    if (source.split(from).length !== 2) throw new Error(`源碼突變必須精確命中一次：${from}`);
    const file = join(dir, `mutation-${seq++}.mjs`); await writeFile(file, source.replace(from, to)); return import(pathToFileURL(file).href);
  }
  const detects = (oracle, module) => {try {return !oracle(module);} catch {return true;}};
  try {
    for (const [label, from, to, oracle] of [
      ["共同年份改聯集", '.filter((year) => other.has(year))', '', commonOnly],
      ["用各區平均冒充全港中位數", 'income: read(income, "全港")', 'income: districts.reduce((sum,d) => sum + read(income,d.label),0) / 18', nationalCorrect],
      ["人口誤讀全港", 'population: read(population, district.label)', 'population: read(population, "全港")', districtCorrect],
      ["接受錯人口來源", 'population.indicator_id !== "district_population"', 'false', sourceCorrect],
      ["接受未換算單位", 'population.unit_zh !== "人"', 'false', unitsCorrect],
      ["重複列靜靜取第一筆", 'rows.length !== 1', 'rows.length < 1', duplicateFails],
      ["缺值補零", 'return value;', 'return value ?? 0;', nullPreserved],
      ["排名方向掉轉", '(b[measure] ?? -Infinity) - (a[measure] ?? -Infinity)', '(a[measure] ?? -Infinity) - (b[measure] ?? -Infinity)', rankingCorrect],
      ["直接排序原陣列", 'return [...rows].sort', 'return rows.sort', preservesRanks],
      ["半徑同人數成正比", 'Math.sqrt(value / 100_000)', '(value / 100_000)', radiusCorrect],
      ["分級界線3萬錯位", 'value < 30_000', 'value <= 30_000', bandsCorrect]
    ]) check(`源碼突變：${label}會被捉到`, detects(oracle, await mutate(from, to)));
  } finally {await rm(dir, {recursive:true, force:true});}
}
