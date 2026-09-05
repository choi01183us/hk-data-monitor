// 指標頁嘅共用版面。
//
// 11 個指標頁如果各自抄一次 headline / 錨點 / 註釋嘅 markup,
// 遲下改個排版就要改 11 個檔。呢度收埋佢哋。
//
// SPEC 第 9 節要求每頁都要有:圖、對比錨點、資料表摺疊區、來源。
// 資料表同來源分別喺 data-table.js 同 source-footer.js。

import { html } from "npm:htl";

import { formatNumber, formatChineseMagnitude, formatPeriodZh, isFiscalPeriodSeries } from "./format.js";

/**
 * 大字最新值 + 問題句。
 *
 * 多分類指標(例如失業率有「全港整體」同「15–24 歲青年」)一定要逐個分類出,
 * 唔可以淨係出 series 最尾嗰點 —— 咁樣即係幫學生揀咗一個分類而唔講,
 * 失業率會變成一個冇講明係邊個群組嘅「4%」。
 */
export function indicatorHeader(indicator) {
  const { question_zh, latest, latest_by_category, unit_zh, value_digits, totals, series } = indicator;
  const digits = value_digits ?? 0;
  const fiscal = isFiscalPeriodSeries((series ?? []).map((point) => point.period));
  // 有總額(例如政府開支分咗四類)就先出總額,再出各分類 —— 學生先要知有幾大個餅
  const latestTotal = Array.isArray(totals) ? [...totals].reverse().find((t) => t.value !== null) : null;
  const items = [
    ...(latestTotal ? [{ category: "總額", period: latestTotal.period, value: latestTotal.value, total: true }] : []),
    ...(latest_by_category && latest_by_category.length > 0
      ? latest_by_category
      : latest
        ? [{ category: null, period: latest.period, value: latest.value }]
        : []),
  ];

  return html`<div>
    ${question_zh ? html`<p class="lede">${question_zh}</p>` : null}
    <div class="headline ${items.length > 1 ? "headline--multi" : ""}">
      ${items.map(
        (item) => html`<div class="headline__item ${item.total ? "headline__item--total" : ""}">
          ${item.category ? html`<div class="headline__label">${item.category}</div>` : null}
          <div class="headline__number">
            <strong>${item.value === null ? "—" : headlineNumber(item.value, digits)}</strong>
            <span class="headline__unit">${unit_zh}</span>
          </div>
          <div class="headline__period">${item.period ? formatPeriodZh(item.period, { fiscal }) : ""}</div>
        </div>`
      )}
    </div>
  </div>`;
}

/**
 * 大字用邊種寫法:
 *   · 億級(政府開支 599,677,000,000)—— 「5,997 億」,十二位數學生數唔到有幾多個零
 *   · 其餘(444,044 港元、3.7%)—— 照出原數,四捨五入會變咗另一個數
 * 資料表嗰邊照出原始數字,想核對就去嗰度。
 */
function headlineNumber(value, digits) {
  return Math.abs(value) >= 1e8 ? formatChineseMagnitude(value) : formatNumber(value, { digits });
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

/**
 * 人手抄嘅指標未填數嗰陣嘅提示。
 *
 * SPEC 第 2 節第 4 條:唔准估數,寧願唔出現。所以未填嘅指標首頁唔會出卡;
 * 但呢一版仲 build 得到,畀維護者見到骨架同抄數指引。
 */
export function manualNotice(indicator) {
  if (indicator.acquisition !== "manual") return html`<div></div>`;
  if (indicator.manual_status === "filled") {
    return html`<p class="manual-notice manual-notice--ok">
      呢個指標嘅數字係人手由官方文件抄落嚟嘅(${indicator.manual_filled} 格已填),唔係自動抓。
      抄嘅來源同日期喺下面「資料來源」一欄。
    </p>`;
  }
  return html`<div class="manual-notice manual-notice--todo" role="status">
    <strong>數據未填。</strong>
    呢個指標要人手由官方文件抄數(${indicator.manual_filled} 格已填),而家仲未填齊,所以首頁唔會出佢。
    維護者請睇 <code>manual/README.md</code>。呢版唔會顯示任何估算或者預設數字。
  </div>`;
}
