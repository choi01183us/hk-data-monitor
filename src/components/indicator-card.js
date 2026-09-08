// 首頁嘅指標卡。
//
// 一張卡要答到三樣嘢,學生先撳得落手:
//   1. 呢個指標想答咩問題(question_zh,唔係乾巴巴嘅統計學名)
//   2. 最新係幾多、幾時嘅數
//   3. 呢個數大定細?—— 靠一個「相當於……」錨點(SPEC 第 9 節)

import { html, svg } from "npm:htl";

import { formatChineseMagnitude, formatNumber, formatDateZh, formatPeriodZh } from "./format.js";
import { periodWithNote } from "./citation.js";
import { cardTrend } from "./sparkline.js";

/**
 * 大數字用「萬／億」易入口,但百分比同細數目唔可以縮 ——
 * 「3.7%」縮成「4」就變咗另一個數。
 */
function magnitudeOrExact(value, digits) {
  if (!Number.isFinite(value)) return "—";
  if ((digits ?? 0) > 0 || Math.abs(value) < 10000) return formatNumber(value, { digits: digits ?? 0 });
  return formatChineseMagnitude(value);
}

/**
 * @param {object} indicator  符合 SPEC 第 5 節 schema 嘅指標 JSON
 * @param {object} [options]
 * @param {string} [options.href]  指標頁連結,預設 ./indicators/<id>
 */
export function indicatorCard(indicator, { href } = {}) {
  const {
    indicator_id,
    name_zh,
    unit_zh,
    unit_short_zh,
    category,
    question_zh,
    value_digits,
    updated_at,
    source_zh,
    source_url,
    data_version,
    anchors = [],
    build,
  } = indicator;

  const link = href ?? `./indicators/${indicator_id}`;
  const headline = anchors[0];
  // 同一個 helper 揀大字同小圖，禁止「上面係總額、下面畫其中一類」。
  const trend = cardTrend(indicator);
  const { shown, label: shownLabel } = trend;
  const trendDescription = trend.first
    ? `${name_zh}${shownLabel ? `（${shownLabel}）` : ""}走勢。${periodWithNote(indicator, trend.first.period)}：${formatNumber(trend.first.value, { digits: value_digits })} ${unit_zh}；${periodWithNote(indicator, trend.last.period)}：${formatNumber(trend.last.value, { digits: value_digits })} ${unit_zh}。來源：${source_zh}。各卡獨立刻度，缺值會斷線；完整圖表及資料表見指標頁。`
    : null;

  return html`<article class="indicator-panel"><a class="indicator-card" href=${link}>
    <span class="indicator-card__category">${category ?? "指標"}</span>

    <h2 class="indicator-card__name">${name_zh}</h2>

    ${question_zh ? html`<p class="indicator-card__question">${question_zh}</p>` : null}

    <p class="indicator-card__value">
      <strong>${shown ? magnitudeOrExact(shown.value, value_digits) : "—"}</strong>
      <span class="indicator-card__unit">${unit_short_zh ?? unit_zh}</span>
      ${shown ? html`<span class="indicator-card__period">${periodWithNote(indicator, shown.period)}</span>` : null}
    </p>
    ${shownLabel ? html`<p class="indicator-card__scope">以上係「${shownLabel}」;入去可以睇分類</p>` : null}

    ${trend.first ? html`<div class="indicator-card__trend">
      ${svg`<svg class="indicator-card__sparkline" viewBox=${`0 0 ${trend.width} ${trend.height}`} role="img" aria-label=${trendDescription} preserveAspectRatio="none">
        <title>${trendDescription}</title>
        ${trend.segments.map((segment) => segment.length === 1
          ? svg`<circle cx=${segment[0].x} cy=${segment[0].y} r="2" fill="currentColor"></circle>`
          : svg`<polyline points=${segment.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></polyline>`)}
      </svg>`}
      <p class="indicator-card__trend-range"><span>${formatPeriodZh(trend.first.period, { fiscal: trend.fiscal })}</span><span>${formatPeriodZh(trend.last.period, { fiscal: trend.fiscal })}</span></p>
      <p class="indicator-card__trend-caption">歷年走勢 · 各卡獨立刻度</p>
    </div>` : null}

    ${headline
      ? html`<p class="indicator-card__anchor">${headline.text_zh}</p>`
      : null}

    <p class="indicator-card__meta">
      數據截至 ${formatDateZh(updated_at)}
      <span class="indicator-card__version">資料版本 ${data_version}</span>
      ${build?.stale ? html`<span class="indicator-card__stale">上次更新失敗,顯示緊舊數</span>` : null}
    </p>
  </a>
  <p class="indicator-panel__source"><span>資料來源</span><a href=${source_url} target="_blank" rel="noopener noreferrer">${source_zh} <span aria-hidden="true">↗</span></a></p>
  </article>`;
}
