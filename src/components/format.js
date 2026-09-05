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
export function formatChineseMagnitude(value) {
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

export function formatPercentChange(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  const change = ((to - from) / Math.abs(from)) * 100;
  return { change, text: `${change >= 0 ? "升" : "跌"}咗 ${formatNumber(Math.abs(change), { digits: 1 })}%` };
}

/** ISO 時間 → 「2026 年 7 月 13 日」。日期唔啱就照回原文，好過顯示 Invalid Date。 */
export function formatDateZh(isoString, { withTime = false } = {}) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return String(isoString);
  const parts = new Intl.DateTimeFormat("zh-HK", {
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
  const rtf = new Intl.RelativeTimeFormat("zh-HK", { numeric: "auto" });
  for (const [unit, size] of table) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(Math.round(seconds), "second");
}

/** 年份字串（世界銀行用「2025」）同 ISO 時間（天文台用）都轉成 Date，畀 Plot 畫 x 軸。 */
export function toDate(dateLike) {
  const text = String(dateLike);
  if (/^\d{4}$/.test(text)) return new Date(Date.UTC(Number(text), 0, 1));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
