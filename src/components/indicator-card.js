// 首頁嘅指標卡。
//
// 一張卡要答到三樣嘢,學生先撳得落手:
//   1. 呢個指標想答咩問題(question_zh,唔係乾巴巴嘅統計學名)
//   2. 最新係幾多、幾時嘅數
//   3. 呢個數大定細?—— 靠一個「相當於……」錨點(SPEC 第 9 節)

import { html } from "npm:htl";

import { formatChineseMagnitude, formatDateZh } from "./format.js";

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
    updated_at,
    anchors = [],
    build,
  } = indicator;

  const link = href ?? `./indicators/${indicator_id}`;
  const headline = anchors[0];

  return html`<a class="indicator-card" href=${link}>
    <span class="indicator-card__category">${category ?? "指標"}</span>

    <h2 class="indicator-card__name">${name_zh}</h2>

    ${question_zh ? html`<p class="indicator-card__question">${question_zh}</p>` : null}

    <p class="indicator-card__value">
      <strong>${latest ? formatChineseMagnitude(latest.value) : "—"}</strong>
      <span class="indicator-card__unit">${unit_short_zh ?? unit_zh}</span>
      ${latest ? html`<span class="indicator-card__period">${latest.period}</span>` : null}
    </p>

    ${headline
      ? html`<p class="indicator-card__anchor">${headline.text_zh}</p>`
      : null}

    <p class="indicator-card__meta">
      數據截至 ${formatDateZh(updated_at)}
      ${build?.stale ? html`<span class="indicator-card__stale">上次更新失敗,顯示緊舊數</span>` : null}
    </p>
  </a>`;
}
