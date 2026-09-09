// 「相當於……」對比錨點。
//
// 一個中學生睇到「人均 GDP 56,983 美元」係冇感覺嘅。
// 呢度負責把抽象數字換算成佢有得比較嘅嘢，而且——最重要——
// 每個錨點都要附上 basis_zh，即係「我點計出嚟」，畀學生自己驗算。
//
// 規矩：唔准老作數字。所有換算常數都要有出處（見 CONSTANTS）。

import { formatNumber, formatChineseMagnitude as displayMagnitude, formatPercentChange as displayChange, formatPeriodZh as displayPeriod, formatEnglishMagnitude, formatPeriodEn, isFiscalPeriodSeries } from "./format.js";

// Stored Chinese anchors must be identical whichever language the browser displays.
const formatChineseMagnitude = (value) => displayMagnitude(value, {locale: "zh-HK"});
const formatPercentChange = (from, to) => displayChange(from, to, {locale: "zh-HK"});
const formatPeriodZh = (period, options = {}) => displayPeriod(period, {...options, locale: "zh-HK"});

export { formatNumber, formatChineseMagnitude, formatPercentChange, formatPeriodZh };

/** Presentation fields stay readable in memory, but never alter snapshot JSON or its hash. */
export function bilingualAnchor({text_en, basis_en, ...anchor}) {
  if (typeof text_en !== "string" || !text_en.trim() || typeof basis_en !== "string" || !basis_en.trim()) throw new Error("An anchor requires authored English text and basis");
  return Object.defineProperties(anchor, {
    text_en: {value: text_en, enumerable: false},
    basis_en: {value: basis_en, enumerable: false},
  });
}

function englishOption(original, translation = original) {
  if (typeof translation !== "string" || /\p{Script=Han}/u.test(translation)) throw new Error(`An authored English option is required for: ${original}`);
  return translation;
}

/** 換算常數。每個都要有 note（點解係咁）同 source（邊度睇返）。 */
export const CONSTANTS = {
  usd_to_hkd: {
    value: 7.8,
    note: "聯繫匯率制度下，港元兌美元喺 7.75–7.85 之間浮動，7.8 係中間價。",
    note_en: "Under the Linked Exchange Rate System, the Hong Kong dollar trades between 7.75 and 7.85 per US dollar; 7.8 is the midpoint.",
    source: "香港金融管理局 — 聯繫匯率制度",
    source_url: "https://www.hkma.gov.hk/gb_chi/key-functions/money/linked-exchange-rate-system/",
  },
};

// ── 錨點產生器 ────────────────────────────────────────────────
// 每個都回傳 { id, text_zh, basis_zh } 或者 null（資料唔夠就唔好夾硬砌）。

/** 一個年度金額，攤返做「每日幾多錢」。 */
export function anchorPerDay(latestValue, { currency = "HKD", label = "每人每日", labelEn = label === "每人每日" ? "per person per day" : undefined } = {}) {
  if (!Number.isFinite(latestValue)) return null;
  const hkd = currency === "USD" ? latestValue * CONSTANTS.usd_to_hkd.value : latestValue;
  const perDay = hkd / 365;
  return bilingualAnchor({
    id: "per-day",
    text_zh: `相當於${label}約 HK$${formatNumber(perDay, { digits: 0 })}`,
    text_en: `Equivalent to about HK$${formatNumber(perDay, {digits: 0})} ${englishOption(label, labelEn)}`,
    basis_en: currency === "USD"
      ? `US$${formatNumber(latestValue, {digits: 0})} × ${CONSTANTS.usd_to_hkd.value} (${CONSTANTS.usd_to_hkd.note_en}) ÷ 365 days`
      : `${formatNumber(latestValue, {digits: 0})} ÷ 365 days`,
    basis_zh:
      currency === "USD"
        ? `US$${formatNumber(latestValue, { digits: 0 })} × ${CONSTANTS.usd_to_hkd.value}（${CONSTANTS.usd_to_hkd.note}）÷ 365 日`
        : `${formatNumber(latestValue, { digits: 0 })} ÷ 365 日`,
  });
}

/** 同某一年比。用嚟講「你出世嗰年到而家變咗幾多」。 */
export function anchorVersusYear(series, targetPeriod, { label, labelEn } = {}) {
  const then = series.find((point) => String(point.period) === String(targetPeriod) && Number.isFinite(point.value));
  const now = [...series].reverse().find((point) => Number.isFinite(point.value));
  if (!then || !now || then.period === now.period) return null;
  const delta = formatPercentChange(then.value, now.value);
  if (!delta) return null;
  // 「2005-06」係 2005 年 6 月定 2005–06 年度?要睇成條 series 先知。
  const fiscal = isFiscalPeriodSeries(series.map((point) => point.period));
  const suffix = (period) => formatPeriodZh(period, { fiscal });
  const englishLabel = englishOption(label ?? "", labelEn ?? label ?? "");
  return bilingualAnchor({
    id: `vs-${targetPeriod}`,
    text_zh: `對比 ${suffix(then.period)}${label ? `（${label}）` : ""}，${delta.text}`,
    basis_zh: `${suffix(then.period)} ${big(then.value)} → ${suffix(now.period)} ${big(now.value)}`,
    text_en: `Compared with ${formatPeriodEn(then.period, {fiscal})}${englishLabel ? ` (${englishLabel})` : ""}, ${delta.change >= 0 ? "increased" : "decreased"} by ${formatNumber(Math.abs(delta.change), {digits: 1})}%`,
    basis_en: `${formatPeriodEn(then.period, {fiscal})} ${bigEn(then.value)} → ${formatPeriodEn(now.period, {fiscal})} ${bigEn(now.value)}`,
  });
}

/** 算式入面嘅數:億級用「億」寫,否則「149,386,000,000」呢種學生數唔到有幾多個零。 */
function big(value) {
  return Math.abs(value) >= 1e8 ? formatChineseMagnitude(value) : formatNumber(value);
}
function bigEn(value) {
  return Math.abs(value) >= 1e8 ? formatEnglishMagnitude(value) : formatNumber(value);
}

/**
 * 過去 N 年平均每年變幾多。
 *
 * 呢個錨點嘅好處係:分子分母全部喺同一條 series 入面攞,
 * 唔使引入任何外部常數,學生想驗算就一定驗得返。
 */
export function anchorAverageChange(series, { years = 10, noun = "", nounEn = noun === "人" ? "people" : undefined } = {}) {
  const withValues = series.filter((point) => Number.isFinite(point.value));
  const now = withValues.at(-1);
  if (!now) return null;
  const nowYear = Number(String(now.period).slice(0, 4));
  const then = withValues.find((point) => Number(String(point.period).slice(0, 4)) >= nowYear - years);
  if (!then || then.period === now.period) return null;
  const span = Number(String(now.period).slice(0, 4)) - Number(String(then.period).slice(0, 4));
  if (span <= 0) return null;
  const perYear = (now.value - then.value) / span;
  const verb = perYear >= 0 ? "增加" : "減少";
  return bilingualAnchor({
    id: "avg-change",
    text_zh: `過去 ${span} 年,平均每年${verb} ${formatChineseMagnitude(Math.abs(perYear))}${noun}`,
    basis_zh: `(${formatNumber(now.value)} − ${formatNumber(then.value)}) ÷ ${span} 年`,
    text_en: `Over ${span} years, an average ${perYear >= 0 ? "increase" : "decrease"} of ${formatEnglishMagnitude(Math.abs(perYear))}${noun ? ` ${englishOption(noun, nounEn)}` : ""} per year`,
    basis_en: `(${formatNumber(now.value)} − ${formatNumber(then.value)}) ÷ ${span} years`,
  });
}

/** 相當於幾多個「一件生活上見得到嘅嘢」。unitAmount 必須有出處。 */
export function anchorMultipleOf(latestValue, { unitAmount, unitLabel, unitLabelEn, unitSource, unitSourceEn }) {
  if (!Number.isFinite(latestValue) || !Number.isFinite(unitAmount) || unitAmount === 0) return null;
  const times = latestValue / unitAmount;
  return bilingualAnchor({
    id: "multiple-of",
    text_zh: `相當於 ${formatChineseMagnitude(times)} ${unitLabel}`,
    basis_zh: `${formatNumber(latestValue)} ÷ ${formatNumber(unitAmount)}${unitSource ? `（${unitSource}）` : ""}`,
    text_en: `Equivalent to ${formatEnglishMagnitude(times)} ${englishOption(unitLabel, unitLabelEn)}`,
    basis_en: `${formatNumber(latestValue)} ÷ ${formatNumber(unitAmount)}${unitSource ? ` (${englishOption(unitSource, unitSourceEn)})` : ""}`,
  });
}

/** 每 N 個人有幾多／一班 30 人嘅課室入面有幾多個 —— 百分比最好用嘅譯法。 */
export function anchorPerClassroom(percentValue, { classSize = 30, subject = "人", subjectEn = subject === "人" ? "people" : undefined } = {}) {
  if (!Number.isFinite(percentValue)) return null;
  const count = (percentValue / 100) * classSize;
  return bilingualAnchor({
    id: "per-classroom",
    text_zh: `一班 ${classSize} 人嘅課室，大約有 ${formatNumber(count, { digits: 1 })} ${subject}`,
    basis_zh: `${formatNumber(percentValue, { digits: 1 })}% × ${classSize} 人`,
    text_en: `In a class of ${classSize}, approximately ${formatNumber(count, {digits: 1})} ${englishOption(subject, subjectEn)}`,
    basis_en: `${formatNumber(percentValue, {digits: 1})}% × ${classSize} people`,
  });
}

/** 一個「多少年」嘅數字，講返係幾多年幾多個月。壽命之類啱用。 */
export function anchorYearsAndMonths(years, { label = "", labelEn } = {}) {
  if (!Number.isFinite(years)) return null;
  const whole = Math.floor(years);
  const months = Math.round((years - whole) * 12);
  return bilingualAnchor({
    id: "years-months",
    text_zh: `${label}即係大約 ${whole} 年 ${months} 個月`,
    basis_zh: `${formatNumber(years, { digits: 2 })} 年 → 小數部分 × 12 個月`,
    text_en: `${label ? `${englishOption(label, labelEn)}: ` : ""}approximately ${whole} years and ${months} months`,
    basis_en: `${formatNumber(years, {digits: 2})} years → fractional part × 12 months`,
  });
}

/** 把一堆可能係 null 嘅錨點收埋做一個乾淨陣列。 */
export function collectAnchors(...anchors) {
  return anchors.filter(Boolean).map((anchor) => "text_en" in anchor || "basis_en" in anchor ? bilingualAnchor(anchor) : anchor);
}

/**
 * SPEC 第 9 節點名要嘅錨點:「呢筆開支相當於每名香港市民 $X」,用當年人口做分母。
 *
 * @param {number} value            總額(港元)
 * @param {string} period           呢筆數嘅期數,例如 "2025-26"(財政年度)或 "2026-04"
 * @param {Array}  populationSeries 人口指標嘅 series(period 係 "YYYY-06" / "YYYY-12")
 * @param {object} [options]
 * @param {string} [options.noun="每名香港市民"]
 * @param {boolean} [options.fiscal=false] 財政年度必須明文傳 true,唔靠尾兩碼猜。
 *
 * 分母點揀:財政年度 "2025-26" 同曆年 "2025" 只用 2025 年年中人口,冇就唔出錨;
 * 月度 "2026-04" 用唔遲過嗰個月嘅最近一個年中／年底人口。
 * 揀邊個期數會寫入 basis_zh,學生驗得返。
 */
export function anchorPerCapita(value, period, populationSeries, { noun = "每名香港市民", nounEn = noun === "每名香港市民" ? "per Hong Kong resident" : undefined, fiscal = false } = {}) {
  if (!Number.isFinite(value) || !Array.isArray(populationSeries) || populationSeries.length === 0) return null;

  const text = String(period);
  let target;
  let exactMidYear = false;
  if (fiscal === true) {
    const match = /^(\d{4})-(\d{2})$/.exec(text);
    if (!match || Number(match[2]) !== (Number(match[1]) + 1) % 100) return null;
    // 包括有歧義嘅 "2000-01"。呼叫者知道係財年,呢度唔再當成 1 月。
    target = `${text.slice(0, 4)}-06`;
    exactMidYear = true;
  } else if (fiscal !== false) {
    return null;
  } else if (/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) {
    target = text; // 月度,搵唔遲過佢嘅最近一點
  } else if (/^\d{4}$/.test(text)) {
    target = `${text}-06`;
    exactMidYear = true;
  } else {
    return null;
  }

  const candidates = populationSeries
    .filter((point) => Number.isFinite(point.value) && point.value > 0 && /^\d{4}-(06|12)$/.test(point.period) &&
      (exactMidYear ? point.period === target : point.period <= target))
    .sort((a, b) => String(a.period).localeCompare(String(b.period)));
  const denominator = candidates.at(-1);
  if (!denominator || denominator.value <= 0) return null;

  const perHead = value / denominator.value;
  return bilingualAnchor({
    id: "per-capita",
    text_zh: `相當於${noun}約 HK$${formatNumber(perHead, { digits: 0 })}`,
    text_en: `Equivalent to about HK$${formatNumber(perHead, {digits: 0})} ${englishOption(noun, nounEn)}`,
    basis_en: `HK$${formatEnglishMagnitude(value)} ÷ ${formatEnglishMagnitude(denominator.value)} people (population for ${formatPeriodEn(denominator.period)})`,
    basis_zh:
      `${formatChineseMagnitude(value)} 元 ÷ ${formatPeriodZh(denominator.period)}人口 ` +  // 人口序列係月度,唔會係財政年度
      `${formatChineseMagnitude(denominator.value)} 人`,
  });
}
