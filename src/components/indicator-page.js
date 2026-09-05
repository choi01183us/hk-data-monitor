// 指標頁嘅共用版面。
//
// 11 個指標頁如果各自抄一次 headline / 錨點 / 註釋嘅 markup,
// 遲下改個排版就要改 11 個檔。呢度收埋佢哋。
//
// SPEC 第 9 節要求每頁都要有:圖、對比錨點、資料表摺疊區、來源。
// 資料表同來源分別喺 data-table.js 同 source-footer.js。

import { html } from "npm:htl";

import { formatNumber, formatPeriodZh } from "./format.js";

/** 大字最新值 + 問題句。 */
export function indicatorHeader(indicator) {
  const { name_zh, question_zh, latest, unit_zh } = indicator;
  return html`<div>
    ${question_zh ? html`<p class="lede">${question_zh}</p>` : null}
    <div class="headline">
      <div class="headline__number">
        <strong>${latest ? formatNumber(latest.value, { digits: 0 }) : "—"}</strong>
        <span class="headline__unit">${unit_zh}</span>
      </div>
      <div class="headline__period">${latest ? formatPeriodZh(latest.period) : ""}</div>
    </div>
  </div>`;
}

/** 期數寫法統一喺 format.js,呢度只係轉出去畀指標頁用。 */
export { formatPeriodZh as periodLabel };

/**
 * 「相當於……」對比錨點(SPEC 第 9 節)。
 *
 * 每個錨點一定要連 basis_zh 一齊出。畀學生驗算係重點 ——
 * 一個佢驗唔到嘅換算,同一個佢要照單全收嘅數字冇分別。
 */
export function indicatorAnchors(indicator) {
  const anchors = indicator.anchors ?? [];
  if (anchors.length === 0) return html`<div></div>`;
  return html`<div>
    <h2 id="anchors">相當於……</h2>
    <p class="section-hint">
      數字太大嘅時候好難有感覺。下面每一句都附埋算式,你可以自己撳計數機驗。
    </p>
    <div class="anchors">
      ${anchors.map(
        (anchor) => html`<div class="anchor">
          <p class="anchor__text">${anchor.text_zh}</p>
          <p class="anchor__basis">點計出嚟:${anchor.basis_zh}</p>
        </div>`
      )}
    </div>
  </div>`;
}

/** 圖表下面嘅提醒。統計處好多表都有唔講就會誤讀嘅口徑問題。 */
export function indicatorNote(indicator) {
  if (!indicator.notes_zh) return html`<div></div>`;
  return html`<div class="chart-note"><strong>讀呢個數之前:</strong>${indicator.notes_zh}</div>`;
}
