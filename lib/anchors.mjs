// 「相當於……」對比錨點。
//
// 一個中學生睇到「人均 GDP 56,983 美元」係冇感覺嘅。
// 呢度負責把抽象數字換算成佢有得比較嘅嘢，而且——最重要——
// 每個錨點都要附上 basis_zh，即係「我點計出嚟」，畀學生自己驗算。
//
// 規矩：唔准老作數字。所有換算常數都要有出處（見 CONSTANTS）。

import { formatNumber, formatChineseMagnitude, formatPercentChange } from "../src/components/format.js";

export { formatNumber, formatChineseMagnitude, formatPercentChange };

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
export function anchorPerDay(latestValue, { currency = "USD", label = "每人每日" } = {}) {
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
export function anchorVersusYear(series, targetDate, { label } = {}) {
  const then = series.find((point) => String(point.date) === String(targetDate) && Number.isFinite(point.value));
  const now = [...series].reverse().find((point) => Number.isFinite(point.value));
  if (!then || !now || then.date === now.date) return null;
  const delta = formatPercentChange(then.value, now.value);
  if (!delta) return null;
  return {
    id: `vs-${targetDate}`,
    text_zh: `對比 ${then.date} 年${label ? `（${label}）` : ""}，${delta.text}`,
    basis_zh: `${then.date} 年 ${formatNumber(then.value)} → ${now.date} 年 ${formatNumber(now.value)}`,
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
