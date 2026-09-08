// 首頁小圖只取同一指標、同一分類(或來源已有嘅總額)，唔會加總或推算。
// 時間用實際 UTC 日期；ordinal 只負責找缺期，缺值／缺期都會斷線。

function periodPoint(period, frequency, fiscal) {
  const text = String(period);
  const year = Number(text.slice(0, 4));
  if (frequency === "annual" && /^\d{4}$/.test(text)) {
    return { time: Date.UTC(year, 0, 1), ordinal: year };
  }
  if (frequency === "annual" && fiscal && /^\d{4}-\d{2}$/.test(text) &&
      Number(text.slice(5)) === (year + 1) % 100) {
    return { time: Date.UTC(year, 3, 1), ordinal: year };
  }
  if (frequency === "quarterly" && /^\d{4}-Q[1-4]$/.test(text)) {
    const quarter = Number(text.slice(6));
    return { time: Date.UTC(year, (quarter - 1) * 3, 1), ordinal: year * 4 + quarter };
  }
  if (["monthly", "biannual"].includes(frequency) && /^\d{4}-(0[1-9]|1[0-2])$/.test(text)) {
    const month = Number(text.slice(5));
    if (frequency === "biannual" && month !== 6 && month !== 12) throw new Error("半年數列唔係年中／年底");
    return { time: Date.UTC(year, month - 1, 1), ordinal: frequency === "biannual" ? year * 2 + month / 6 : year * 12 + month };
  }
  throw new Error(`小圖期數同頻率不符：${text} / ${frequency}`);
}

/**
 * 傳入完整原始指標，回傳卡片大字及同口徑小圖。唔接受跨指標資料集合。
 * 財年由 annual 頻率及成條數列嘅 YYYY-YY 結構明定，包含 2000-01。
 * 每條線各自按值縮放；保留原完整圖嘅 y_zero 設定，唔比較跨卡線高。
 */
export function cardTrend(indicator, { width = 260, height = 58, padding = 4 } = {}) {
  if (!indicator || Array.isArray(indicator) || !Array.isArray(indicator.series)) throw new Error("小圖只接受一個原始指標");
  if (![width, height, padding].every(Number.isFinite) || padding < 0 || width <= padding * 2 || height <= padding * 2) {
    throw new Error("小圖尺寸無效");
  }
  const latestTotal = Array.isArray(indicator.totals)
    ? [...indicator.totals].reverse().find((p) => Number.isFinite(p.value)) : null;
  const shown = latestTotal ?? indicator.latest_by_category?.[0] ?? indicator.latest;
  const label = latestTotal ? "總額" : shown?.category ?? null;
  if (!shown || !Number.isFinite(shown.value)) return { shown: null, label, segments: [], width, height };

  for (const field of ["indicator_id", "source_zh", "source_url", "unit_zh", "updated_at", "data_version"]) {
    if (typeof indicator[field] !== "string" || !indicator[field].trim()) throw new Error(`小圖缺少 ${field}`);
  }
  const selected = latestTotal
    ? indicator.totals
    : indicator.series.filter((point) => point.category === shown.category);
  if (latestTotal && selected.some((point) => point.category != null)) throw new Error("總額數列混入分類");
  if (!latestTotal && shown.category == null && indicator.series.some((point) => point.category != null)) {
    throw new Error("多分類小圖必須指定分類");
  }
  // annual 亦可以係曆年；唔會把同字串嘅 monthly 2000-01 變成財年。
  const fiscal = indicator.frequency === "annual" && selected.every((p) => /^\d{4}-\d{2}$/.test(p.period));
  const rows = selected.map((point) => {
    if (point.value !== null && !Number.isFinite(point.value)) throw new Error("小圖值唔係有限數字或 null");
    return { ...point, ...periodPoint(point.period, indicator.frequency, fiscal) };
  }).sort((a, b) => a.time - b.time);
  if (rows.some((point, i) => i > 0 && point.time === rows[i - 1].time)) throw new Error("小圖同一期有重複值");
  const valid = rows.filter((point) => Number.isFinite(point.value));
  const first = valid[0], last = valid.at(-1);
  if (!last || shown.period !== last.period || shown.value !== last.value) throw new Error("卡片大字同原始數列最新值不符");
  const min = Math.min(...valid.map((p) => p.value), ...(indicator.chart?.y_zero ? [0] : []));
  const max = Math.max(...valid.map((p) => p.value), ...(indicator.chart?.y_zero ? [0] : []));
  const span = last.time - first.time;
  const valueSpan = max - min;
  const points = rows.map((point) => ({
    ...point,
    x: span ? padding + (point.time - first.time) / span * (width - padding * 2) : width / 2,
    y: point.value === null ? null : valueSpan ? height - padding - (point.value - min) / valueSpan * (height - padding * 2) : height / 2,
  }));
  const segments = [];
  let segment = [], previous = null;
  for (const point of points) {
    if (point.value === null || (previous && point.ordinal - previous.ordinal !== 1)) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (point.value !== null) segment.push(point);
    previous = point;
  }
  if (segment.length) segments.push(segment);
  return { shown, label, fiscal, first, last, segments, width, height };
}
