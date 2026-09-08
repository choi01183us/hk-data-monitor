// 來源頁腳 —— SPEC 第 2 節硬規則第 3 條嘅實作。
//
//   「任何顯示畀學生睇的數字,都要喺同一頁見到來源機構、來源連結、數據截至日期。
//     無出處的數字唔可以出現。」
//
// 所以呢個元件唔係裝飾,係規則。每一個指標頁都一定要 render 佢一次。

import { html } from "npm:htl";

import { formatDateZh, formatRelativeZh } from "./format.js";
import { citationChoices, citationChoiceLabel, createCitation } from "./citation.js";

/**
 * 渲染來源／連結／截至日期／授權。
 *
 * @param {object} indicator  一份符合 SPEC 第 5 節 schema 嘅原始指標 JSON
 * @param {object} [options]  {period} 指定引用初始期數;增減圖用 {comparison:{from,to}},配原始 series
 */
export function sourceFooter(indicator, options = {}) {
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
    unit_zh,
    unit_source_zh,
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
        <dt>單位</dt>
        <dd>
          <strong>${unit_zh}</strong>
          ${unit_source_zh && unit_source_zh !== unit_zh
            ? html`<span class="source-footer__note">來源原本寫「${unit_source_zh}」</span>`
            : null}
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
    ${citationPicker(indicator, options)}
  </section>`;
}

/** 完全在本頁組合文字。剪貼簿不可用時,仍可選取 textarea 手動複製。 */
export function citationPicker(indicator, options = {}) {
  let choices;
  try {
    choices = citationChoices(indicator, options);
    // 選項標籤亦屬於引用內容;狀態欄損壞時顯示錯誤,唔令整個來源區消失。
    for (const choice of choices) citationChoiceLabel(indicator, choice);
  } catch (error) {
    return html`<p class="citation-status" role="status">暫時未能提供引用：${error.message}</p>`;
  }
  if (choices.length === 0) {
    return html`<p class="citation-status">未有完整有效數字可供引用；未填值唔代表零。</p>`;
  }

  const periodSelect = html`<select aria-label="選擇引用期數"></select>`;
  const measureSelect = html`<select aria-label="選擇引用分類或總額"></select>`;
  const preview = html`<textarea class="citation-preview" readonly rows="7" aria-label="完整引用文字"></textarea>`;
  const status = html`<p class="citation-status" role="status" aria-live="polite"></p>`;
  const copy = html`<button type="button">複製完整引用</button>`;
  const selectText = html`<button type="button">選取引用文字</button>`;
  const periodKey = (choice) => choice.from ? `${choice.from}/${choice.to}` : choice.period;
  const keys = [...new Set(choices.map(periodKey))];
  periodSelect.replaceChildren(...keys.map((key) => {
    const choice = choices.find((item) => periodKey(item) === key);
    return html`<option value=${key}>${citationChoiceLabel(indicator, choice).period}</option>`;
  }));
  // 只改初始選項,保留其他有效期數。期數不存在已由 citationChoices 明確拒絕。
  if (!options.comparison && options.period !== undefined) periodSelect.value = options.period;
  let shown = [];
  function updateText() {
    try {
      preview.value = createCitation(indicator, shown[Number(measureSelect.value)]);
      copy.disabled = false;
      selectText.disabled = false;
      status.textContent = "引用已包括期數、口徑、單位及來源；可直接複製。";
    } catch (error) {
      preview.value = "";
      copy.disabled = true;
      selectText.disabled = true;
      status.textContent = `暫時未能提供引用：${error.message}`;
    }
  }
  function updateMeasures() {
    shown = choices.filter((choice) => periodKey(choice) === periodSelect.value);
    measureSelect.replaceChildren(...shown.map((choice, index) =>
      html`<option value=${index}>${citationChoiceLabel(indicator, choice).measure}</option>`
    ));
    updateText();
  }
  periodSelect.addEventListener("change", updateMeasures);
  measureSelect.addEventListener("change", updateText);
  selectText.addEventListener("click", () => {
    preview.focus();
    preview.select();
    status.textContent = "已選取引用文字，可用裝置嘅複製功能。";
  });
  copy.addEventListener("click", async () => {
    const text = preview.value;
    if (!text) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      status.textContent = "已複製完整引用。";
    } catch {
      preview.focus();
      preview.select();
      status.textContent = "未能自動複製。引用文字已選取，請用裝置嘅複製功能。";
    }
  });
  updateMeasures();
  return html`<details class="citation-picker">
    <summary>複製數字及出處</summary>
    <p>揀期數及分類，先核對下面嘅完整引用。呢個功能離線都用到。</p>
    <div class="citation-controls">
      <label>期數 ${periodSelect}</label>
      <label>分類／總額 ${measureSelect}</label>
    </div>
    <label>引用預覽 ${preview}</label>
    <div class="citation-controls">${copy} ${selectText}</div>
    ${status}
  </details>`;
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
