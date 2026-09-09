import { isEnglish, t } from "./locale.js";

// 數字同日期嘅香港中文格式化。
//
// 呢個檔案係純 ESM、冇用任何瀏覽器 API，所以兩邊都食得：
//   · 瀏覽器 —— 由 .md 頁面 import
//   · Node   —— 由 lib/anchors.mjs import（package.json 已經係 "type": "module"）
// 咁樣「750 萬」點寫，全世界得一個答案。

const nf0 = new Intl.NumberFormat("zh-HK", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("zh-HK", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("zh-HK", { maximumFractionDigits: 2 });

/** 一般數字。唔指定 digits 就按大細自動決定小數位。 */
export function formatNumber(value, { digits } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (digits === 0) return nf0.format(value);
  if (digits === 1) return nf1.format(value);
  if (digits === 2) return nf2.format(value);
  const magnitude = Math.abs(value);
  if (magnitude >= 1000) return nf0.format(value);
  if (magnitude >= 10) return nf1.format(value);
  return nf2.format(value);
}

/**
 * 中文大數字：用「萬」同「億」，唔用 K / M / B。
 * 7,500,000 → 「750 萬」；56,983 → 「5.7 萬」；1.23e9 → 「12.3 億」。
 */
export function formatChineseMagnitude(value, {locale} = {}) {
  if (locale === "en-GB" || (!locale && isEnglish())) return formatEnglishMagnitude(value);
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e8) {
    const scaled = magnitude / 1e8;
    return `${sign}${formatNumber(scaled, { digits: scaled >= 100 ? 0 : 2 })} 億`;
  }
  if (magnitude >= 1e4) {
    const scaled = magnitude / 1e4;
    return `${sign}${formatNumber(scaled, { digits: scaled >= 100 ? 0 : 1 })} 萬`;
  }
  return `${sign}${formatNumber(magnitude)}`;
}

/** 帶單位嘅顯示值，例如「56,983 美元」。 */
export function formatWithUnit(value, unit, options) {
  const number = formatNumber(value, options);
  if (number === "—" || !unit) return number;
  return `${number} ${unit}`;
}

export function formatPercentChange(from, to, {locale} = {}) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  const change = ((to - from) / Math.abs(from)) * 100;
  return { change, text: (locale === "en-GB" || (!locale && isEnglish())) ? `${change >= 0 ? "increased" : "decreased"} by ${formatNumber(Math.abs(change), {digits:1})}%` : `${change >= 0 ? "升" : "跌"}咗 ${formatNumber(Math.abs(change), {digits:1})}%` };
}

/** ISO 時間 → 「2026 年 7 月 13 日」。日期唔啱就照回原文，好過顯示 Invalid Date。 */
export function formatDateZh(isoString, { withTime = false } = {}) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return String(isoString);
  const parts = new Intl.DateTimeFormat(isEnglish() ? "en-GB" : "zh-HK", {
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
    timeZone: "Asia/Hong_Kong",
  }).format(date);
  return parts;
}

/** 「3 日前」咁樣嘅相對講法，畀學生一眼知資料新唔新。 */
export function formatRelativeZh(isoString, now = new Date()) {
  if (!isoString) return "—";
  const then = new Date(isoString);
  if (Number.isNaN(then.getTime())) return String(isoString);
  const seconds = Math.round((then.getTime() - now.getTime()) / 1000);
  const table = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const rtf = new Intl.RelativeTimeFormat(isEnglish() ? "en-GB" : "zh-HK", { numeric: "auto" });
  for (const [unit, size] of table) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(Math.round(seconds), "second");
}

/**
 * 呢條 series 係咪財政年度("2025-26")?
 *
 * 「2000-01」單睇字串分唔到係「2000 年 1 月」定「2000–01 年度」——
 * 兩種寫法喺 SPEC 第 5 節都合法。但成條 series 一齊睇就分得到:
 * 財政年度序列橫跨幾十年,一定有「YY > 12」嘅期數(例如 2026-27);
 * 月度序列嘅第二段永遠喺 01–12 之間。
 *
 * 曾經因為冇做呢個判斷,政府收入 30 年數據得 2000–2011 十二年上到圖,
 * 其餘全部被靜靜哋掉走 —— 圖表冇報錯,淨係錯咗。
 */
export function isFiscalPeriodSeries(periods) {
  return periods.some((period) => {
    const match = /^(\d{4})-(\d{2})$/.exec(String(period));
    if (!match) return false;
    const second = Number(match[2]);
    return second > 12 || second === 0;
  });
}

/**
 * SPEC 第 5 節嘅 period 字串轉 Date,畀 Plot 畫 x 軸。
 *
 *   "2025"      -> 2025-01-01
 *   "2026-Q1"   -> 2026-01-01(季度嘅第一個月)
 *   "2026-06"   -> 2026-06-01(月度)
 *   "2025-26"   -> 2025-04-01(財政年度由 4 月 1 日開始;要 fiscal: true)
 *
 * fiscal 一定要由呼叫者用 isFiscalPeriodSeries() 判斷咗先傳入。
 */
export function toDate(dateLike, { fiscal = false } = {}) {
  const text = String(dateLike);
  let match = /^(\d{4})$/.exec(text);
  if (match) return new Date(Date.UTC(Number(match[1]), 0, 1));
  match = /^(\d{4})-Q([1-4])$/.exec(text);
  if (match) return new Date(Date.UTC(Number(match[1]), (Number(match[2]) - 1) * 3, 1));
  match = /^(\d{4})-(\d{2})$/.exec(text);
  if (match) {
    if (fiscal) return new Date(Date.UTC(Number(match[1]), 3, 1));
    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? new Date(Date.UTC(Number(match[1]), month - 1, 1)) : null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * SPEC 第 5 節嘅 period 字串轉人話。
 *
 *   "2025"     -> "2025 年"
 *   "2026-06"  -> "2026 年 6 月"
 *   "2026-Q1"  -> "2026 年第 1 季"
 *   "2025-26"  -> "2025–26 年度"(財政年度)
 *
 * 擺喺呢度而唔係各自寫一份:錨點文字同指標頁大字都要用,
 * 兩邊寫法唔同嘅話,同一個期數會喺同一版出現兩種寫法。
 */
export function formatPeriodZh(period, { fiscal = false, locale } = {}) {
  if (locale === "en-GB" || (!locale && isEnglish())) return formatPeriodEn(period, {fiscal});
  const text = String(period ?? "");
  let match = /^(\d{4})-Q(\d)$/.exec(text);
  if (match) return `${match[1]} 年第 ${match[2]} 季`;
  match = /^(\d{4})-(\d{2})$/.exec(text);
  if (match) {
    const month = Number(match[2]);
    // 「2000-01」可以係 2000 年 1 月,亦可以係 2000–01 年度 —— 靠 fiscal 分。
    // 冇傳 fiscal 嘅話,超出 01–12 嘅一定係年度,其餘當月份。
    if (fiscal || month > 12 || month === 0) return `${match[1]}–${match[2]} 年度`;
    return `${match[1]} 年 ${month} 月`;
  }
  return /^\d{4}$/.test(text) ? `${text} 年` : text;
}

/** 財政年度嘅 x 軸刻度:Date(4 月 1 日)-> "2019–20" */
export function fiscalTickLabel(date) {
  const year = date.getUTCFullYear();
  return `${year}–${String(year + 1).slice(-2)}`;
}

/** English display uses international magnitudes with the same unscaled input. */
export function formatEnglishMagnitude(value) {
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  for (const [scale, word] of [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]]) {
    if (magnitude >= scale) return `${formatNumber(value / scale, {digits: 2})} ${word}`;
  }
  return formatNumber(value);
}
export function formatPeriodEn(period, {fiscal = false} = {}) {
  const text = String(period ?? "");
  let match = /^(\d{4})-Q([1-4])$/.exec(text);
  if (match) return `Q${match[2]} ${match[1]}`;
  match = /^(\d{4})-(\d{2})$/.exec(text);
  if (match) {
    const month = Number(match[2]);
    if (fiscal || month > 12 || month === 0) return `${match[1]}–${match[2]} financial year`;
    return new Intl.DateTimeFormat("en-GB", {month: "long", year: "numeric", timeZone: "UTC"}).format(new Date(Date.UTC(Number(match[1]), month - 1, 1)));
  }
  return text;
}
