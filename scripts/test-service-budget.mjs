// Read the genuine recorded CSV, then check independently transcribed PDF totals.
// Mutants live in the system temporary directory; fixtures and snapshots stay read-only.
import {mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {gunzipSync} from "node:zlib";
import * as budget from "../src/data/_lib/service-budget.js";
import {UpstreamError} from "../src/data/_lib/http.js";
import {SERVICE_PROGRAMMES, SERVICE_PERIODS, serviceProgrammePoints} from "../src/components/service-programmes.js";
import {anchorVersusYear} from "../src/components/anchor.js";

const HEADERS = ["總目", "綱領編號", "綱領", "機構", "2024-25\r\n(實際)\r\n(百萬元)", "2025-26\r\n(原來預算)\r\n(百萬元)", "2025-26\r\n(修訂)\r\n(百萬元)", "2026-27\r\n(預算)\r\n(百萬元)"];
const PERIODS = ["2024-25", "2025-26", "2026-27"];
const CSV_URL = "https://www.budget.gov.hk/2026/chi/csv/fin_provision.csv";
// HK dollars, not values computed from the production transform or metadata.
// PDF sources: chead170 p18; chead156 p12; chead173 p4; chead190 p1;
// chead37 p12 and chead140 p9. Actual 2024-25 / revised 2025-26 / estimate 2026-27.
const PDF_TOTALS = [
  ["170/1 家庭及兒童福利", 5400800000, 5594900000, 5973400000],
  ["170/2 社會保障", 76258300000, 81085400000, 93149900000],
  ["170/3 安老服務", 15551400000, 16487200000, 17281400000],
  ["170/4 康復及醫務社會服務", 11851200000, 12377400000, 12882400000],
  ["170/5 違法者服務", 441300000, 438700000, 437700000],
  ["170/6 社區發展", 229700000, 225400000, 220800000],
  ["170/7 青少年服務", 2947600000, 3029100000, 2990400000],
  ["173/2 在職家庭津貼", 2320900000, 2349600000, 2720400000],
  ["156/1 局長辦公室", 14900000, 14900000, 14900000],
  ["156/2 學前教育", 5313000000, 4841500000, 4520800000],
  ["156/3 小學教育", 25001800000, 24892700000, 24445300000],
  ["156/4 中學教育", 32524900000, 32140700000, 31905400000],
  ["156/5 特殊教育", 3885900000, 3958900000, 3997600000],
  ["156/6 其他教育服務及資助", 1290200000, 1486800000, 1468800000],
  ["156/7 專上及職業專才教育", 6442600000, 5446300000, 5662500000],
  ["156/8 政策及支援", 4689300000, 2964800000, 2964300000],
  ["173/1 學生資助計劃", 4249700000, 4329300000, 4797400000],
  ["190/1 大學教育資助委員會", 24475900000, 24560800000, 24446600000],
  ["37/1 法定職責", 1558100000, 1877500000, 2019200000],
  ["37/2 預防疾病", 7362800000, 7793700000, 8290900000],
  ["37/3 促進健康", 496700000, 577100000, 584400000],
  ["37/4 醫療護理", 1315200000, 1273100000, 1310200000],
  ["37/5 康復服務", 166200000, 184200000, 193000000],
  ["37/6 治療吸毒者", 210000000, 212700000, 218600000],
  ["37/7 公務員醫療及牙科服務", 2547400000, 2630500000, 3079900000],
  ["37/8 任職醫院管理局公務員的人事管理", 11700000, 11500000, 11500000],
  ["140/1 局長辦公室", 23200000, 24300000, 25600000],
  ["140/2 衞生", 2003200000, 4137900000, 4291200000],
  ["140/3 資助金：醫院管理局", 98796400000, 100168900000, 103059100000],
  ["140/4 資助金：菲臘牙科醫院", 237700000, 238600000, 236200000],
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const edit = (value, fn) => {const copy = structuredClone(value); fn(copy); return copy;};
const failure = (fn) => {try {fn(); return null;} catch (error) {return error;}};
const upstream = (fn) => failure(fn) instanceof UpstreamError;
const hard = (fn) => {const error = failure(fn); return error instanceof Error && !(error instanceof UpstreamError);};
const expectedSeries = () => PERIODS.flatMap((period, index) => PDF_TOTALS.map(([category, ...values]) => ({period, category, value: values[index]})));
const csvCell = (value) => `"${String(value).replaceAll('"', '""')}"`;
const csv = (rows, headers = HEADERS) => [headers, ...rows.map((row) => headers.map((header) => row[header]))].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";

export async function runServiceBudgetTests(check) {
  console.log("\n[服務綱領預算] 官方錄影、PDF 數值、預算狀態及最終換算自證");
  // Four independent known answers before using the decimal conversion in assertions.
  for (const [source, tenths] of [["0.0", 0], ["0.1", 1], ["1.0", 10], ["123.4", 1234]]) {
    check(`綱領換算已知答案：${source} 百萬元 = ${tenths} 個十萬元`, budget.serviceBudgetValue(source) === tenths);
  }
  check("綱領 CSV 八個欄名、單位和原來／修訂狀態獨立釘死", same(budget.SERVICE_HEADERS, HEADERS));
  check("三個財政年度釘死：實際、修訂預算、預算", same(SERVICE_PERIODS.map((p) => [p.period, p.column, p.status_zh]), [["2024-25", HEADERS[4], "實際"], ["2025-26", HEADERS[6], "修訂預算"], ["2026-27", HEADERS[7], "預算"]]));
  check("30 個綱領依總目＋編號＋名稱獨立對位", same(SERVICE_PROGRAMMES.map((p) => p.category), PDF_TOTALS.map((p) => p[0])));
  check("30 個分類不產生跨總目總額", new Set(SERVICE_PROGRAMMES.map((p) => p.category)).size === 30 && SERVICE_PROGRAMMES.every((p) => p.category === `${p.head}/${p.programme} ${p.name_zh}`));

  const fixtureDir = new URL("../src/data/_fixtures/", import.meta.url);
  const names = (await readdir(fixtureDir)).filter((name) => name.startsWith("www.budget.gov.hk-2026-chi-csv-fin_provision.csv-") && name.endsWith(".json.gz"));
  check("綱領 CSV 有且只有一份正式錄影", names.length === 1);
  if (names.length !== 1) return;
  const fixtureUrl = new URL(names[0], fixtureDir);
  const fixtureBefore = await readFile(fixtureUrl);
  const fixture = JSON.parse(gunzipSync(fixtureBefore).toString("utf8"));
  check("正式錄影係指定 2026 中文 CSV 的成功 GET 回應", fixture.url === CSV_URL && fixture.method === "GET" && fixture.status === 200 && typeof fixture.body === "string");
  const parsed = budget.parseServiceBudgetCsv(fixture.body);
  const rows = parsed.rows;
  const series = budget.buildServiceSeries(rows);
  check("全份來源只抽六個已登記總目的 44 行", rows.length === 44 && same([...new Set(rows.map((row) => row.總目))].sort(), ["140", "156", "170", "173", "190", "37"]));
  check("30 綱領 × 3 財政年度 = 90 個點", series.length === 90);
  for (const [category, ...values] of PDF_TOTALS) {
    check(`PDF 已知答案：${category} 三年各自對原欄位`, same(series.filter((point) => point.category === category).map((point) => point.value), values));
  }
  const correct = (module) => same(module.buildServiceSeries(module.parseServiceBudgetCsv(fixture.body).rows), expectedSeries());
  check("全部 90 點依 PDF 分類及年份排序，冇原來預算混入", correct(budget));
  check("最終逐點核對接受正確數列", failure(() => budget.verifyServiceProgrammeResult(rows, series)) === null);
  check("來源行倒序仍按總目及綱領對位", same(budget.buildServiceSeries(budget.parseServiceBudgetCsv(csv([...rows].reverse())).rows), expectedSeries()));
  check("CSV 欄位倒序仍讀取指定欄名", same(budget.buildServiceSeries(budget.parseServiceBudgetCsv(csv(rows, [...HEADERS].reverse())).rows), expectedSeries()));
  check("UTF-8 BOM 及 quoted CRLF 標題可重播", same(budget.buildServiceSeries(budget.parseServiceBudgetCsv(`\uFEFF${csv(rows)}`).rows), expectedSeries()));
  check("未選總目可有不相容欄值，唔混入所選綱領", same(budget.buildServiceSeries(budget.parseServiceBudgetCsv(csv([...rows, {...rows[0], 總目: "999", 綱領編號: "999", 綱領: "其他總目", [HEADERS[7]]: "未提供"}])).rows), expectedSeries()));

  const parseRejects = (module, changedRows, headers = HEADERS) => upstream(() => module.parseServiceBudgetCsv(csv(changedRows, headers)));
  const badName = edit(rows, (r) => r[0].綱領 = "錯誤綱領名稱");
  const unknownProgramme = [...rows, {...rows[0], 綱領編號: "999"}];
  const unknownSector = [...rows, {...rows[0], 機構: "未知機構"}];
  const duplicate = [...rows, {...rows[0]}];
  const missing = rows.slice(1);
  const badOriginal = edit(rows, (r) => r[0][HEADERS[5]] = "N.A.");
  for (const [label, changedRows] of [
    ["名稱對調但編號不變", badName], ["已選總目多出不明綱領", unknownProgramme], ["已選綱領多出未知機構", unknownSector],
    ["同總目綱領機構重複", duplicate], ["遺失一個機構", missing], ["整個總目遺失", rows.filter((r) => r.總目 !== "170")],
    ["綱領編號對調但名稱不變", edit(rows, (r) => {r[0].綱領編號 = r[0].綱領編號 === "1" ? "2" : "1";})],
    ["只有機構名稱對調造成重複", edit(rows, (r) => {const row = r.find((x) => x.總目 === "170" && x.綱領編號 === "1" && x.機構 === "政府機構"); row.機構 = "受資助機構 / 私營機構";})],
    ["原來預算欄亦要驗數字", badOriginal],
  ]) check(`上游突變：${label} -> UpstreamError`, parseRejects(budget, changedRows));
  for (const [label, headers] of [
    ["百萬元變千元", HEADERS.map((h) => h.replaceAll("百萬元", "千元"))],
    ["修訂變原來預算", HEADERS.map((h) => h.replace("(修訂)", "(原來預算)"))],
    ["預算年度改變", HEADERS.map((h) => h.replace("2026-27", "2027-28"))],
    ["標題新增額外欄", [...HEADERS, "新欄"]],
    ["標題少一欄", HEADERS.slice(0, -1)],
    ["首欄總目消失", HEADERS.map((h) => h === "總目" ? "head" : h)],
  ]) check(`來源欄位突變：${label} -> UpstreamError`, parseRejects(budget, rows, headers));
  for (const value of [null, undefined, 123.4, NaN, Infinity, {}, "", "0", "1", "1.00", "-1.0", "+1.0", "1e3", "1,000.0", "N.A.", "-", " 1.0", "1.0 ", "9007199254.8"]) {
    check(`嚴格金額格式拒絕 ${String(value)}`, upstream(() => budget.serviceBudgetValue(value)));
  }
  for (const value of ["", "N.A.", "1.00", "-1.0", "9007199254.8"]) {
    check(`CSV 金額 ${JSON.stringify(value)} 唔估零／放寬精度`, parseRejects(budget, edit(rows, (r) => r[0][HEADERS[7]] = value)));
  }
  for (const text of [null, undefined, {}, "", "<html>來源暫停</html>", `${csv(rows)}1,2\r\n`]) {
    check(`無效來源容器／CSV 結構 ${typeof text} -> UpstreamError`, upstream(() => budget.parseServiceBudgetCsv(text)));
  }

  const zeroRows = edit(rows, (r) => r.forEach((row) => HEADERS.slice(4).forEach((h) => row[h] = "0.0")));
  const zeroSeries = budget.buildServiceSeries(budget.parseServiceBudgetCsv(csv(zeroRows)).rows);
  check("真正零撥款保留 90 個零值，冇變 null 或借其他期", zeroSeries.length === 90 && zeroSeries.every((point) => point.value === 0) && failure(() => budget.verifyServiceProgrammeResult(zeroRows, zeroSeries)) === null);
  const unusedChanged = edit(rows, (r) => r.forEach((row) => row[HEADERS[5]] = "999999.9"));
  check("原來預算有變仍不影響修訂預算數列", same(budget.buildServiceSeries(unusedChanged), expectedSeries()));
  const frozenRows = Object.freeze(rows.map((row) => Object.freeze({...row})));
  check("計算及最終核對不修改來源", same(budget.buildServiceSeries(frozenRows), expectedSeries()) && failure(() => budget.verifyServiceProgrammeResult(frozenRows, series)) === null);
  const overflowRows = edit(rows, (r) => r.filter((row) => row.總目 === "170" && row.綱領編號 === "1").forEach((row) => HEADERS.slice(4).forEach((h) => row[h] = "9007199254.7")));
  const overflowSeries = series.map((point) => point.category === "170/1 家庭及兒童福利" ? {...point, value: 18014398509400000} : {...point});
  check("每個機構金額安全但綱領總和超界，計算層硬失敗", hard(() => budget.buildServiceSeries(overflowRows)));
  check("最終來源總和及輸出同樣超界，亦不可因相等而通過", hard(() => budget.verifyServiceProgrammeResult(overflowRows, overflowSeries)));

  const wrongValue = edit(series, (s) => s[0].value += 1);
  const wrongPeriod = edit(series, (s) => s[0].period = "2024-01");
  const wrongCategory = edit(series, (s) => s[0].category = s[1].category);
  for (const [label, changedSeries] of [
    ["換算差一港元", wrongValue], ["財政年度變年月", wrongPeriod], ["綱領名稱被對調", wrongCategory],
    ["兩個綱領數值互換、總和不變", edit(series, (s) => {[s[0].value, s[1].value] = [s[1].value, s[0].value];})],
    ["整體乘錯單位", series.map((s) => ({...s, value: s.value * 1000}))],
    ["最新一期錯借舊期值", edit(series, (s) => s[60].value = s[0].value)],
    ["缺少一點", series.slice(1)], ["多出一點", [...series, {...series[0]}]],
    ["重複一點而另一點遺失", edit(series, (s) => s[1] = {...s[0]})],
    ["數列次序對調", [...series].reverse()], ["null 冒充零", edit(series, (s) => s[0].value = null)],
    ["數字改成字串", edit(series, (s) => s[0].value = String(s[0].value))],
    ["不是數列", null],
  ]) check(`最終核對突變：${label} -> hard fail`, hard(() => budget.verifyServiceProgrammeResult(rows, changedSeries)));
  check("90 個輸出格逐一加一，全部被最終守衛拒絕", series.every((_, i) => hard(() => budget.verifyServiceProgrammeResult(rows, edit(series, (s) => s[i].value += 1)))));
  for (const [label, changedRows] of [["來源少一機構", missing], ["来源同機構重複", duplicate], ["來源綱領名錯", badName], ["來源所選數字缺失", edit(rows, (r) => r[0][HEADERS[4]] = "")]]) {
    check(`最終來源核對：${label} -> hard fail`, hard(() => budget.verifyServiceProgrammeResult(changedRows, series)));
  }
  const exchangedColumns = edit(rows, (r) => r.forEach((row) => {[row[HEADERS[5]], row[HEADERS[6]]] = [row[HEADERS[6]], row[HEADERS[5]]];}));
  check("CSV 仍合格式但取錯原來／修訂欄：對真正來源才捉到", hard(() => budget.verifyServiceProgrammeResult(rows, budget.buildServiceSeries(exchangedColumns))));
  const exchangedProgrammes = edit(rows, (r) => {const one = r.find((x) => x.總目 === "173" && x.綱領編號 === "1"); const two = r.find((x) => x.總目 === "173" && x.綱領編號 === "2"); [one[HEADERS[7]], two[HEADERS[7]]] = [two[HEADERS[7]], one[HEADERS[7]]];});
  check("不同綱領來源數字互換：schema 可過、原來源逐點核對會拒絕", hard(() => budget.verifyServiceProgrammeResult(rows, budget.buildServiceSeries(exchangedProgrammes))));

  const displayedProgramme = SERVICE_PROGRAMMES.find((p) => p.category === "170/1 家庭及兒童福利");
  const displayedDoc = {series};
  const displayedExpected = [
    {period: "2024-25", category: "170/1 家庭及兒童福利", value: 5400800000},
    {period: "2025-26", category: "170/1 家庭及兒童福利", value: 5594900000},
    {period: "2026-27", category: "170/1 家庭及兒童福利", value: 5973400000},
  ];
  check("顯示層已知答案：同綱領三期精確取 5,400.8／5,594.9／5,973.4 百萬元", same(serviceProgrammePoints(displayedDoc, displayedProgramme), displayedExpected));
  check("顯示層來源次序打亂仍按完整財政年度查值", same(serviceProgrammePoints({series: [...series].reverse()}, displayedProgramme), displayedExpected));
  check("顯示層只取指定綱領，不借其他綱領數字", same(serviceProgrammePoints({series: [...series, {period: "2026-27", category: "未選綱領", value: 999}]}, displayedProgramme), displayedExpected));
  const viewMissing = {series: series.filter((point) => point.category !== displayedProgramme.category || point.period !== "2025-26")};
  const viewDuplicate = {series: [...series, {...displayedExpected[0]}]};
  const viewBadValue = (value) => ({series: edit(series, (points) => {points[0].value = value;})});
  check("顯示層缺少修訂預算硬失敗，不借其他期或補零", hard(() => serviceProgrammePoints(viewMissing, displayedProgramme)));
  check("顯示層同綱領同期重複硬失敗，不默取首個", hard(() => serviceProgrammePoints(viewDuplicate, displayedProgramme)));
  for (const value of [null, undefined, NaN, Infinity, -Infinity, "1", {}, true, 1.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
    check(`顯示層無效金額 ${String(value)} 硬失敗`, hard(() => serviceProgrammePoints(viewBadValue(value), displayedProgramme)));
  }
  check("顯示層真正零值保持零", same(serviceProgrammePoints({series: zeroSeries}, displayedProgramme).map((point) => point.value), [0, 0, 0]));
  check("顯示層找不到分類硬失敗", hard(() => serviceProgrammePoints(displayedDoc, {category: "不存在的綱領"})));
  check("顯示層錯財政年度不會當成月份", hard(() => serviceProgrammePoints({series: edit(series, (points) => points[0].period = "2024-01")}, displayedProgramme)));
  const changePoints = (base, latest) => [{period: "2024-25", value: 999}, {period: "2025-26", value: base}, {period: "2026-27", value: latest}];
  check("綱領百分比已知答案：零基期不計升幅", anchorVersusYear(changePoints(0, 100), "2025-26") === null);
  check("綱領百分比已知答案：兩期皆零亦不除零", anchorVersusYear(changePoints(0, 0), "2025-26") === null);
  for (const [base, latest, rate, direction] of [[100, 100, "0%", "increased"], [100, 125, "25%", "increased"], [100, 50, "50%", "decreased"]]) {
    const anchor = anchorVersusYear(changePoints(base, latest), "2025-26");
    check(`綱領百分比已知答案：${base} → ${latest} = ${rate}`, anchor !== null && anchor.text_zh.includes(rate) && anchor.text_en.includes(`${direction} by ${rate}`) && anchor.basis_zh.includes("2025–26 年度") && anchor.basis_zh.includes("2026–27 年度"));
  }

  const originalUrl = new URL("../src/data/_lib/service-budget.js", import.meta.url);
  const original = await readFile(originalUrl, "utf8");
  const dir = await mkdtemp(join(tmpdir(), "hkdm-service-budget-"));
  let sequence = 0;
  async function mutate(replacements) {
    let source = original;
    for (const [before, after] of replacements) {
      if (source.split(before).length !== 2) throw new Error(`綱領源碼突變必須精確命中一次：${before}`);
      source = source.replace(before, after);
    }
    source = source.replace(/(\bfrom\s+["'])(\.[^"']+)(["'])/g, (_, prefix, specifier, suffix) => `${prefix}${new URL(specifier, originalUrl).href}${suffix}`);
    const path = join(dir, `mutation-${sequence++}.mjs`);
    await writeFile(path, source);
    return import(pathToFileURL(path).href);
  }
  const detect = (oracle, module) => {try {return !oracle(module);} catch {return true;}};
  const priorMode = process.env.HKDM_FIXTURES;
  const priorDirectory = process.env.HKDM_FIXTURE_DIR;
  process.env.HKDM_FIXTURES = "replay";
  delete process.env.HKDM_FIXTURE_DIR;
  try {
    const indicator = await budget.loadServiceProgrammeIndicator("service_programme_provision");
    check("真正 loader 零網絡重播仍等於 PDF 90 點", same(indicator.series, expectedSeries()));
    check("loader 保留港元換算、財政年度及來源單位", indicator.unit_zh === "港元" && indicator.unit_source_zh === "百萬元" && indicator.frequency === "annual" && indicator.source_url === CSV_URL && same(indicator.category_order, PDF_TOTALS.map((p) => p[0])) && same(indicator.period_notes, {"2024-25": "實際", "2025-26": "修訂預算", "2026-27": "預算"}));
    for (const id of ["unknown", "govt_expenditure", "public_expenditure_policy_groups", "toString", "__proto__"]) {
      let error;
      try {await budget.loadServiceProgrammeIndicator(id);} catch (caught) {error = caught;}
      check(`loader 未登記 id ${id} 硬失敗`, error instanceof Error && !(error instanceof UpstreamError));
    }
    for (const [label, replacements, oracle] of [
      ["金額格式檢查被刪", [["!/^\\d+\\.\\d$/.test(text)", "false"]], (m) => upstream(() => m.serviceBudgetValue("1"))],
      ["單格安全整數上限被刪", [["!Number.isSafeInteger(tenths) || !Number.isSafeInteger(tenths * 100000)", "false"]], (m) => upstream(() => m.serviceBudgetValue("9007199254.8"))],
      ["標題狀態及單位檢查被刪", [["headers.length !== SERVICE_HEADERS.length || new Set(headers).size !== headers.length || SERVICE_HEADERS.some((h) => !headers.includes(h))", "false"]], (m) => parseRejects(m, rows, [...HEADERS, "新欄"])],
      ["綱領中文名稱 pin 被刪", [["row.綱領 !== programme.name_zh", "false"]], (m) => parseRejects(m, badName)],
      ["機構分類 pin 被刪", [["!programme.sectors.includes(row.機構)", "false"]], (m) => parseRejects(m, unknownSector)],
      ["重複機構檢查被刪", [["seen.has(sectorKey)", "false"]], (m) => parseRejects(m, duplicate)],
      ["缺少機構檢查被刪", [["!seen.has(`${p.head}/${p.programme}:${sector}`)", "false"]], (m) => parseRejects(m, missing)],
      ["未選原來預算欄不再驗數字", [["for (const column of SERVICE_HEADERS.slice(4)) serviceBudgetValue(row[column]);", "for (const {column} of SERVICE_PERIODS) serviceBudgetValue(row[column]);"]], (m) => parseRejects(m, badOriginal)],
      ["每十萬元換算多一元", [["const value = tenths * 100000;", "const value = tenths * 100001;"]], correct],
      ["修訂預算誤取原來預算", [["sum + serviceBudgetValue(row[column])", "sum + serviceBudgetValue(row[column === SERVICE_HEADERS[6] ? SERVICE_HEADERS[5] : column])"]], correct],
      ["忘記總目只按綱領編號相加", [["key(row) === `${p.head}/${p.programme}`", "row.綱領編號 === p.programme"]], correct],
      ["每個綱領只取首機構", [[".reduce((sum, row) => sum + serviceBudgetValue(row[column]), 0)", ".slice(0, 1).reduce((sum, row) => sum + serviceBudgetValue(row[column]), 0)"]], correct],
      ["綱領總和安全整數檢查被刪", [["if (!Number.isSafeInteger(value))", "if (false)"]], (m) => hard(() => m.buildServiceSeries(overflowRows))],
      ["最終輸出值核對被刪", [["point.value !== expected", "false"]], (m) => hard(() => m.verifyServiceProgrammeResult(rows, wrongValue))],
      ["最終年份核對被刪", [["point.period !== period", "false"]], (m) => hard(() => m.verifyServiceProgrammeResult(rows, wrongPeriod))],
      ["最終分類核對被刪", [["point.category !== p.category", "false"]], (m) => hard(() => m.verifyServiceProgrammeResult(rows, wrongCategory))],
      ["最終數列長度核對被刪", [["series.length !== SERVICE_PROGRAMMES.length * SERVICE_PERIODS.length", "false"]], (m) => hard(() => m.verifyServiceProgrammeResult(rows, [...series, {...series[0]}]))],
      ["最終唯一來源格檢查被刪", [["source.length !== 1", "false"]], (m) => hard(() => m.verifyServiceProgrammeResult(duplicate, series))],
      ["最終來源總和安全整數檢查被刪", [["|| !Number.isSafeInteger(expected)", "|| false"]], (m) => hard(() => m.verifyServiceProgrammeResult(overflowRows, overflowSeries))],
      ["守衛自己把百萬元換錯", [["Number(match[1]) * 1000000", "Number(match[1]) * 1000001"]], (m) => failure(() => m.verifyServiceProgrammeResult(rows, series)) === null],
    ]) check(`綱領源碼突變：${label}會被測試捉到`, detect(oracle, await mutate(replacements)));

    for (const [label, replacements] of [
      ["錯港元乘數", [["const value = tenths * 100000;", "const value = tenths * 100001;"]]],
      ["錯修訂欄", [["sum + serviceBudgetValue(row[column])", "sum + serviceBudgetValue(row[column === SERVICE_HEADERS[6] ? SERVICE_HEADERS[5] : column])"]]],
      ["錯綱領切片", [["key(row) === `${p.head}/${p.programme}`", "row.綱領編號 === p.programme"]]],
    ]) {
      const module = await mutate(replacements);
      let error;
      try {await module.loadServiceProgrammeIndicator("service_programme_provision");} catch (caught) {error = caught;}
      check(`真正 loader ${label} 必須由最終核對硬失敗`, error instanceof Error && !(error instanceof UpstreamError) && error.message.includes("綱領最終數列唔等於來源"));
    }
    const viewSource = await readFile(new URL("../src/components/service-programmes.js", import.meta.url), "utf8");
    for (const [label, before, after, oracle] of [
      ["唯一同期分類檢查被刪", "points.length !== 1", "false", (m) => hard(() => m.serviceProgrammePoints(viewDuplicate, displayedProgramme))],
      ["安全整數檢查被刪", "!Number.isSafeInteger(points[0].value)", "false", (m) => hard(() => m.serviceProgrammePoints(viewBadValue(null), displayedProgramme))],
      ["非負數檢查被刪", "points[0].value < 0", "false", (m) => hard(() => m.serviceProgrammePoints(viewBadValue(-1), displayedProgramme))],
      ["分類 pin 被刪", "row.category === programme.category && ", "", (m) => same(m.serviceProgrammePoints(displayedDoc, displayedProgramme), displayedExpected)],
      ["完整財政年度 pin 被刪", " && row.period === period", "", (m) => same(m.serviceProgrammePoints(displayedDoc, displayedProgramme), displayedExpected)],
    ]) {
      if (viewSource.split(before).length !== 2) throw new Error(`綱領顯示層源碼突變必須精確命中一次：${before}`);
      const path = join(dir, `view-mutation-${sequence++}.mjs`);
      await writeFile(path, viewSource.replace(before, after));
      const module = await import(pathToFileURL(path).href);
      check(`顯示層源碼突變：${label}會被測試捉到`, detect(oracle, module));
    }
  } finally {
    if (priorMode === undefined) delete process.env.HKDM_FIXTURES;
    else process.env.HKDM_FIXTURES = priorMode;
    if (priorDirectory === undefined) delete process.env.HKDM_FIXTURE_DIR;
    else process.env.HKDM_FIXTURE_DIR = priorDirectory;
    await rm(dir, {recursive: true, force: true});
  }
  check("綱領來源錄影測試前後 byte 不變", fixtureBefore.equals(await readFile(fixtureUrl)));
}
