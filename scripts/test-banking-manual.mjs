// 銀行數目人手守衛：已知答案、輸入突變與真正 guard/loader 源碼突變。
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyBankingManual } from "../src/data/_lib/banking-manual.js";
import { loadManualIndicator } from "../src/data/_lib/manual.js";
import { UpstreamError } from "../src/data/_lib/http.js";
const failure = (fn) => { try { fn(); return null; } catch (error) { return error; } };
const rejects = (fn) => { const error = failure(fn); return error instanceof Error && !(error instanceof UpstreamError); };
function example() {
  return {
    indicator_id: "banking_institutions", acquisition: "manual", frequency: "monthly",
    source_value_multiplier: 1, unit_zh: "間", unit_en: "institutions", unit_source_zh: "間", value_digits: 0,
    source_url: "https://www.hkma.gov.hk/media/eng/doc/market-data-and-statistics/monthly-statistical-bulletin/T0301.xls", source_zh: "香港金融管理局",
    updated_at: "2026-08-31", category_order: ["持牌銀行", "有限制牌照銀行", "接受存款公司"],
    series: [5, 12, 24].map((value, index) => ({ period: "2026-08", category: ["持牌銀行", "有限制牌照銀行", "接受存款公司"][index], value })),
    totals: [{ period: "2026-08", value: 41 }],
    source_components: { "2026-08": { lb_incorp_hk: 2, lb_incorp_outside_hk: 3, rlb_incorp_hk: 5, rlb_incorp_outside_hk: 7, dtc_incorp_hk: 11, dtc_incorp_outside_hk: 13, all_ais: 41, lros: 17 } },
  };
}
const altered = (change) => { const fields = example(); change(fields, fields.source_components["2026-08"]); return fields; };
function moveMonth(fields, period, end) {
  fields.source_components = { [period]: fields.source_components["2026-08"] };
  fields.series.forEach((point) => { point.period = period; }); fields.totals[0].period = period; fields.updated_at = end;
}
export async function testBankingManual(check) {
  console.log("\n[銀行人手數目] 精確牌照欄位、原始總數及真正月末 — 自證與突變");
  const good = [example()];
  good.push(altered((f, s) => { for (const k of Object.keys(s)) s[k] = 0; f.series.forEach((p) => { p.value = 0; }); f.totals[0].value = 0; }));
  good.push(altered((f, s) => { s.lb_incorp_hk = null; f.series[0].value = null; }));
  good.push(altered((f, s) => { for (const k of Object.keys(s)) s[k] = null; f.series.forEach((p) => { p.value = null; }); f.totals[0].value = null; }));
  for (const [index, fields] of good.entries()) check(`已知答案 ${["2+3、5+7、11+13 = 41", "三類均為零", "本地欄缺值保留null", "未填骨架全部null"][index]}`, !failure(() => verifyBankingManual(fields)));
  for (const [period, end] of [["2024-02", "2024-02-29"], ["2026-02", "2026-02-28"], ["2026-04", "2026-04-30"], ["2026-12", "2026-12-31"]]) {
    const fields = example(); moveMonth(fields, period, end); good.push(fields);
    check(`月末已知答案 ${end}`, !failure(() => verifyBankingManual(fields)));
  }
  const two = example(); const later = structuredClone(two.source_components["2026-08"]);
  two.source_components["2026-09"] = later; two.series.push(...two.series.map((p) => ({ ...p, period: "2026-09" }))); two.totals.push({ period: "2026-09", value: 41 }); two.updated_at = "2026-09-30"; good.push(two);
  check("兩個已抄月份各自對來源與總數", !failure(() => verifyBankingManual(two)));
  const before = JSON.stringify(example()), input = example(); verifyBankingManual(input);
  check("守衛唔修改傳入底稿", JSON.stringify(input) === before);
  const bad = [
    ["指標錯名", (f) => { f.indicator_id = "bank_branches"; }],
    ["自動來源冒充人手", (f) => { f.acquisition = "api"; }],
    ["季度冒充月末", (f) => { f.frequency = "quarterly"; }],
    ["倍率改千", (f) => { f.source_value_multiplier = 1000; }],
    ["倍率字串1", (f) => { f.source_value_multiplier = "1"; }],
    ["港元冒充間", (f) => { f.unit_zh = "港元"; }],
    ["英文單位變分行", (f) => { f.unit_en = "branches"; }],
    ["來源單位改千間", (f) => { f.unit_source_zh = "千間"; }],
    ["顯示小數", (f) => { f.value_digits = 1; }],
    ["換咗来源表", (f) => { f.source_url = f.source_url.replace("T0301", "T0302"); }],
    ["原始機構消失", (f) => { f.source_zh = "政府統計處"; }],
    ["category_order對調", (f) => { f.category_order.reverse(); }],
    ["資料行次序對調", (f) => { f.series.reverse(); }],
    ["三類數值對調總和不變", (f) => { [f.series[0].value, f.series[1].value] = [f.series[1].value, f.series[0].value]; }],
    ["漏一類", (f) => { f.series.pop(); }],
    ["重複一類", (f) => { f.series.push({ ...f.series[0] }); }],
    ["加代表辦事處分類", (f, s) => { f.series.push({ period: "2026-08", category: "本港代表辦事處", value: s.lros }); }],
    ["分類漏境外註冊", (f, s) => { f.series[0].value = s.lb_incorp_hk; }],
    ["分類混入代表辦事處", (f, s) => { f.series[0].value += s.lros; }],
    ["總數混入代表辦事處", (f, s) => { f.totals[0].value += s.lros; }],
    ["同改底稿與總數多一間", (f, s) => { s.all_ais += 1; f.totals[0].value += 1; }],
    ["同改底稿與總數少一間", (f, s) => { s.all_ais -= 1; f.totals[0].value -= 1; }],
    ["整類填齊但無官方總數", (f, s) => { s.all_ais = null; f.totals[0].value = null; }],
    ["缺欄冒充0", (f, s) => { s.lb_incorp_hk = null; f.series[0].value = s.lb_incorp_outside_hk; }],
    ["整類缺值填0", (f, s) => { s.lb_incorp_hk = null; s.lb_incorp_outside_hk = null; f.series[0].value = 0; }],
    ["未抄而借舊數", (f, s) => { s.lb_incorp_hk = null; }],
    ["有來源值卻刪數", (f) => { f.series[0].value = null; }],
    ["底稿缺一欄", (f, s) => { delete s.lb_incorp_hk; }],
    ["底稿新增未處理欄", (f, s) => { s.branches = 99; }],
    ["缺總數陣列", (f) => { delete f.totals; }],
    ["總數重複月份", (f) => { f.totals.push({ ...f.totals[0] }); }],
    ["總數錯月份", (f) => { f.totals[0].period = "2026-07"; }],
    ["底稿多出月份", (f, s) => { f.source_components["2026-07"] = { ...s }; }],
    ["底稿缺月份", (f) => { delete f.source_components["2026-08"]; }],
    ["月末日期寫抄數日", (f) => { f.updated_at = "2026-09-09"; }],
    ["閏年2月寫28", (f) => moveMonth(f, "2024-02", "2024-02-28")],
    ["非閏年寫29", (f) => moveMonth(f, "2026-02", "2026-02-29")],
    ["年度00冒充月份", (f) => moveMonth(f, "2026-00", "2026-00-31")],
    ["13月", (f) => moveMonth(f, "2026-13", "2026-13-31")],
    ["季度period", (f) => moveMonth(f, "2026-Q3", "2026-Q3-30")],
    ["完整日期冒充月份", (f) => moveMonth(f, "2026-08-31", "2026-08-31")],
    ["空數列", (f) => { f.series = []; }],
    ["source_components陣列", (f) => { f.source_components = []; }],
    ["series點非物件", (f) => { f.series[0] = null; }],
    ["total非物件", (f) => { f.totals[0] = null; }],
    ["六欄加法溢出安全整數", (f, s) => { s.lb_incorp_hk = Number.MAX_SAFE_INTEGER; f.series[0].value = Number.MAX_SAFE_INTEGER; }],
  ].map(([name, mutate]) => [name, altered(mutate)]);
  const backwards = structuredClone(two); backwards.series.reverse(); bad.push(["月份倒序", backwards]);
  for (const value of [-1, 0.5, "1", undefined, NaN, Infinity, true, [], {}, Number.MAX_SAFE_INTEGER + 1]) {
    bad.push([`series非數目 ${String(value)}`, altered((f) => { f.series[0].value = value; })]);
    bad.push([`來源非數目 ${String(value)}`, altered((f, s) => { s.lb_incorp_hk = value; })]);
    bad.push([`原表代表處非數目 ${String(value)}`, altered((f, s) => { s.lros = value; })]);
    bad.push([`total非數目 ${String(value)}`, altered((f) => { f.totals[0].value = value; })]);
  }
  for (const [name, fields] of bad) check(`銀行資料突變：${name} hard fail`, rejects(() => verifyBankingManual(fields)));
  check("缺整份fields hard fail", rejects(() => verifyBankingManual(null)));

  const temp = await mkdtemp(join(tmpdir(), "hkdm-banking-manual-"));
  try {
    const original = new URL("../src/data/_lib/banking-manual.js", import.meta.url), source = await readFile(original, "utf8");
    const variants = [
      ["數目放寬為有限小數", "Number.isSafeInteger(value)", "Number.isFinite(value)"],
      ["負數驗證失效", "value >= 0", "value >= -1"],
      ["來源牌照欄換錯", '["lb_incorp_hk", "lb_incorp_outside_hk"]', '["rlb_incorp_hk", "rlb_incorp_outside_hk"]'],
      ["缺欄補0", "source[local] === null || source[overseas] === null ? null : source[local] + source[overseas]", "(source[local] ?? 0) + (source[overseas] ?? 0)"],
      ["分類只驗格式唔對來源", "parts[index].value !== expected", "false"],
      ["總數原欄比較關閉", "totals.get(period) !== source.all_ais", "false"],
      ["銀行容許一間誤差", "sum !== source.all_ais", "Math.abs(sum - source.all_ais) > 1"],
      ["月末比較關閉", "fields.updated_at !== monthEnd(months.at(-1))", "false"],
      ["類別順序比較關閉", "values.every((value, index) => value === expected[index])", "true"],
    ];
    for (const [index, [name, before, after]] of variants.entries()) {
      if (source.split(before).length !== 2) throw new Error(`銀行守衛突變必須精確命中一次：${before}`);
      const path = join(temp, `guard-${index}.mjs`); await writeFile(path, source.replace(before, after));
      const { verifyBankingManual: variant } = await import(pathToFileURL(path));
      const caught = good.some((f) => failure(() => variant(f))) || bad.some(([, f]) => !rejects(() => variant(f)));
      check(`真正guard突變自證：${name}被案例捉到`, caught);
    }
    const actual = JSON.parse(await readFile(new URL("../manual/banking_institutions.json", import.meta.url), "utf8"));
    check("真實人手底稿通過逐欄守衛", !failure(() => verifyBankingManual(actual)));
    const doc = await loadManualIndicator("banking_institutions");
    check("真正loader保留原值及原官方總數", JSON.stringify(doc.series) === JSON.stringify(actual.series) && JSON.stringify(doc.totals) === JSON.stringify(actual.totals));
    check("真正loader唔把抄數底稿公開成schema欄", !Object.hasOwn(doc, "source_components"));
    check("真正loader保留人手來源、單位及月末", doc.acquisition === "manual" && doc.frequency === "monthly" && doc.unit_zh === "間" && doc.updated_at === actual.updated_at);
    const manualOriginal = new URL("../src/data/_lib/manual.js", import.meta.url), manualSource = await readFile(manualOriginal, "utf8");
    const hook = "verifyBankingManual(fields);";
    if (manualSource.split(hook).length !== 2) throw new Error("銀行loader守衛hook突變必須精確命中一次");
    const bypass = manualSource.replace(hook, "/* mutation: bypass banking guard */").replace(/(\bfrom\s+["'])(\.[^"']+)(["'])/g, (_, prefix, specifier, suffix) => `${prefix}${new URL(specifier, manualOriginal).href}${suffix}`);
    const bypassPath = join(temp, "manual-bypass.mjs"); await writeFile(bypassPath, bypass);
    const changed = structuredClone(actual); [changed.series[0].value, changed.series[1].value] = [changed.series[1].value, changed.series[0].value];
    await writeFile(join(temp, "banking_institutions.json"), JSON.stringify(changed));
    let realError; try { await loadManualIndicator("banking_institutions", { manualDir: temp }); } catch (error) { realError = error; }
    check("真正loader分類對調即hard fail，唔靠總和", realError instanceof Error && !(realError instanceof UpstreamError));
    const bypassLoader = await import(pathToFileURL(bypassPath));
    let bypassError; try { await bypassLoader.loadManualIndicator("banking_institutions", { manualDir: temp }); } catch (error) { bypassError = error; }
    check("真正loader刪守衛hook突變被對調案例捉到", !bypassError);
  } finally { await rm(temp, { recursive: true, force: true }); }
}
