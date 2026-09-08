// 「相當於……」對比錨點。
//
// 一個中學生睇到「人均 GDP 56,983 美元」係冇感覺嘅。
// 呢度負責把抽象數字換算成佢有得比較嘅嘢，而且——最重要——
// 每個錨點都要附上 basis_zh，即係「我點計出嚟」，畀學生自己驗算。
//
// 規矩：唔准老作數字。所有換算常數都要有出處（見 CONSTANTS）。

import { formatNumber, formatChineseMagnitude, formatPercentChange, formatPeriodZh, isFiscalPeriodSeries } from "./format.js";

export { formatNumber, formatChineseMagnitude, formatPercentChange, formatPeriodZh };

/** 換算常數。每個都要有 note（點解係咁）同 source（邊度睇返）。 */
export const CONSTANTS = {
  usd_to_hkd: {
    value: 7.8,
    note: "聯繫匯率制度下，港元兌美元喺 7.75–7.85 之間浮動，7.8 係中間價。",
    source: "香港金融管理局 — 聯繫匯率制度",
    source_url: "https://www.hkma.gov.hk/gb_chi/key-functions/money/linked-exchange-rate-system/",
  },
};

// ── 錨點產生器 ────────────────────────────────────────────────
// 每個都回傳 { id, text_zh, basis_zh } 或者 null（資料唔夠就唔好夾硬砌）。

/** 一個年度金額，攤返做「每日幾多錢」。 */
export function anchorPerDay(latestValue, { currency = "HKD", label = "每人每日" } = {}) {
  if (!Number.isFinite(latestValue)) return null;
  const hkd = currency === "USD" ? latestValue * CONSTANTS.usd_to_hkd.value : latestValue;
  const perDay = hkd / 365;
  return {
    id: "per-day",
    text_zh: `相當於${label}約 HK$${formatNumber(perDay, { digits: 0 })}`,
    basis_zh:
      currency === "USD"
        ? `US$${formatNumber(latestValue, { digits: 0 })} × ${CONSTANTS.usd_to_hkd.value}（${CONSTANTS.usd_to_hkd.note}）÷ 365 日`
        : `${formatNumber(latestValue, { digits: 0 })} ÷ 365 日`,
  };
}

/** 同某一年比。用嚟講「你出世嗰年到而家變咗幾多」。 */
export function anchorVersusYear(series, targetPeriod, { label } = {}) {
  const then = series.find((point) => String(point.period) === String(targetPeriod) && Number.isFinite(point.value));
  const now = [...series].reverse().find((point) => Number.isFinite(point.value));
  if (!then || !now || then.period === now.period) return null;
  const delta = formatPercentChange(then.value, now.value);
  if (!delta) return null;
  // 「2005-06」係 2005 年 6 月定 2005–06 年度?要睇成條 series 先知。
  const fiscal = isFiscalPeriodSeries(series.map((point) => point.period));
  const suffix = (period) => formatPeriodZh(period, { fiscal });
  return {
    id: `vs-${targetPeriod}`,
    text_zh: `對比 ${suffix(then.period)}${label ? `（${label}）` : ""}，${delta.text}`,
    basis_zh: `${suffix(then.period)} ${big(then.value)} → ${suffix(now.period)} ${big(now.value)}`,
  };
}

/** 算式入面嘅數:億級用「億」寫,否則「149,386,000,000」呢種學生數唔到有幾多個零。 */
function big(value) {
  return Math.abs(value) >= 1e8 ? formatChineseMagnitude(value) : formatNumber(value);
}

/**
 * 過去 N 年平均每年變幾多。
 *
 * 呢個錨點嘅好處係:分子分母全部喺同一條 series 入面攞,
 * 唔使引入任何外部常數,學生想驗算就一定驗得返。
 */
export function anchorAverageChange(series, { years = 10, noun = "" } = {}) {
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
  return {
    id: "avg-change",
    text_zh: `過去 ${span} 年,平均每年${verb} ${formatChineseMagnitude(Math.abs(perYear))}${noun}`,
    basis_zh: `(${formatNumber(now.value)} − ${formatNumber(then.value)}) ÷ ${span} 年`,
  };
}

/** 相當於幾多個「一件生活上見得到嘅嘢」。unitAmount 必須有出處。 */
export function anchorMultipleOf(latestValue, { unitAmount, unitLabel, unitSource }) {
  if (!Number.isFinite(latestValue) || !Number.isFinite(unitAmount) || unitAmount === 0) return null;
  const times = latestValue / unitAmount;
  return {
    id: "multiple-of",
    text_zh: `相當於 ${formatChineseMagnitude(times)} ${unitLabel}`,
    basis_zh: `${formatNumber(latestValue)} ÷ ${formatNumber(unitAmount)}${unitSource ? `（${unitSource}）` : ""}`,
  };
}

/** 每 N 個人有幾多／一班 30 人嘅課室入面有幾多個 —— 百分比最好用嘅譯法。 */
export function anchorPerClassroom(percentValue, { classSize = 30, subject = "人" } = {}) {
  if (!Number.isFinite(percentValue)) return null;
  const count = (percentValue / 100) * classSize;
  return {
    id: "per-classroom",
    text_zh: `一班 ${classSize} 人嘅課室，大約有 ${formatNumber(count, { digits: 1 })} ${subject}`,
    basis_zh: `${formatNumber(percentValue, { digits: 1 })}% × ${classSize} 人`,
  };
}

/** 一個「多少年」嘅數字，講返係幾多年幾多個月。壽命之類啱用。 */
export function anchorYearsAndMonths(years, { label = "" } = {}) {
  if (!Number.isFinite(years)) return null;
  const whole = Math.floor(years);
  const months = Math.round((years - whole) * 12);
  return {
    id: "years-months",
    text_zh: `${label}即係大約 ${whole} 年 ${months} 個月`,
    basis_zh: `${formatNumber(years, { digits: 2 })} 年 → 小數部分 × 12 個月`,
  };
}

/** 把一堆可能係 null 嘅錨點收埋做一個乾淨陣列。 */
export function collectAnchors(...anchors) {
  return anchors.filter(Boolean);
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
export function anchorPerCapita(value, period, populationSeries, { noun = "每名香港市民", fiscal = false } = {}) {
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
  return {
    id: "per-capita",
    text_zh: `相當於${noun}約 HK$${formatNumber(perHead, { digits: 0 })}`,
    basis_zh:
      `${formatChineseMagnitude(value)} 元 ÷ ${formatPeriodZh(denominator.period)}人口 ` +  // 人口序列係月度,唔會係財政年度
      `${formatChineseMagnitude(denominator.value)} 人`,
  };
}
