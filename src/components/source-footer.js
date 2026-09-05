// 來源頁腳 —— SPEC 第 2 節硬規則第 3 條嘅實作。
//
//   「任何顯示畀學生睇的數字,都要喺同一頁見到來源機構、來源連結、數據截至日期。
//     無出處的數字唔可以出現。」
//
// 所以呢個元件唔係裝飾,係規則。每一個指標頁都一定要 render 佢一次。

import { html } from "npm:htl";

import { formatDateZh, formatRelativeZh } from "./format.js";

/**
 * 渲染來源／連結／截至日期／授權。
 *
 * @param {object} indicator  一份符合 SPEC 第 5 節 schema 嘅指標 JSON
 */
export function sourceFooter(indicator) {
  const {
    source_zh,
    source_en,
    source_url,
    source_note_zh,
    licence,
    licence_url,
    updated_at,
    data_version,
    frequency,
    acquisition,
    coverage,
    build,
  } = indicator;

  return html`<section class="source-footer">
    <h2 id="source" class="source-footer__title">資料來源</h2>

    ${build?.stale ? staleWarning(build, updated_at) : null}

    <dl class="source-footer__list">
      <div>
        <dt>來源機構</dt>
        <dd>
          <a href=${source_url} target="_blank" rel="noopener noreferrer">${source_zh}</a>
          <span class="source-footer__en">${source_en}</span>
          ${source_note_zh ? html`<p class="source-footer__note">${source_note_zh}</p>` : null}
        </dd>
      </div>

      <div>
        <dt>數據截至</dt>
        <dd>
          <strong>${formatDateZh(updated_at)}</strong>
          <span class="source-footer__note">
            資料本身涵蓋 ${coverage?.start} 至 ${coverage?.end}${FREQUENCY_ZH[frequency] ? `,${FREQUENCY_ZH[frequency]}更新` : ""}
          </span>
        </dd>
      </div>

      <div>
        <dt>使用授權</dt>
        <dd>
          ${licence_url
            ? html`<a href=${licence_url} target="_blank" rel="noopener noreferrer">${licence}</a>`
            : licence}
        </dd>
      </div>

      <div>
        <dt>資料版本</dt>
        <dd>
          <code>${data_version}</code>
          <span class="source-footer__note">
            ${ACQUISITION_ZH[acquisition] ?? acquisition}${build?.built_at ? `,本頁於 ${formatRelativeZh(build.built_at)}建置` : ""}
          </span>
        </dd>
      </div>
    </dl>

    <p class="source-footer__verify">
      想自己核對?撳上面條來源連結,去返政府原本嗰版對數。
      呢個網站唔會改動原始數字,任何換算都會喺圖表下面寫明。
    </p>
  </section>`;
}

/**
 * 抓數失敗、退返用上一版嗰陣嘅提示。
 *
 * SPEC 第 7 節容許 fail-soft,但學生有權知佢而家睇緊嘅唔係最新數。
 */
function staleWarning(build, updatedAt) {
  return html`<p class="source-footer__stale" role="status">
    <strong>留意:</strong>最近一次自動更新攞唔到新數據,
    以下數字係上一次成功更新嗰時嘅版本(數據截至 ${formatDateZh(updatedAt)})。
    ${build.stale_reason ? html`<span class="source-footer__note">技術原因:${build.stale_reason}</span>` : null}
  </p>`;
}

const FREQUENCY_ZH = {
  annual: "每年",
  quarterly: "每季",
  monthly: "每月",
  biannual: "每半年",
  irregular: "不定期",
};

const ACQUISITION_ZH = {
  api: "由官方 API 自動抓取",
  manual: "人手抄錄自官方文件",
  derived: "由其他指標計算得出",
};
