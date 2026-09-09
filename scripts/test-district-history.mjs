import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import * as history from "../src/components/district-history.js";

export async function testDistrictHistory(check) {
  console.log("\n[地區概況] 原值、分母、缺年及歷史圖自證");
  const districts = Array.from({length: 18}, (_, i) => ({id: String(i), label: `測試區${i}`}));
  const years = ["2023", "2024", "2025"];
  const doc = (indicator_id, unit_zh, scale, national) => ({indicator_id, unit_zh, frequency: "annual", category_order: ["全港", ...districts.map((d) => d.label)], series: years.flatMap((period, y) => [
    ...districts.map((d, i) => ({period, category: d.label, value: (i === 0 ? [100, 120, 150][y] : i === 1 ? [200, 180, 160][y] : 500 + i) * scale})),
    {period, category: "全港", value: national[y]}
  ])});
  const population = doc("district_population", "人", 1, [10000, 11000, 12000]);
  const income = doc("district_household_income", "港元", 10, [3000, 3500, 4000]);
  const options = {population, income, districts, selectedId: "0", compareId: "1", period: "2025", fromPeriod: "2023"};
  const throws = (fn) => {try {fn(); return false;} catch {return true;}};
  const clone = (value, edit) => {const copied = structuredClone(value); edit(copied); return copied;};
  const model = (module, changes = {}) => module.districtHistory({...options, ...changes});
  const close = (a, b) => Math.abs(a - b) < 1e-10;
  const guards = {
    source: (m) => throws(() => model(m, {population: {...population, indicator_id: "population"}})),
    units: (m) => throws(() => model(m, {income: {...income, unit_zh: "千港元"}})),
    annual: (m) => throws(() => model(m, {population: {...population, frequency: "monthly"}})),
    order: (m) => throws(() => model(m, {income: clone(income, (d) => d.category_order.reverse())})),
    duplicate: (m) => throws(() => model(m, {population: clone(population, (d) => d.series.push({...d.series[0],period:"2026"},{...d.series[0],period:"2026"}))})),
    category: (m) => throws(() => model(m, {income: clone(income, (d) => d.series.push({...d.series[0],category:"未知區"}))})),
    year: (m) => throws(() => model(m, {population: clone(population, (d) => d.series.push({...d.series[0],period:"2023-Q1"}))})),
    numericYear: (m) => throws(() => model(m, {income: clone(income, (d) => d.series.push({...d.series[0],period:2026}))})),
    finite: (m) => [undefined, Infinity, NaN, -1].every((v) => throws(() => model(m, {population: clone(population, (d) => d.series[0].value = v)}))),
    selected: (m) => throws(() => model(m, {selectedId: "missing"})),
    compared: (m) => throws(() => model(m, {compareId: "missing"})),
    period: (m) => throws(() => model(m, {period: "2026"})),
    baseline: (m) => throws(() => model(m, {period: "2024", fromPeriod: "2025"})),
    missing: (m) => throws(() => model(m, {population: clone(population, (d) => d.series.shift())})),
    districtIds: (m) => throws(() => model(m, {districts: clone(districts, (d) => d[1].id = d[0].id)}))
  };
  for (const [label, oracle] of Object.entries(guards)) check(`地區概況拒絕錯誤：${label}`, oracle(history));
  check("空序列及不足十八區硬失敗", throws(() => model(history, {income: {...income, series: []}})) && throws(() => model(history, {districts: districts.slice(1)})));
  const sample = model(history);
  check("已知原值：所選人口150、入息1500；對照人口160", sample.latest.selected.population === 150 && sample.latest.selected.income === 1500 && sample.latest.comparison.population === 160);
  const deltaCorrect = (m) => {const v = model(m); return v.changes.selected.population.delta === 50 && v.changes.comparison.population.delta === -40 && v.changes.selected.income.delta === 500;};
  check("已知差額：100→150加50；200→160減40", deltaCorrect(history));
  const percentCorrect = (m) => [[100,125,25],[100,75,-25],[50,100,100],[100,100,0]].every(([from,to,percent]) => m.districtChange(from,to).percent === percent);
  check("百分比四個已知答案：+25%、−25%、+100%、0%", percentCorrect(history));
  const shareCorrect = (m) => [[25,100,25],[0,100,0],[150,12000,1.25],[100,100,100]].every(([value,total,percent]) => m.districtShare(value,total) === percent);
  check("人口比例四個已知答案：25%、0%、1.25%、100%", shareCorrect(history));
  const denominatorCorrect = (m) => model(m).latest.selected.share === 1.25 && model(m).latest.nationalPopulation === 12000;
  check("人口比例只用同年官方全港12000作分母", denominatorCorrect(history));
  const nationalCorrect = (m) => {const v = model(m, {compareId: ""}); return v.latest.comparison.income === 4000 && v.latest.comparison.population === 12000 && v.latest.comparison.share === 100;};
  check("全港對照直接讀官方人口及中位數", nationalCorrect(history));
  const nullChanges = (m) => [[null,20],[20,null],[null,null]].every(([from,to]) => {const c = m.districtChange(from,to); return c.delta === null && c.percent === null;});
  const zeroChanges = (m) => {const c = m.districtChange(0,20); return c.delta === 20 && c.percent === null && m.districtChange(0,0).percent === null;};
  const nullShares = (m) => [[null,100],[100,null],[100,0],[0,0]].every(([value,total]) => m.districtShare(value,total) === null);
  check("缺失端點保留缺值，唔補零", nullChanges(history));
  check("零基準保留差額，但唔計百分比", zeroChanges(history));
  check("缺失／零分母唔計人口比例", nullShares(history));
  check("獨立算式拒絕負數、Infinity、undefined", [-1,Infinity,undefined].every((v) => throws(() => history.districtChange(v,20)) && throws(() => history.districtShare(20,v))));
  const reversed = {population: {...population, series: [...population.series].reverse()}, income: {...income, series: [...income.series].reverse()}};
  const chronology = (m) => model(m, reversed).rows.map((r) => r.period).join() === "2023,2024,2025";
  check("原始列倒序仍按標籤對數，歷史由早至後", chronology(history) && model(history,reversed).latest.selected.population === 150);
  const cutoff = (m) => model(m,{period:"2024"}).rows.map((r) => r.period).join() === "2023,2024";
  check("選2024唔顯示2025數據", cutoff(history));
  check("預設比較基準係上一個共同年度", model(history,{fromPeriod:undefined}).fromPeriod === "2024");
  check("最早年度容許同年基準，差額為零", model(history,{period:"2023",fromPeriod:undefined}).changes.selected.population.delta === 0);
  check("同區對照保留相同原值，唔假造差別", model(history,{compareId:"0"}).latest.comparison.population === 150);
  const missingYear = {income: {...income, series: income.series.filter((r) => r.period !== "2024")}};
  const intersection = (m) => model(m,missingYear).rows.map((r) => r.period).join() === "2023,2025";
  check("整年只得一份資料時取交集，唔借值", intersection(history));
  const nullOptions = {population: clone(population, (d) => d.series.find((r) => r.period === "2024" && r.category === "測試區0").value = null)};
  const nullPreserved = (m) => model(m,nullOptions).rows[1].selected.population === null;
  check("歷史中間缺值仍係null", nullPreserved(history));
  const before = JSON.stringify(options); model(history); check("讀概況唔改來源資料", JSON.stringify(options) === before);

  const knownRows = [
    {period:"2023",selected:{population:0,income:100},comparison:{population:200,income:200}},
    {period:"2024",selected:{population:100,income:100},comparison:{population:200,income:200}},
    {period:"2025",selected:{population:200,income:100},comparison:{population:200,income:200}}
  ];
  const chartCorrect = (m) => {const c=m.districtHistoryChart(knownRows,"population"),p=c.lines[0].segments[0]; return c.maximum===200 && p[0].x===70 && p[1].x===305 && p[2].x===540 && p[0].y===155 && p[1].y===90 && p[2].y===25;};
  check("圖形已知答案：0／100／200對應y155／90／25；三年x70／305／540", chartCorrect(history));
  const measureCorrect = (m) => m.districtHistoryChart(knownRows,"income").lines[0].segments[0].every((p) => p.value===100 && p.y===90);
  check("入息圖只取入息，唔誤畫人口", measureCorrect(history));
  const gapCorrect = (m) => m.districtHistoryChart(model(m,nullOptions).rows,"population").lines[0].segments.map((s) => s.length).join() === "1,1";
  const yearGapCorrect = (m) => m.districtHistoryChart(model(m,missingYear).rows,"population").lines[0].segments.map((s) => s.length).join() === "1,1";
  check("明確null分成兩段，唔接線或補零", gapCorrect(history));
  check("整年缺資料亦分段，唔跨年接線", yearGapCorrect(history));
  check("只有一年點放中間，唔除零", history.districtHistoryChart([knownRows[0]],"population").ticks[0].x === 305);
  const emptyValues = knownRows.map((row) => ({...row, selected:{population:null},comparison:{population:null}}));
  check("全缺值唔造0線；真實全零才有零點", history.districtHistoryChart(emptyValues,"population").lines.every((l)=>l.segments.length===0) && history.districtHistoryChart([{period:"2025",selected:{population:0},comparison:{population:0}}],"population").lines[0].segments[0][0].y===155);
  const chartOrder = (m) => throws(() => m.districtHistoryChart([...knownRows].reverse(),"population")) && throws(() => m.districtHistoryChart([knownRows[0],knownRows[0]],"population"));
  check("歷史圖拒絕倒序或重複年份", chartOrder(history));
  const chartYears = (m) => [2023,"2023-Q1"].every((year) => throws(() => m.districtHistoryChart(clone(knownRows,(r)=>r[0].period=year),"population")));
  check("歷史圖只接受年度字串，唔接受數字或季度", chartYears(history));
  check("歷史圖拒絕未知量度、空列及無效值", throws(()=>history.districtHistoryChart(knownRows,"wealth")) && throws(()=>history.districtHistoryChart([],"income")) && throws(()=>history.districtHistoryChart(clone(knownRows,(r)=>r[0].selected.population=Infinity),"population")));

  const snapshots = await Promise.all(["district_population","district_household_income"].map(async (id)=>JSON.parse(await readFile(new URL(`../src/data/_snapshots/${id}.json`,import.meta.url),"utf8"))));
  const {hongKongDistricts} = await import("../src/components/hong-kong-districts.js");
  const actual = history.districtHistory({population:snapshots[0],income:snapshots[1],districts:hongKongDistricts,selectedId:"A",compareId:"J",period:"2025",fromPeriod:"2018"});
  check("已提交快照實讀：中西區2025人口229000、入息45000", actual.latest.selected.population===229000 && actual.latest.selected.income===45000);
  check("已提交快照全港分母7400500，冇引用另一人口指標", actual.latest.nationalPopulation===7400500 && close(actual.latest.selected.share,229000/7400500*100));

  const source = (await readFile(new URL("../src/components/district-history.js", import.meta.url), "utf8")).replace('"./district-view.js"', JSON.stringify(new URL("../src/components/district-view.js", import.meta.url).href));
  const dir = await mkdtemp(join(tmpdir(), "hkdm-district-history-")); let sequence=0;
  async function mutate(from,to) {if(source.split(from).length!==2) throw new Error(`突變必須精確命中一次：${from}`);const file=join(dir,`mutation-${sequence++}.mjs`);await writeFile(file,source.replace(from,to));return import(pathToFileURL(file).href);}
  const detects=(oracle,module)=>{try{return !oracle(module);}catch{return true;}};
  try {
    for (const [label,from,to,oracle] of [
      ["年度閘失效", 'doc?.frequency !== "annual"', 'false', guards.annual],
      ["分類次序閘失效", 'JSON.stringify(doc.category_order) !== JSON.stringify(categories)', 'false', guards.order],
      ["重複列閘失效", 'if (keys.has(key))', 'if (false)', guards.duplicate],
      ["未知分類閘失效", '!categories.includes(row.category)', 'false', guards.category],
      ["年度格式閘失效", 'typeof row.period !== "string" || !/^\\d{4}$/.test(row.period) || !categories.includes(row.category)', 'typeof row.period !== "string" || !categories.includes(row.category)', guards.year],
      ["年份數字強行當字串", 'typeof row.period !== "string" || !/^\\d{4}$/.test(row.period) || !categories.includes(row.category)', '!/^\\d{4}$/.test(row.period) || !categories.includes(row.category)', guards.numericYear],
      ["未選年度之後資料漏出", 'periods.filter((year) => year <= period)', 'periods', cutoff],
      ["歷史倒序", 'districtPeriods(population, income).sort()', 'districtPeriods(population, income)', chronology],
      ["錯讀全港分母為所選人口", 'districtShare(row.population, frame.national.population)', 'districtShare(row.population, row.population)', denominatorCorrect],
      ["官方全港入息改所選區", 'compareId === "" ? frame.national :', 'compareId === "" ? current :', nationalCorrect],
      ["對照偷偷改成所選區", 'frame.rows.find((row) => row.id === compareId)', 'current', deltaCorrect],
      ["人口缺值補零", 'population: row.population, income:', 'population: row.population ?? 0, income:', nullPreserved],
      ["差額方向掉轉", 'const delta = to - from;', 'const delta = from - to;', deltaCorrect],
      ["百分比用期末做分母", 'delta / from * 100', 'delta / to * 100', percentCorrect],
      ["百分比漏乘100", 'delta / from * 100', 'delta / from', percentCorrect],
      ["零基準亦除數", 'percent: from > 0 ?', 'percent: from >= 0 ?', zeroChanges],
      ["缺失端點補零", 'delta: null, percent: null', 'delta: 0, percent: 0', nullChanges],
      ["人口比例倒轉分子", 'value / national * 100', 'national / value * 100', shareCorrect],
      ["分母零仍計比例", 'national > 0 ?', 'national >= 0 ?', nullShares],
      ["圖形人口誤畫入息", 'value: row[key][measure], x: x(row.period), y: y(row[key][measure])', 'value: row[key].income, x: x(row.period), y: y(row[key].income)', chartCorrect],
      ["入息誤画人口", 'row[key][measure] === null', 'row[key].population === null', (m)=>{const rows=clone(knownRows,(r)=>r[1].selected.population=null);return m.districtHistoryChart(rows,"income").lines[0].segments[0].length===3;}],
      ["y刻度非零起點", '155 - (maximum > 0 ? value / maximum * 130 : 0)', '155 - (maximum > 0 ? value / maximum * 100 : 0)', chartCorrect],
      ["缺年仍接線", 'Number(row.period) - Number(rows[i - 1].period) !== 1', 'false', yearGapCorrect],
      ["缺值跳過但接線", 'row[key][measure] === null ||', 'false ||', gapCorrect],
      ["年份倒序檢查失效", '(i > 0 && rows[i - 1].period >= row.period)', 'false', chartOrder],
      ["圖形年份格式失效", 'typeof row.period !== "string" || !/^\\d{4}$/.test(row.period) || (i > 0', '(i > 0', chartYears]
    ]) check(`地區歷史源碼突變：${label}會被捉到`,detects(oracle,await mutate(from,to)));
  } finally {await rm(dir,{recursive:true,force:true});}
}
