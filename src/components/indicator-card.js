// 首頁嘅指標卡。
//
// 一張卡要答到三樣嘢,學生先撳得落手:
//   1. 呢個指標想答咩問題(question_zh,唔係乾巴巴嘅統計學名)
//   2. 最新係幾多、幾時嘅數
//   3. 呢個數大定細?—— 靠一個「相當於……」錨點(SPEC 第 9 節)

import { html } from "npm:htl";

import { formatChineseMagnitude, formatNumber, formatDateZh } from "./format.js";

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
    latest,
    latest_by_category,
    value_digits,
    updated_at,
    anchors = [],
    build,
  } = indicator;

  const link = href ?? `./indicators/${indicator_id}`;
  const headline = anchors[0];
  // 多分類指標喺卡上只出第一個分類,但一定要寫低係邊個 —— 唔可以扮咗係總數。
  const shown = latest_by_category?.[0] ?? latest;
  const shownLabel = latest_by_category?.length ? latest_by_category[0].category : null;

  return html`<a class="indicator-card" href=${link}>
    <span class="indicator-card__category">${category ?? "指標"}</span>

    <h2 class="indicator-card__name">${name_zh}</h2>

    ${question_zh ? html`<p class="indicator-card__question">${question_zh}</p>` : null}

    <p class="indicator-card__value">
      <strong>${shown ? magnitudeOrExact(shown.value, value_digits) : "—"}</strong>
      <span class="indicator-card__unit">${unit_short_zh ?? unit_zh}</span>
      ${shown ? html`<span class="indicator-card__period">${shown.period}</span>` : null}
    </p>
    ${shownLabel ? html`<p class="indicator-card__scope">以上係「${shownLabel}」;呢個指標有多過一組數</p>` : null}

    ${headline
      ? html`<p class="indicator-card__anchor">${headline.text_zh}</p>`
      : null}

    <p class="indicator-card__meta">
      數據截至 ${formatDateZh(updated_at)}
      ${build?.stale ? html`<span class="indicator-card__stale">上次更新失敗,顯示緊舊數</span>` : null}
    </p>
  </a>`;
}
