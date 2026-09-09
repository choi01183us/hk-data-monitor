// 九類 CPI：先驗已知答案，再驗來源、最終切片及真正 production 源碼突變。
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CPI_COMPONENT_CATEGORIES, CPI_COMPONENTS_SPEC, verifyCpiComponents, cpiBasketCost, cpiComponentAnchors } from "../src/data/_lib/cpi-components.js";
import { CENSTATD_INDICATORS, loadCenstatdIndicator } from "../src/data/_lib/indicators.js";
import { resetTableMetaCache } from "../src/data/_lib/censtatd.js";
import { finaliseIndicator, readSnapshot } from "../src/data/_lib/snapshot.js";
import { validateIndicator } from "../src/data/_lib/schema.js";

const NAMES = ["食品", "住屋", "電力、燃氣及水", "煙酒", "衣履", "耐用物品", "雜項物品", "交通", "雜項服務"];
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
function sample(period = "202401", rate = 1) {
  const rows = ["Total", ...NAMES].map((GROUPDesc, index) => ({ GROUP: index === 0 ? "" : `S${index}`, GROUPDesc, freq: "M", period, sv: "CC_CM_1920", svDesc: "按年變動百分率", figure: Math.round((rate + index / 10) * 10) / 10, sd_value: "" }));
  const series = rows.slice(1).map((row) => ({ period: `${period.slice(0, 4)}-${period.slice(4)}`, category: row.GROUPDesc, value: row.figure }));
  const meta = { labels: {
    tb_title: "消費物價指數（2019年10月至2020年9月 = 100）中各商品／服務類別指數",
    sv_list: { CC_CM_1920: { def_stat_desc: "綜合消費物價指數", sp_list: { "YoY_1dp_%_s": { def_stat_pres_desc: "按年變動百分率", def_decimals: "1", def_unit_mult: "0" } } } },
    cv_list: { GROUP: { ccg_list: { 2: { cc_list: Object.fromEntries(NAMES.map((name, i) => [`S${i + 1}`, { def_class_code_desc: name }])) } } } },
  } };
  return { rows, series, meta };
}
const verify = ({ rows, series, meta }) => verifyCpiComponents(rows, series, meta);
const fixSourceUrls = (source, original) => source.replace(/(\bfrom\s+["'])(\.[^"']+)(["'])/g, (_, prefix, specifier, suffix) => `${prefix}${new URL(specifier, original).href}${suffix}`);

export async function testCpiComponents(check) {
  console.log("\n[CPI 九類] 按年率、分類身份、缺值與源碼突變");
  for (const [rate, cost] of [[0, 100], [5, 105], [-5, 95], [100, 200]]) {
    check(`固定一籃已知答案 ${rate}% → ${cost} 元`, cpiBasketCost(rate) === cost);
    const anchors = cpiComponentAnchors([{ period: "2024-01", category: "食品", value: rate }]);
    check(`食品 ${rate}% 錨點有分類、月份及算式`, anchors.length === 1 && anchors[0].text_zh.includes("同一籃食品") && anchors[0].basis_zh.includes("2024 年 1 月") && anchors[0].basis_zh.includes(`100 × (1 + ${rate} ÷ 100)`));
  }
  check("缺值唔產生假一百元", cpiBasketCost(null) === null && cpiComponentAnchors([{ period: "2024-01", category: "食品", value: null }]).length === 0);
  check("壞百分率唔產生錨點", cpiBasketCost(Number.NaN) === null && cpiBasketCost(-101) === null);
  check("最新食品 null 唔借上月有數點", cpiComponentAnchors([{ period: "2024-01", category: "食品", value: 1 }, { period: "2024-02", category: "食品", value: null }]).length === 0);
  check("重複食品資料唔產生錨點", cpiComponentAnchors([{ period: "2024-01", category: "食品", value: 1 }, { period: "2024-01", category: "食品", value: 2 }]).length === 0);
  check("選取交通錨點只用該月該類", cpiComponentAnchors([{ period: "2024-01", category: "食品", value: 3 }, { period: "2024-02", category: "交通", value: -5 }], "2024-02", "交通")[0]?.text_zh.includes("95 元"));
  const orderMatches = (categories) => categories.length === 9 && categories.every((category, i) => category.code === `S${i + 1}` && category.label_zh === NAMES[i]);
  check("九類次序與官方識別碼釘死", orderMatches(CPI_COMPONENT_CATEGORIES));
  const reordered = [...CPI_COMPONENT_CATEGORIES]; [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  check("次序檢查自證：食品住屋對調會嘈", !orderMatches(reordered));
  for (const rate of [-5, 0, 5, 100]) check(`原值逐點相符，已知 ${rate}% 起九類`, !throws(() => verify(sample("202401", rate))));
  for (const [name, mutate] of [
    ["缺 GROUP", (s) => { delete s.rows[1].GROUP; }],
    ["未知 GROUP", (s) => { s.rows[1].GROUP = "S10"; }],
    ["來源分類名對調", (s) => { s.rows[1].GROUPDesc = "住屋"; }],
    ["來源變項改甲類", (s) => { s.rows[1].sv = "A_CM_1920"; }],
    ["來源單位改指數點", (s) => { s.rows[1].svDesc = "指數"; }],
    ["來源單位改按月率", (s) => { s.rows[1].svDesc = "按月變動百分率"; }],
    ["來源頻率改年度", (s) => { s.rows[1].freq = "Y"; }],
    ["月份格式錯誤", (s) => { s.rows[1].period = "202413"; }],
    ["早於所選起點", (s) => { s.rows[1].period = "201909"; }],
    ["缺來源一類", (s) => { s.rows.pop(); }],
    ["重複來源一類", (s) => { s.rows.push({ ...s.rows[1] }); }],
    ["未知數值格式", (s) => { s.rows[1].figure = "oops"; }],
    ["精度改兩位小數", (s) => { s.rows[1].figure = 1.23; }],
    ["低於負100%", (s) => { s.rows[1].figure = -100.1; }],
    ["未知狀態標記", (s) => { s.rows[1].sd_value = "@"; }],
    ["少於0.05標記數字不相符", (s) => { s.rows[1].sd_value = "[φ3]"; }],
    ["來源缺值被保留舊值", (s) => { s.rows[1].figure = ""; }],
    ["未公布數字當有效", (s) => { s.rows[1].sd_value = "n.y.a."; }],
    ["最終漏一類", (s) => { s.series.pop(); }],
    ["最終重複類別", (s) => { s.series[1] = { ...s.series[0] }; }],
    ["最終類別換碼", (s) => { s.series[0].category = "Total"; }],
    ["最終食品住屋數值對調", (s) => { [s.series[0].value, s.series[1].value] = [s.series[1].value, s.series[0].value]; }],
    ["百分率再除100", (s) => { s.series[0].value /= 100; }],
    ["數列借另一月份", (s) => { s.series[0].period = "2024-02"; }],
    ["來源基期改變", (s) => { s.meta.labels.tb_title = s.meta.labels.tb_title.replace("2019", "2024"); }],
    ["元資料錯指數", (s) => { s.meta.labels.sv_list.CC_CM_1920.def_stat_desc = "甲類消費物價指數"; }],
    ["元資料錯呈現", (s) => { s.meta.labels.sv_list.CC_CM_1920.sp_list["YoY_1dp_%_s"].def_stat_pres_desc = "按月變動百分率"; }],
    ["元資料改精度", (s) => { s.meta.labels.sv_list.CC_CM_1920.sp_list["YoY_1dp_%_s"].def_decimals = "2"; }],
    ["元資料改倍率", (s) => { s.meta.labels.sv_list.CC_CM_1920.sp_list["YoY_1dp_%_s"].def_unit_mult = "3"; }],
    ["元資料類別名稱改變", (s) => { s.meta.labels.cv_list.GROUP.ccg_list[2].cc_list.S1.def_class_code_desc = "住屋"; }],
  ]) {
    const s = sample(); mutate(s); check(`CPI 突變:${name}`, throws(() => verify(s)));
  }
  for (const figure of ["0", "1.5", "-3", "1234.5"]) {
    const s = sample(); s.rows[1].figure = figure; s.series[0].value = Number(figure);
    check(`十進制數字字串 '${figure}' 正確解讀`, !throws(() => verify(s)));
  }
  for (const [name, figure, coerced] of [["true", true, 1], ["false", false, 0], ["空陣列", [], 0], ["單值陣列", [5], 5], ["空白", " ", 0], ["換行", "\n", 0], ["前後空白", " 5 ", 5], ["十六進制", "0x10", 16], ["科學記號", "1e1", 10], ["前置加號", "+5", 5], ["物件", {}, null], ["非有限數", Number.POSITIVE_INFINITY, null]]) {
    const s = sample(); s.rows[1].figure = figure; s.series[0].value = coerced;
    check(`來源型別突變:${name}唔可以由 Number 隱式變數字`, throws(() => verify(s)));
  }
  for (const figure of ["", null, undefined]) {
    const s = sample(); s.rows[1].figure = figure; s.series[0].value = null;
    check(`合法缺值 ${String(figure)} 保留 null`, !throws(() => verify(s)));
  }
  for (const flag of ["", "r", "p", "a"]) {
    const s = sample(); s.rows[1].sd_value = flag; check(`有效狀態 '${flag}' 保留原值`, !throws(() => verify(s)));
  }
  for (const flag of ["-", "N.A.", "n.y.a.", "[*1]", "[φ3]"]) {
    const s = sample(); s.rows[1].sd_value = flag; s.rows[1].figure = flag === "[φ3]" ? 0 : ""; s.series[0].value = null;
    check(`狀態 '${flag}' 保留 null`, !throws(() => verify(s)));
    s.series[0].value = 0; check(`狀態 '${flag}' 唔填零`, throws(() => verify(s)));
  }
  const one = sample("202401"), two = sample("202402"), three = sample("202403");
  two.rows.forEach((row) => { row.figure = ""; }); two.series.forEach((point) => { point.value = null; });
  check("中間全空月份保留九個 null", !throws(() => verifyCpiComponents([...one.rows, ...two.rows, ...three.rows], [...one.series, ...two.series, ...three.series], one.meta)));
  check("中間整月缺少會嘈", throws(() => verifyCpiComponents([...one.rows, ...three.rows], [...one.series, ...three.series], one.meta)));
  check("全空頭月可剪", !throws(() => verifyCpiComponents([...two.rows, ...three.rows], three.series, one.meta)));
  check("全空尾月可剪", !throws(() => verifyCpiComponents([...one.rows, ...two.rows], one.series, one.meta)));
  check("全空數列拒絕", throws(() => verifyCpiComponents(two.rows, [], one.meta)));
  const dec = sample("202312"); check("跨年相鄰月份有效", !throws(() => verifyCpiComponents([...dec.rows, ...one.rows], [...dec.series, ...one.series], one.meta)));

  const previous = process.env.HKDM_FIXTURES;
  const originalConfig = CENSTATD_INDICATORS.cpi_components;
  const temp = await mkdtemp(join(tmpdir(), "hkdm-cpi-components-"));
  process.env.HKDM_FIXTURES = "replay";
  try {
    resetTableMetaCache();
    const snapshot = await readSnapshot("cpi_components");
    const replayed = finaliseIndicator(await loadCenstatdIndicator("cpi_components"), snapshot);
    check("CPI 九類完整 fixture 重播對 snapshot hash", replayed.content_hash === snapshot.content_hash);
    check("CPI 九類輸出 schema 通過", validateIndicator(replayed).ok);
    check("CPI 九類獨立分類，冇錯誤總額", orderMatches(CPI_COMPONENTS_SPEC.categories) && replayed.totals === undefined && replayed.category_order.join("|") === NAMES.join("|"));
    const original = new URL("../src/data/_lib/cpi-components.js", import.meta.url);
    const source = await readFile(original, "utf8");
    let n = 0;
    for (const [name, before, after] of [
      ["真正設定將食品住屋身份對調", "categories: CPI_COMPONENT_CATEGORIES,", 'categories: CPI_COMPONENT_CATEGORIES.map((category) => ({ ...category, code: category.code === "S1" ? "S2" : category.code === "S2" ? "S1" : category.code })),'],
      ["真正設定將百分率除100", "verify: verifyCpiComponents,", "verify: verifyCpiComponents,\n  transform: (value) => value === null ? null : value / 100,"],
    ]) {
      if (source.split(before).length !== 2) throw new Error(`CPI 設定突變必須精確命中一次:${name}`);
      const path = join(temp, `config-${n++}.mjs`); await writeFile(path, fixSourceUrls(source.replace(before, after), original));
      CENSTATD_INDICATORS.cpi_components = (await import(pathToFileURL(path).href)).CPI_COMPONENTS_SPEC;
      let message = ""; try { await loadCenstatdIndicator("cpi_components"); } catch (error) { message = error.message; }
      check(`${name}由原表切片守衛攔住`, message.includes("最終數列唔等於原表指定 GROUP"));
      CENSTATD_INDICATORS.cpi_components = originalConfig;
    }
    for (const [name, before, after, mutate] of [
      ["關掉來源變項檢查", 'row.sv !== "CC_CM_1920"', "false", (s) => { s.rows[1].sv = "A_CM_1920"; }],
      ["關掉來源名稱檢查", "row.GROUPDesc !== NAMES.get(row.GROUP)", "false", (s) => { s.rows[1].GROUPDesc = "住屋"; }],
      ["關掉基期檢查", "meta?.labels?.tb_title !== TITLE", "false", (s) => { s.meta.labels.tb_title = "其他基期"; }],
      ["關掉來源數字型別檢查", "!decimal || !Number.isFinite(Number(row.figure))", "!Number.isFinite(Number(row.figure))", (s) => { s.rows[1].figure = true; s.series[0].value = 1; }],
    ]) {
      if (source.split(before).length !== 2) throw new Error(`CPI 守衛突變必須精確命中一次:${name}`);
      const path = join(temp, `guard-${n++}.mjs`); await writeFile(path, fixSourceUrls(source.replace(before, after), original));
      const variant = await import(pathToFileURL(path).href); const s = sample(); mutate(s);
      check(`守衛自證:${name}後壞資料會漏過`, !throws(() => variant.verifyCpiComponents(s.rows, s.series, s.meta)) && throws(() => verify(s)));
    }
  } finally {
    CENSTATD_INDICATORS.cpi_components = originalConfig;
    if (previous === undefined) delete process.env.HKDM_FIXTURES; else process.env.HKDM_FIXTURES = previous;
    resetTableMetaCache();
    await rm(temp, { recursive: true, force: true });
  }
}
