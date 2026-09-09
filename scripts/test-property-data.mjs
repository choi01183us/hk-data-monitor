// 私人住宅指數：基期、官方 All Classes、月序及臨時數字，自證後再跑真正 loader 突變。
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PROPERTY_HEADERS, PROPERTY_INDICATORS, parsePropertyMonth, propertyIndexValue, propertyRemark, propertyUpdatedAt,
  verifyPropertyBase, parsePropertyCsv, verifyPropertyResult, propertyAnchors, loadPropertyIndicator } from "../src/data/_lib/property.js";
import { UpstreamError } from "../src/data/_lib/http.js";

const errorOf = (fn) => { try { fn(); return null; } catch (error) { return error; } };
const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
function rowsForTest() {
  return Array.from({ length: 96 }, (_, index) => Object.fromEntries(PROPERTY_HEADERS.map((header) => [header,
    header === "Month" ? `${String(index % 12 + 1).padStart(2, "0")}-${1993 + Math.floor(index / 12)}`
      : header.endsWith("Remarks") ? "" : header === "All Classes" ? "100" : "80"])));
}
function csv(rows = rowsForTest(), kind = "PRICE", headers = PROPERTY_HEADERS) {
  return [`PRIVATE  DOMESTIC  -  ${kind}  INDICES  BY  CLASS  ( TERRITORY-WIDE ) [MONTHLY]` + ",".repeat(16),
    headers.map(quote).join(","), ...rows.map((row) => headers.map((header) => quote(row[header])).join(","))].join("\r\n") + "\r\n";
}
const finalSeries = (rows) => rows.map((row) => ({ period: parsePropertyMonth(row.Month), value: propertyIndexValue(row["All Classes"]) }));

export async function testPropertyData(check) {
  console.log("\n[私人住宅] 官方整體指數、基期及月序 — 已知答案與突變");
  for (const [raw, expected] of [["01-1993", "1993-01"], ["12-1999", "1999-12"], ["02-2000", "2000-02"], ["07-2026", "2026-07"]]) {
    check(`物業月份 ${raw} → ${expected}`, parsePropertyMonth(raw) === expected);
  }
  for (const raw of ["00-2026", "13-2026", "2026-07", "7-2026", "2026", "07-26"])
    check(`物業無效月份 ${raw} 拒絕`, errorOf(() => parsePropertyMonth(raw)) instanceof UpstreamError);
  for (const [raw, expected] of [["100", 100], ["321.5", 321.5], ["0.1", 0.1], ["", null]])
    check(`物業原值 ${JSON.stringify(raw)} → ${expected}`, propertyIndexValue(raw) === expected);
  for (const raw of ["0", "-1", "1e2", "100港元", "NaN", "Infinity", "100.12", "-", "N.A.", undefined, null])
    check(`物業未知數值 ${String(raw)} 拒絕`, errorOf(() => propertyIndexValue(raw)) instanceof UpstreamError);
  for (const [raw, expected] of [["", ""], ["P", "臨時數字，日後可能修訂"], ["Z", "由少於 20 宗交易推算"], ["P Z", "臨時數字，日後可能修訂；由少於 20 宗交易推算"]])
    check(`物業註記 ${raw || "空白"} 原義保留`, propertyRemark(raw) === expected);
  for (const raw of ["R", "@", "PX", "PP", undefined])
    check(`物業未知註記 ${String(raw)} 拒絕`, errorOf(() => propertyRemark(raw)) instanceof UpstreamError);
  for (const [raw, expected] of [["Thu, 27 Aug 2026 02:00:04 GMT", "2026-08-27"], ["Sat, 01 Jan 2000 00:00:00 GMT", "2000-01-01"], ["Tue, 29 Feb 2000 23:59:59 GMT", "2000-02-29"]])
    check(`物業 Last-Modified ${expected}`, propertyUpdatedAt(raw) === expected);
  for (const raw of [null, "", "today", "2026", "Mon, 32 Jan 2026 00:00:00 GMT", "Tue, 31 Feb 2026 00:00:00 GMT"])
    check(`物業無有效更新日期 ${String(raw)} 唔估`, errorOf(() => propertyUpdatedAt(raw)) instanceof UpstreamError);

  const rows = rowsForTest();
  check("已知 1993–2000 八年有 96 個月，解析完整保留", parsePropertyCsv(csv(), "PRICE").rows.length === 96);
  check("租金 title 可以解析", parsePropertyCsv(csv(rows, "RENTAL"), "RENTAL").rows.length === 96);
  check("BOM 可接受", parsePropertyCsv(`\uFEFF${csv()}`, "PRICE").rows.length === 96);
  check("CSV 欄位改次序按名字讀，唔按數字位置", parsePropertyCsv(csv(rows, "PRICE", [...PROPERTY_HEADERS].reverse()), "PRICE").rows[0]["All Classes"] === "100");
  for (const [sumChange, accepted] of [[0, true], [6, true], [-6, true], [7, false], [-7, false]]) {
    const changed = structuredClone(rows);
    changed.find((row) => row.Month === "01-1999")["All Classes"] = String(100 + sumChange / 10);
    check(`1999 基期整數十分位總差 ${sumChange} ${accepted ? "容許捨入" : "拒絕"}`, Boolean(errorOf(() => verifyPropertyBase(changed))) === !accepted);
  }
  for (const [name, mutate] of [
    ["中間月份遺失", (r) => r.splice(20, 1)],
    ["月份重複", (r) => r.splice(20, 0, { ...r[20] })],
    ["月序顛倒", (r) => { [r[20], r[21]] = [r[21], r[20]]; }],
    ["歷史起點遺失", (r) => r.shift()],
    ["基期值遺失", (r) => { r.find((row) => row.Month === "01-1999")["All Classes"] = ""; }],
    ["指數錯倍率", (r) => r.forEach((row) => { row["All Classes"] = String(Number(row["All Classes"]) * 10); })],
    ["未知臨時狀態", (r) => { r.at(-1)["All Classes - Remarks"] = "R"; }],
    ["非數字最新值", (r) => { r.at(-1)["All Classes"] = "error"; }],
  ]) {
    const changed = structuredClone(rows); mutate(changed);
    check(`來源突變：${name} 會嘈`, errorOf(() => parsePropertyCsv(csv(changed), "PRICE")) instanceof UpstreamError);
  }
  for (const [name, raw] of [
    ["售價／租金互換", csv(rows, "RENTAL")],
    ["平均售價金額冒充指數", csv().replace("PRICE  INDICES", "AVERAGE  PRICES")],
    ["季度冒充月度", csv().replace("[MONTHLY]", "[QUARTERLY]")],
    ["地區冒充全港", csv().replace("TERRITORY-WIDE", "HONG KONG ISLAND")],
    ["欄名加港元單位", csv().replace('"All Classes"', '"All Classes (HK$)"')],
    ["重複 All Classes 標題", csv().replace('"Class A"', '"All Classes"')],
    ["未知格式", "<html>upstream error</html>"],
  ]) check(`來源突變：${name} 會嘈`, errorOf(() => parsePropertyCsv(raw, "PRICE")) instanceof UpstreamError);

  const good = finalSeries(rows);
  check("官方 All Classes 正確最終數列可通過", !errorOf(() => verifyPropertyResult(rows, good, {})));
  for (const [name, mutate] of [
    ["誤讀 Class A", (s) => { s[0].value = 80; }],
    ["錯倍率", (s) => { s[0].value *= 1000; }],
    ["數字變文字", (s) => { s[0].value = "100"; }],
    ["漏最終月份", (s) => s.pop()],
    ["加入假分類", (s) => { s[0].category = "全港"; }],
    ["最終月份互換", (s) => { [s[0].period, s[1].period] = [s[1].period, s[0].period]; }],
  ]) {
    const changed = structuredClone(good); mutate(changed);
    const error = errorOf(() => verifyPropertyResult(rows, changed, {}));
    check(`最終數列突變：${name} hard fail`, error instanceof Error && !(error instanceof UpstreamError));
  }
  const missing = structuredClone(rows); missing.at(-1)["All Classes"] = "";
  check("來源空白留 null，唔填零", parsePropertyCsv(csv(missing), "PRICE").rows.at(-1)["All Classes"] === "" && !errorOf(() => verifyPropertyResult(missing, finalSeries(missing), {})));
  check("把缺值填零會嘈", Boolean(errorOf(() => verifyPropertyResult(missing, finalSeries(missing).map((point) => ({ ...point, value: point.value ?? 0 })), {}))));
  const flagged = structuredClone(rows); flagged.at(-1)["All Classes - Remarks"] = "P";
  const notes = { "2000-12": "臨時數字，日後可能修訂" };
  check("臨時註記跟隨正確月份", !errorOf(() => verifyPropertyResult(flagged, good, notes)));
  check("遺失臨時註記會嘈", Boolean(errorOf(() => verifyPropertyResult(flagged, good, {}))));
  check("註記套錯月份會嘈", Boolean(errorOf(() => verifyPropertyResult(flagged, good, { "2000-11": notes["2000-12"] }))));
  for (const [value, expected] of [[125, "25%"], [75, "25%"], [100, "0%"], [200, "100%"]]) {
    const anchors = propertyAnchors([{ period: "2025-07", value: 100 }, { period: "2026-07", value }]);
    check(`去年同月指數 100 → ${value} 錨點 ${expected}`, anchors.length === 1 && anchors[0].text_zh.includes(expected));
  }
  check("缺去年同月唔借另一月份", propertyAnchors([{ period: "2025-06", value: 100 }, { period: "2026-07", value: 125 }]).length === 0);
  check("最新月份缺值唔借舊值做錨點", propertyAnchors([{ period: "2025-07", value: 100 }, { period: "2026-07", value: null }]).length === 0);

  const original = new URL("../src/data/_lib/property.js", import.meta.url);
  const source = await readFile(original, "utf8");
  const temp = await mkdtemp(join(tmpdir(), "hkdm-property-data-"));
  const previousMode = process.env.HKDM_FIXTURES;
  process.env.HKDM_FIXTURES = "replay";
  try {
    for (const id of Object.keys(PROPERTY_INDICATORS)) {
      const doc = await loadPropertyIndicator(id);
      check(`${id} 無 totals，指數唔相加`, doc.totals === undefined);
      check(`${id} 原始基期及單位`, doc.unit_en === "Index (1999 = 100)" && doc.basis_zh.includes("1999 年 = 100"));
      check(`${id} 來源明確署名差估署`, doc.source_zh.includes("差餉物業估價署") && doc.source_url.startsWith("https://data.gov.hk/"));
    }
    let sequence = 0;
    for (const [name, before, after, expected] of [
      ["誤讀 A 類", "propertyIndexValue(row[spec.column])", 'propertyIndexValue(row["Class A"])', "唔等於來源 All Classes"],
      ["改大指數倍率", "propertyIndexValue(row[spec.column])", "propertyIndexValue(row[spec.column]) * 1000", "唔等於來源 All Classes"],
      ["省略最後月份", "const series = rows.map", "const series = rows.slice(0, -1).map", "遺失或增加月份"],
      ["省略臨時註記", "if (note) periodNotes[parsePropertyMonth(row.Month)] = note;", "if (false) periodNotes[parsePropertyMonth(row.Month)] = note;", "最終註記遺失"],
    ]) {
      if (source.split(before).length !== 2) throw new Error(`物業突變必須精確命中一次：${before}`);
      const altered = source.replace(before, after).replace(/(\bfrom\s+["'])(\.[^"']+)(["'])/g,
        (_, prefix, specifier, suffix) => `${prefix}${new URL(specifier, original).href}${suffix}`);
      const path = join(temp, `variant-${sequence++}.mjs`); await writeFile(path, altered);
      const variant = await import(pathToFileURL(path).href);
      for (const id of Object.keys(PROPERTY_INDICATORS)) {
        let error = null;
        try { await variant.loadPropertyIndicator(id); } catch (caught) { error = caught; }
        check(`真正 loader 突變：${id} ${name} hard fail`, error instanceof Error && !(error instanceof UpstreamError) && error.message.includes(expected));
      }
    }
  } finally {
    if (previousMode === undefined) delete process.env.HKDM_FIXTURES;
    else process.env.HKDM_FIXTURES = previousMode;
    await rm(temp, { recursive: true, force: true });
  }
}
