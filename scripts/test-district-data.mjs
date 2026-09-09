// 分區資料：先用已知答案驗工具，再故意整壞切片；重播只讀錄影，唔上網。
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DISTRICT_CATEGORIES, DISTRICT_WITH_HK } from "../src/components/district-categories.js";
import { districtThousandsToPersons, verifyDistrictPopulation, verifyDistrictHouseholdIncome } from "../src/data/_lib/district-invariants.js";
import { CENSTATD_INDICATORS, loadCenstatdIndicator } from "../src/data/_lib/indicators.js";
import { fetchTableMeta, resetTableMetaCache } from "../src/data/_lib/censtatd.js";
import { validateIndicator } from "../src/data/_lib/schema.js";
import { finaliseIndicator, readSnapshot } from "../src/data/_lib/snapshot.js";

const ORDER = [["A", "中西區"], ["B", "灣仔區"], ["C", "東區"], ["D", "南區"], ["E", "油尖旺區"], ["F", "深水埗區"], ["G", "九龍城區"], ["H", "黃大仙區"], ["J", "觀塘區"], ["S", "葵青區"], ["K", "荃灣區"], ["L", "屯門區"], ["M", "元朗區"], ["N", "北區"], ["P", "大埔區"], ["R", "沙田區"], ["Q", "西貢區"], ["T", "離島區"]];
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const orderMatches = (categories) => JSON.stringify(categories.map(({ code, label_zh }) => [code, label_zh])) === JSON.stringify(ORDER);

function sample(population, period = "2024", factor = 1) {
  const rows = [], series = [];
  for (const [index, { code: DC, label_zh }] of DISTRICT_WITH_HK.entries()) {
    const value = factor * (population ? (index === 0 ? 1710 : index * 10) : (index === 0 ? 1000 : index * 100));
    const common = { DC, DCDesc: DC === "" ? "Total" : label_zh, freq: "Y", period, sv: population ? "PP" : "MED_DH_INC", svDesc: population ? "千人" : "港元", sd_value: "" };
    if (population) {
      for (const [SEX, sexShare] of [["", 1], ["M", 0.4], ["F", 0.6]]) {
        for (const [AGE, ageShare] of [["", 1], ["0-14", 0.1], ["15-24", 0.1], ["25-64", 0.5], ["65_and_over", 0.3]]) {
          rows.push({ ...common, SEX, AGE, figure: Math.round(value * sexShare * ageShare * 10) / 10 });
        }
      }
    } else rows.push({ ...common, figure: value });
    series.push({ period, category: label_zh, value: population ? value * 1000 : value });
  }
  return { rows, series };
}

function fixSourceUrls(source, original) {
  return source.replace(/(\bfrom\s+["'])(\.[^"']+)(["'])/g, (_, prefix, specifier, suffix) => `${prefix}${new URL(specifier, original).href}${suffix}`);
}

export async function testDistrictData(check) {
  console.log("\n[18 區] 人口與住戶中位數 — 原表切片、全港參考與突變");
  for (const [source, persons] of [[0, 0], [0.1, 100], [12.3, 12300], [7400.5, 7400500]]) {
    check(`${source} 千人換成 ${persons} 人`, districtThousandsToPersons(source) === persons);
  }
  check("人口缺值唔填零", districtThousandsToPersons(null) === null);
  check("官方 18 區識別碼及次序釘死", orderMatches(DISTRICT_CATEGORIES));
  check("全港第 19 類係參考，首位空碼", DISTRICT_WITH_HK.length === 19 && DISTRICT_WITH_HK[0].code === "" && DISTRICT_WITH_HK[0].label_zh === "全港");
  const wrongOrder = [...DISTRICT_CATEGORIES]; [wrongOrder[9], wrongOrder[10]] = [wrongOrder[10], wrongOrder[9]];
  check("次序檢查自證：葵青／荃灣對調會嘈", !orderMatches(wrongOrder));
  check("識別碼檢查自證：重複碼會嘈", !orderMatches(DISTRICT_CATEGORIES.map((district, i) => i === 1 ? DISTRICT_CATEGORIES[0] : district)));
  for (const population of [true, false]) {
    const verify = population ? verifyDistrictPopulation : verifyDistrictHouseholdIncome;
    const name = population ? "分區人口" : "住戶中位數";
    for (const factor of [0, 1, 2, 1000]) {
      const { rows, series } = sample(population, "2024", factor);
      check(`${name} 已知答案倍率 ${factor}，19 類原值逐點相符`, !throws(() => verify(rows, series)));
    }
    for (const [label, mutate] of [
      ["缺地區", (rows) => { rows.splice(0, 1); }],
      ["重複地區", (rows) => rows.push({ ...rows[0] })],
      ["Total 識別碼消失", (rows) => { delete rows[0].DC; }],
      ["來源區名對調", (rows) => { rows[0].DCDesc = "中西區"; }],
      ["來源碼轉未知", (rows) => { rows[0].DC = "Z"; }],
      ["錯單位", (rows) => { rows[0].svDesc = population ? "人" : "千港元"; }],
      ["錯變項", (rows) => { rows[0].sv = population ? "ADHS" : "MED_DH_INC_XEI"; }],
      ["錯頻率", (rows) => { rows[0].freq = "Q"; }],
      ["年份變財政年度", (rows) => { rows[0].period = "2024-25"; }],
      ["不可比早年", (rows) => { rows[0].period = "2015"; }],
      ["負數", (rows) => { rows[0].figure = -100; }],
      ["壞數值", (rows) => { rows[0].figure = "oops"; }],
      ["來源精度改變", (rows) => { rows[0].figure += 0.01; }],
      ["未知旗標", (rows) => { rows[0].sd_value = "@"; }],
      ["缺值用零或原值頂", (rows) => { rows[0].figure = ""; }],
      ["未發布值當有效", (rows) => { rows[0].sd_value = "n.y.a."; }],
    ]) {
      const { rows, series } = sample(population); mutate(rows);
      check(`${name} 突變:${label}`, throws(() => verify(rows, series)));
    }
    for (const [label, mutate] of [
      ["最終少一區", (series) => series.pop()],
      ["最終重複區", (series) => series.push({ ...series[0] })],
      ["最終漏全港", (series) => series.shift()],
      ["最終無分類", (series) => { delete series[0].category; }],
      ["最終換區數值", (series) => { [series[1].value, series[2].value] = [series[2].value, series[1].value]; }],
      ["最終錯單位倍率", (series) => { series[0].value *= 1000; }],
    ]) {
      const { rows, series } = sample(population); mutate(series);
      check(`${name} 突變:${label}`, throws(() => verify(rows, series)));
    }
    const { rows, series } = sample(population);
    const blank = sample(population, "2023"); blank.rows.forEach((row) => { row.figure = ""; }); blank.series.forEach((point) => { point.value = null; });
    check(`${name} 全空頭年可以剪`, !throws(() => verify([...blank.rows, ...rows], series)));
    const later = sample(population, "2025");
    check(`${name} 中間整年缺少會嘈`, throws(() => verify([...blank.rows, ...later.rows], [...blank.series, ...later.series])));
    const missing = sample(population); missing.rows[0].figure = ""; missing.series[0].value = null;
    check(`${name} 個別區缺值保留 null`, !throws(() => verify(missing.rows, missing.series)));
    check(`${name} 修訂旗標保留有效值`, !throws(() => verify(rows.map((row) => ({ ...row, sd_value: "r" })), series)));
  }
  for (const key of ["SEX", "AGE"]) {
    const { rows, series } = sample(true); delete rows[0][key];
    check(`人口 ${key} Total 欄消失唔可默認空字串`, throws(() => verifyDistrictPopulation(rows, series)));
  }
  for (const [label, rowIndex, difference, allowed] of [["性別", 5, 0.1, true], ["性別", 5, 0.2, false], ["四年齡組", 1, 0.2, true], ["四年齡組", 1, 0.3, false]]) {
    const { rows, series } = sample(true); rows[rowIndex].figure += difference;
    check(`人口${label}捨入差 ${difference} 千人${allowed ? "可接受" : "會拒絕"}`, throws(() => verifyDistrictPopulation(rows, series)) !== allowed);
  }
  for (const [difference, factor, allowed] of [[0.9, 1, true], [1, 1, false], [1, 1000, false]]) {
    const { rows, series } = sample(true, "2024", factor);
    const add = (SEX, AGE, delta) => { rows.find((row) => row.DC === "" && row.SEX === SEX && row.AGE === AGE).figure += delta; };
    add("", "", difference); add("M", "", 0.4); add("F", "", difference - 0.4);
    add("", "25-64", 0.5); add("", "65_and_over", difference - 0.5);
    series[0].value += difference * 1000;
    check(`18 區人口對全港差 ${difference * 1000} 人、規模 ${factor} 倍，絕對捨入界線${allowed ? "接受" : "拒絕"}`, throws(() => verifyDistrictPopulation(rows, series)) !== allowed);
  }
  const income = sample(false);
  check("全港中位數已知 1000，唔係 18 區之和 17100", !throws(() => verifyDistrictHouseholdIncome(income.rows, income.series)) && income.series.slice(1).reduce((s, p) => s + p.value, 0) === 17100);
  for (const incorrect of [17100, 950]) {
    const changed = structuredClone(income.series); changed[0].value = incorrect;
    check(`全港中位數唔能以${incorrect === 950 ? "18 區平均" : "18 區相加"}代替`, throws(() => verifyDistrictHouseholdIncome(income.rows, changed)));
  }

  const previousMode = process.env.HKDM_FIXTURES;
  process.env.HKDM_FIXTURES = "replay";
  const temp = await mkdtemp(join(tmpdir(), "hkdm-district-data-"));
  try {
    resetTableMetaCache();
    for (const id of ["district_population", "district_household_income"]) {
      const config = CENSTATD_INDICATORS[id];
      const meta = await fetchTableMeta(config.table);
      const official = Object.entries(meta.labels.cv_list.DC.ccg_list["1"].cc_list).sort((a, b) => Number(a[1].class_code_seq) - Number(b[1].class_code_seq)).map(([code, value]) => ({ code, label_zh: value.def_class_code_desc }));
      check(`${id} metadata 原始 18 區次序與名稱吻合`, orderMatches(official));
      check(`${id} registry 全港在首，其餘照來源次序`, JSON.stringify(config.categories) === JSON.stringify(DISTRICT_WITH_HK));
      const snapshot = await readSnapshot(id);
      const replayed = finaliseIndicator(await loadCenstatdIndicator(id), snapshot);
      check(`${id} 完整 fixture 重播 hash 對快照`, replayed.content_hash === snapshot.content_hash);
      check(`${id} 真實輸出通過 schema`, validateIndicator(replayed).ok);
      check(`${id} 2018 起年度每年 19 類`, replayed.coverage.start === "2018" && replayed.coverage.points === (Number(replayed.coverage.end) - 2018 + 1) * 19);
      check(`${id} 全港獨立 category，無總額欄`, replayed.category_order[0] === "全港" && replayed.latest_by_category[0].category === "全港" && replayed.totals === undefined);
    }
    const original = new URL("../src/data/_lib/indicators.js", import.meta.url);
    const source = await readFile(original, "utf8");
    let sequence = 0;
    for (const [id, name, before, after] of [
      ["district_population", "男性冒充人口", 'pin: { SEX: "", AGE: "" },\n    category_dim: "DC"', 'pin: { SEX: "M", AGE: "" },\n    category_dim: "DC"'],
      ["district_population", "工作年齡冒充人口", 'pin: { SEX: "", AGE: "" },\n    category_dim: "DC"', 'pin: { SEX: "", AGE: "25-64" },\n    category_dim: "DC"'],
      ["district_population", "千人 ×1001", "transform: districtThousandsToPersons,", "transform: (value) => value === null ? null : Math.round(value * 1001),"],
      ["district_household_income", "中西與灣仔數值對調", 'district_household_income: {\n    table: "130-06806",', 'district_household_income: {\n    table: "130-06806",\n    transform: (value) => value === 45000 ? 43300 : value === 43300 ? 45000 : value,'],
    ]) {
      if (source.split(before).length !== 2) throw new Error(`分區 loader 突變必須精確命中一次:${before}`);
      const path = join(temp, `loader-${sequence++}.mjs`);
      await writeFile(path, fixSourceUrls(source.replace(before, after), original));
      const variant = await import(pathToFileURL(path).href);
      let message = "";
      try { await variant.loadCenstatdIndicator(id); } catch (error) { message = error.message; }
      check(`真正 loader 突變:${name}`, message.includes("最終數列唔等於原表指定 DC 及 Total 換算"));
    }
    const invariantUrl = new URL("../src/data/_lib/district-invariants.js", import.meta.url);
    const invariantSource = await readFile(invariantUrl, "utf8");
    for (const [name, before, after, badSource] of [
      ["檢查器漏驗指定變項", 'row.sv !== sv', 'false', (rows) => { rows[0].sv = "MED_DH_INC_XEI"; }],
      ["檢查器漏驗區名", 'row.DCDesc !== NAMES.get(row.DC)', 'false', (rows) => { rows[0].DCDesc = "中西區"; }],
    ]) {
      if (invariantSource.split(before).length !== 2) throw new Error(`分區守衛突變必須精確命中一次:${before}`);
      const path = join(temp, `invariant-${sequence++}.mjs`);
      await writeFile(path, fixSourceUrls(invariantSource.replace(before, after), invariantUrl));
      const variant = await import(pathToFileURL(path).href);
      const { rows, series } = sample(false); badSource(rows);
      check(`守衛自證:${name}之後壞資料真係漏過`, !throws(() => variant.verifyDistrictHouseholdIncome(rows, series)) && throws(() => verifyDistrictHouseholdIncome(rows, series)));
    }
  } finally {
    if (previousMode === undefined) delete process.env.HKDM_FIXTURES;
    else process.env.HKDM_FIXTURES = previousMode;
    resetTableMetaCache();
    await rm(temp, { recursive: true, force: true });
  }
}
