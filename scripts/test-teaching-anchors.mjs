// 教學換算用已知答案自證;突變只改臨時副本,唔會寫原始數列、快照或錄影。
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CENSTATD_INDICATORS, FISCAL_INDICATORS } from "../src/data/_lib/indicators.js";
import { anchorPerCapita } from "../src/components/anchor.js";

export async function testTeachingAnchors(check) {
  console.log("\n[教學錨點] 分母、百分比及財政年度 — 已知答案與源碼突變");
  const youthSeries = [
    { period: "2025", category: "15–24 歲青年", value: 11.2 },
    { period: "2025", category: "全港整體", value: 3.7 },
  ];
  const youthIsCorrect = (spec) => {
    const anchor = spec.anchors(youthSeries).find((a) => a.id === "youth-per-hundred");
    return anchor?.text_zh.includes("2025 年每 100 名 15–24 歲青年勞動人口") &&
      anchor.text_zh.includes("約有 11.2 名失業人士") &&
      anchor.basis_zh.includes("就業人士加失業人士");
  };
  check("11.2% = 每 100 名同年青年勞動人口約 11.2 名失業人士", youthIsCorrect(CENSTATD_INDICATORS.unemployment));
  const zeroYouth = CENSTATD_INDICATORS.unemployment.anchors(youthSeries.map((p) => ({ ...p, value: 0 })));
  check("青年失業率 0% 仍出 0 人,唔會漏走", zeroYouth.find((a) => a.id === "youth-per-hundred")?.text_zh.includes("約有 0 名"));
  check("整體失業率 0% 唔做除零倍數", !zeroYouth.some((a) => a.id === "youth-vs-all"));
  const mixedYears = CENSTATD_INDICATORS.unemployment.anchors(youthSeries.map((p, i) => i === 0 ? { ...p, period: "2024" } : p));
  check("青年同整體期數唔同 -> 唔相除做倍數", !mixedYears.some((a) => a.id === "youth-vs-all"));

  const cpiAnchors = (rate, spec = CENSTATD_INDICATORS.cpi) => spec.anchors([{ period: "2026-07", value: rate }]);
  const priceIsCorrect = (spec, rate, amount) => {
    const anchor = cpiAnchors(rate, spec).find((a) => a.id === "hundred-dollars");
    return anchor?.text_zh.includes(`今年要 ${amount} 蚊`) &&
      anchor.basis_zh === `2026 年 7 月按年變動 ${rate}%:100 × (1 + ${rate} ÷ 100)`;
  };
  // 三個獨立已知答案:100 × 1.017 = 101.7、100 × 1 = 100、100 × 0.98 = 98。
  check("按年升 1.7%:100 蚊變 101.7,算式冇重除 100", priceIsCorrect(CENSTATD_INDICATORS.cpi, 1.7, "101.7"));
  check("按年 0%:100 蚊仍然係 100", priceIsCorrect(CENSTATD_INDICATORS.cpi, 0, "100"));
  check("按年跌 2%:100 蚊變 98", priceIsCorrect(CENSTATD_INDICATORS.cpi, -2, "98"));
  const zeroIsNeutral = (spec) => {
    const text = cpiAnchors(0, spec).find((a) => a.id === "direction")?.text_zh ?? "";
    return text.includes("按年變動為零") && !text.includes("通縮") && !text.includes("通脹");
  };
  check("0% 唔會被講成通縮或通脹", zeroIsNeutral(CENSTATD_INDICATORS.cpi));
  check("正數係按年通脹", cpiAnchors(1.7).find((a) => a.id === "direction").text_zh.includes("按年通脹"));
  check("負數係按年通縮", cpiAnchors(-2).find((a) => a.id === "direction").text_zh.includes("按年通縮"));
  const twelveRates = Array.from({ length: 12 }, (_, i) => ({ period: `2025-${String(i + 1).padStart(2, "0")}`, value: i < 6 ? 0 : 100 }));
  const keepsOfficialRates = (spec) => spec.anchors(twelveRates).map((a) => a.id).join() === "hundred-dollars,direction";
  check("十二個按年率唔會產生幾何平均錨", keepsOfficialRates(CENSTATD_INDICATORS.cpi));
  check("CPI 冇有效數字就唔估錨點", cpiAnchors(null).length === 0);

  // 人造人口只用於測分母選擇。答案刻意相差兩倍,防止揀錯年仍因四捨五入而過關。
  const population = [
    { period: "1999-06", value: 500 },
    { period: "1999-12", value: 1000 },
    { period: "2000-06", value: 2000 },
    { period: "2000-12", value: 4000 },
    { period: "2001-06", value: 8000 },
  ];
  const perHeadIs = (anchor, amount, date) => anchor?.text_zh.includes(`HK$${amount}`) && anchor.basis_zh.includes(`${date}人口`);
  check("2000-01 財年:1,000,000 ÷ 2000 年中 2,000 = 500", perHeadIs(anchorPerCapita(1000000, "2000-01", population, { fiscal: true }), "500", "2000 年 6 月"));
  check("2000-01 月度:1,000,000 ÷ 1999 年底 1,000 = 1,000", perHeadIs(anchorPerCapita(1000000, "2000-01", population, { fiscal: false }), "1,000", "1999 年 12 月"));
  check("2000 曆年同樣用當年年中人口", perHeadIs(anchorPerCapita(1000000, "2000", population, { fiscal: false }), "500", "2000 年 6 月"));
  check("1999-00 跨世紀財年唔會當成月份 00", perHeadIs(anchorPerCapita(1000000, "1999-00", population, { fiscal: true }), "2,000", "1999 年 6 月"));
  check("月度 2000-12 用已到期嘅年底人口", perHeadIs(anchorPerCapita(1000000, "2000-12", population, { fiscal: false }), "250", "2000 年 12 月"));
  const noMidYear = population.filter((p) => p.period !== "2000-06");
  check("財年缺當年年中人口 -> 唔借上年分母", anchorPerCapita(1000000, "2000-01", noMidYear, { fiscal: true }) === null);
  check("曆年缺當年年中人口 -> 唔借年底或上年分母", anchorPerCapita(1000000, "2000", noMidYear, { fiscal: false }) === null);
  check("人口值係零 -> 唔出除零結果", anchorPerCapita(1000000, "2000", [{ period: "2000-06", value: 0 }]) === null);
  check("人口值非有限數字 -> 唔估分母", anchorPerCapita(1000000, "2000", [{ period: "2000-06", value: NaN }]) === null);
  check("月度唔會用未到期人口", anchorPerCapita(1000000, "2000-01", [{ period: "2000-06", value: 2000 }], { fiscal: false }) === null);
  check("人口期數唔係年中／年底 -> 唔當成有效分母", anchorPerCapita(1000000, "2000-12", [{ period: "2000-13", value: 2000 }], { fiscal: false }) === null);
  check("財年尾數唔連續 -> 唔猜", anchorPerCapita(1000000, "2000-02", population, { fiscal: true }) === null);
  check("月度唔接受第 27 個月", anchorPerCapita(1000000, "2026-27", population, { fiscal: false }) === null);

  const fiscalExtra = { totals: [{ period: "2000-01", value: 1000000 }], population };
  const expenditurePerHeadIsCorrect = (spec) => perHeadIs(spec.anchors([], fiscalExtra).find((a) => a.id === "per-capita"), "500", "2000 年 6 月");
  const reservesPerHeadIsCorrect = (spec) => perHeadIs(spec.anchors([{ period: "2000-01", value: 1000000 }], { population }).find((a) => a.id === "per-capita"), "1,000", "1999 年 12 月");
  check("政府開支 caller 明確傳財年", expenditurePerHeadIsCorrect(FISCAL_INDICATORS.govt_expenditure));
  check("政府收入 caller 明確傳財年", expenditurePerHeadIsCorrect(FISCAL_INDICATORS.govt_revenue));
  check("財政儲備 caller 明確傳月度", reservesPerHeadIsCorrect(FISCAL_INDICATORS.fiscal_reserves));
  check("GDP 已經係人均,每日換算唔會再除人口", CENSTATD_INDICATORS.gdp.anchors([{ period: "2025", value: 365000 }]).find((a) => a.id === "per-day")?.text_zh.includes("HK$1,000"));

  // 真實源碼突變:重新 import 臨時副本,用同一組已知答案判斷。每個替換都要命中一次,
  // 唔准「其實冇改到」但仍然回報突變通過(架構文件記錄過呢種假綠燈)。
  const temp = await mkdtemp(join(tmpdir(), "hkdm-teaching-anchors-"));
  let sequence = 0;
  async function variant(relativePath, before, after) {
    const original = new URL(relativePath, import.meta.url);
    const source = await readFile(original, "utf8");
    if (source.split(before).length !== 2) throw new Error(`教學錨突變必須精確命中一次:${before}`);
    const changed = source.replace(before, after).replace(/(\bfrom\s+["'])(\.[^"']+)(["'])/g,
      (_, prefix, specifier, suffix) => `${prefix}${new URL(specifier, original).href}${suffix}`);
    const path = join(temp, `variant-${sequence++}.mjs`);
    await writeFile(path, changed);
    return import(pathToFileURL(path).href);
  }
  try {
    const wrongYouth = await variant("../src/data/_lib/indicators.js", "每 100 名 15–24 歲青年勞動人口", "每 100 名所有青年");
    check("突變:勞動人口改成所有青年 -> 斷言捉到", !youthIsCorrect(wrongYouth.CENSTATD_INDICATORS.unemployment));
    const wrongClassSize = await variant("../src/data/_lib/indicators.js", "formatNumber(latestYouth.value, { digits: 1 })", "formatNumber(latestYouth.value * 0.3, { digits: 1 })");
    check("突變:每 100 人卻沿用 30 人嘅換算 -> 斷言捉到", !youthIsCorrect(wrongClassSize.CENSTATD_INDICATORS.unemployment));
    const wrongPercent = await variant("../src/data/_lib/indicators.js", "按年變動 ${latest.value}%:100 × (1 + ${latest.value} ÷ 100)", "按年變動 ${latest.value}%:100 × (1 + ${latest.value}% ÷ 100)");
    check("突變:百分號再除 100 -> 斷言捉到", !priceIsCorrect(wrongPercent.CENSTATD_INDICATORS.cpi, 1.7, "101.7"));
    const wrongZero = await variant("../src/data/_lib/indicators.js", ": latest.value < 0\n", ": latest.value <= 0\n");
    check("突變:零被歸入通縮 -> 斷言捉到", !zeroIsNeutral(wrongZero.CENSTATD_INDICATORS.cpi));
    const cpiReturn = 'return collectAnchors(\n        latest\n          ? {\n              id: "hundred-dollars",';
    const compoundedRates = await variant("../src/data/_lib/indicators.js", cpiReturn, cpiReturn.replace("return collectAnchors(",
      'return collectAnchors(\n        { id: "avg-12m", value: (withValues.slice(-12).reduce((a, p) => a * (1 + p.value / 100), 1) ** (1 / 12) - 1) * 100 },'));
    check("突變:重新加入十二個按年率幾何平均 -> 斷言捉到", !keepsOfficialRates(compoundedRates.CENSTATD_INDICATORS.cpi));
    const wrongFiscal = await variant("../src/data/_lib/indicators.js", 'noun: "每名香港市民一年", nounEn: "per Hong Kong resident per year", fiscal: true', 'noun: "每名香港市民一年", nounEn: "per Hong Kong resident per year", fiscal: false');
    check("突變:政府開支錯傳月度 -> 斷言捉到", !expenditurePerHeadIsCorrect(wrongFiscal.FISCAL_INDICATORS.govt_expenditure));
    const wrongMonthly = await variant("../src/data/_lib/indicators.js", 'noun: "每名香港市民", fiscal: false', 'noun: "每名香港市民", fiscal: true');
    check("突變:財政儲備錯傳財年 -> 斷言捉到", !reservesPerHeadIsCorrect(wrongMonthly.FISCAL_INDICATORS.fiscal_reserves));
    const wrongYear = await variant("../src/components/anchor.js", "(exactMidYear ? point.period === target : point.period <= target)", "point.period <= target");
    check("突變:缺當年人口時偷偷借上年 -> 斷言捉到", wrongYear.anchorPerCapita(1000000, "2000-01", noMidYear, { fiscal: true }) !== null);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
