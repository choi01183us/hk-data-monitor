import assert from "node:assert/strict";
import {readFile, mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {bilingualAnchor, anchorPerDay, anchorPerCapita, anchorVersusYear} from "../src/components/anchor.js";
import {cpiComponentAnchors} from "../src/components/cpi-components-view.js";
import {moneyQuarterAnchors} from "../src/components/money-view.js";
import {deriveEnglishAnchors} from "../src/data/_lib/english-anchors.js";
import {CENSTATD_INDICATORS} from "../src/data/_lib/indicators.js";
import {computeContentHash} from "../src/data/_lib/schema.js";
import {buildEnglishAnchorMap, serialiseEnglishAnchors} from "./build-english-anchors.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function testEnglishAnchors(check) {
  const canonical = {id: "known", text_zh: "中文比較", basis_zh: "中文算式"};
  const bilingual = bilingualAnchor({...canonical, text_en: "Known comparison", basis_en: "Known calculation"});
  check("English anchors remain available in memory and absent from canonical JSON", bilingual.text_en === "Known comparison" && JSON.stringify(bilingual) === JSON.stringify(canonical));
  check("Known answer: HK$36,500 a year is HK$100 per day", anchorPerDay(36500).text_en === "Equivalent to about HK$100 per person per day");
  check("Known answer: US$36,500 at 7.8 is HK$780 per day", anchorPerDay(36500, {currency: "USD"}).text_en === "Equivalent to about HK$780 per person per day");
  const population = [{period: "2000-06", value: 1000}, {period: "2000-12", value: 2000}];
  const fiscal = anchorPerCapita(120000, "2000-01", population, {fiscal: true});
  check("Known answer: financial year 2000–01 uses June 2000 population", fiscal.text_en === "Equivalent to about HK$120 per Hong Kong resident" && fiscal.basis_en.includes("June 2000"));
  const versus = anchorVersusYear([{period: "2000-01", value: 100}, {period: "2013-14", value: 125}], "2000-01");
  check("Known answer: financial-year comparison increases by 25%, without reading January", versus.text_en.includes("25%") && versus.text_en.includes("2000–01") && !versus.text_en.includes("January"));
  for (const [rate, expected] of [[2, "102"], [0, "100"], [-2, "98"]]) {
    const a = cpiComponentAnchors([{period: "2026-07", category: "食品", value: rate}])[0];
    check(`Known CPI basket: ${rate}% gives HK$${expected}`, a.text_en.includes(`HK$${expected}`) && !/\p{Script=Han}/u.test(a.text_en + a.basis_en));
  }
  const money = {indicator_id: "money_supply", unit_zh: "港元", frequency: "quarterly", series: ["2025-Q1", "2026-Q1"].flatMap((period) => ["M1", "M2", "M3"].map((category) => ({period, category, value: period === "2025-Q1" ? 1e12 : 1.25e12})))};
  check("Known money comparison: HK$0.25 trillion and +25%", moneyQuarterAnchors(money, "2026-Q1").every((a) => a.text_en.includes("HK$0.25 trillion") && a.text_en.includes("+25%")));
  for (const [value, phrase] of [[null, "has no data"], [0, "zero"]]) {
    const changed = structuredClone(money);
    changed.series[0].value = value;
    check(`Money comparison explains ${value} base without substituting quarters`, moneyQuarterAnchors(changed, "2026-Q1")[0].basis_en.includes(phrase) && moneyQuarterAnchors(changed, "2026-Q1")[0].basis_en.includes("not substituted"));
  }

  const cpi = JSON.parse(await readFile(join(ROOT, "src/data/_snapshots/cpi.json"), "utf8"));
  const mutation = (name, fn) => {
    let failed = false;
    try { fn(); } catch { failed = true; }
    check(name, failed);
  };
  mutation("Mutation: missing authored English fails", () => bilingualAnchor({...canonical, text_en: "", basis_en: "Known calculation"}));
  mutation("Mutation: a Chinese-only custom option fails", () => anchorPerDay(36500, {label: "每人"}));
  const changedSeries = structuredClone(cpi);
  changedSeries.series.at(-1).value += 5;
  mutation("Mutation: changed series with old Chinese comparisons fails", () => deriveEnglishAnchors(changedSeries));
  const changedBasis = structuredClone(cpi);
  changedBasis.anchors[0].basis_zh += "錯";
  mutation("Mutation: changed Chinese calculation explanation fails", () => deriveEnglishAnchors(changedBasis));
  const changedMetadata = structuredClone(cpi);
  changedMetadata.unit_zh = "人";
  mutation("Mutation: unchanged anchors cannot conceal a changed content hash", () => deriveEnglishAnchors(changedMetadata));
  const enumerable = CENSTATD_INDICATORS.cpi.anchors(cpi.series).map((a) => ({...a, text_en: a.text_en, basis_en: a.basis_en}));
  mutation("Mutation: enumerable English fields cannot enter the canonical snapshot", () => deriveEnglishAnchors(cpi, {anchors: enumerable}));
  const chineseOnly = cpi.anchors.map((a) => ({...a}));
  mutation("Mutation: canonical Chinese alone is insufficient English coverage", () => deriveEnglishAnchors(cpi, {anchors: chineseOnly}));
  const untranslated = CENSTATD_INDICATORS.cpi.anchors(cpi.series).map((a) => bilingualAnchor({...a, text_en: "未翻譯", basis_en: a.basis_en}));
  mutation("Mutation: Chinese source text cannot masquerade as an English comparison", () => deriveEnglishAnchors(cpi, {anchors: untranslated}));
  const duplicated = structuredClone(cpi);
  const generated = CENSTATD_INDICATORS.cpi.anchors(cpi.series);
  duplicated.anchors = [generated[0], generated[0]];
  duplicated.content_hash = computeContentHash(duplicated);
  mutation("Mutation: duplicate IDs cannot silently overwrite an English comparison", () => deriveEnglishAnchors(duplicated, {anchors: duplicated.anchors}));
  mutation("Mutation: an unrecognised CPI category requires an authored English label", () => cpiComponentAnchors([{period: "2026-07", category: "未明分類", value: 2}], "2026-07", "未明分類"));
  const refreshed = structuredClone(cpi);
  refreshed.series.at(-1).value = 5;
  refreshed.anchors = CENSTATD_INDICATORS.cpi.anchors(refreshed.series);
  refreshed.content_hash = computeContentHash(refreshed);
  check("Refresh: English follows a changed source rate, without fixed snapshot numbers", deriveEnglishAnchors(refreshed)["hundred-dollars"].text_en.includes("HK$105"));
  const previousDocument = globalThis.document;
  try {
    globalThis.document = {documentElement: {lang: "en-GB"}};
    const inEnglish = CENSTATD_INDICATORS.cpi.anchors(cpi.series);
    check("English page language leaves canonical Chinese anchor JSON unchanged", JSON.stringify(inEnglish) === JSON.stringify(cpi.anchors));
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }

  const previousFetch = globalThis.fetch;
  const NativeDate = globalThis.Date;
  const previousMode = process.env.HKDM_FIXTURES;
  const previousDir = process.env.HKDM_FIXTURE_DIR;
  const emptyFixtures = await mkdtemp(join(tmpdir(), "hkdm-english-fixtures-"));
  let requests = 0;
  globalThis.fetch = () => { requests += 1; throw new Error("English anchor generation attempted a network request"); };
  try {
    const baseline = await buildEnglishAnchorMap();
    check("All 26 Hong Kong snapshot anchors and content hashes survive English generation", Object.keys(baseline).length === 26 && Object.hasOwn(baseline, "service_programme_provision") && !Object.keys(baseline).some((id) => id.startsWith("macau_")));
    const serialised = serialiseEnglishAnchors(baseline);
    check("Generated English map pins the original source calculation", baseline.cpi["hundred-dollars"].text_zh === cpi.anchors[0].text_zh && baseline.cpi["hundred-dollars"].basis_zh === cpi.anchors[0].basis_zh);
    for (const date of ["2020-03-31T23:59:59Z", "2026-04-01T00:00:00Z", "2032-04-01T00:00:00Z"]) {
      const instant = NativeDate.parse(date);
      const OuterDate = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return instant; } };
      globalThis.Date = OuterDate;
      const result = await buildEnglishAnchorMap();
      check(`Known reference clock: ${date} leaves snapshot replay identical and restores Date`, serialiseEnglishAnchors(result) === serialised && globalThis.Date === OuterDate);
      globalThis.Date = NativeDate;
    }
    let failed = false;
    try { await buildEnglishAnchorMap({fixtureDir: emptyFixtures}); } catch { failed = true; }
    check("Mutation: missing Treasury fixtures fail hard, without source fallback", failed);
    check("Failed fixture replay restores Date and fixture environment", globalThis.Date === NativeDate && process.env.HKDM_FIXTURES === previousMode && process.env.HKDM_FIXTURE_DIR === previousDir);
    check("English anchor generation makes no network requests", requests === 0);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.Date = NativeDate;
    await rm(emptyFixtures, {recursive: true, force: true});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let count = 0;
  await testEnglishAnchors((name, pass) => { assert.ok(pass, name); count += 1; });
  console.log(`${count} English anchor known-answer, mutation and snapshot checks passed.`);
}
