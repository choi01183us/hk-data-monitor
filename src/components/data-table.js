import {t, isEnglish} from "./locale.js";
import {label, indicatorText, anchorText} from "./display-text.js";
// 圖表下面嘅「資料表」摺疊區 —— SPEC 第 9 節要求。
//
//   「每個圖下面要有『資料表』摺疊區,顯示原始數字(同時服務無障礙)。」
//
// 兩個用途:
//   1. 無障礙 —— 用螢幕閱讀器嘅學生睇唔到 SVG 圖,但讀得到表
//   2. 可驗證 —— 學生想自己抄落 Excel 或者對返政府原本嗰版,要見到原始數字
//
// 所以呢個表**唔准**四捨五入到「靚仔」為止,要出原值。

import { html } from "npm:htl";

import { exactNumber, periodWithNote } from "./citation.js";

/**
 * @param {object} indicator  符合 SPEC 第 5 節 schema 嘅指標 JSON
 * @param {object} [options]
 * @param {boolean} [options.open=false]  預設打唔打開
 */
export function dataTable(indicator, { open = false } = {}) {
  const { series, unit_zh, unit_source_zh, name_zh } = indicator;
  const hasCategory = series.some((point) => point.category !== undefined);

  // 最新嘅擺喺上面 —— 學生最想睇最新數,唔想碌到 1961 年。
  const rows = [...series].reverse();

  return html`<details class="data-table" ?open=${open}>
    <summary>${t(`資料表(${series.length} 個數據點)`, `Data table (${series.length} observations)`)}</summary>

    <p class="data-table__hint">
      ${t("呢度保留本站資料嘅完整數值,唔縮寫成萬／億。", "This table retains the complete numerical values without magnitude abbreviations.")}
      ${unit_source_zh && unit_source_zh !== unit_zh
        ? t(`來源單位係「${unit_source_zh}」，本表用「${unit_zh}」；請按頁面嘅單位說明核對。`, `Source unit: ${indicatorText(indicator,"unit_source_zh")}; table unit: ${indicatorText(indicator,"unit_zh")}. Check the unit notes on this page.`)
        : t(`本表單位係「${unit_zh}」。`, `Table unit: ${indicatorText(indicator,"unit_zh")}.`)}
    </p>

    <div class="data-table__scroll">
      <table>
        <caption class="visually-hidden">${indicatorText(indicator,"name_zh")} (${indicatorText(indicator,"unit_zh")})</caption>
        <thead>
          <tr>
            <th scope="col">${t("期數", "Period")}</th>
            ${hasCategory ? html`<th scope="col">${t("分類", "Category")}</th>` : null}
            <th scope="col">${t("數值", "Value")}<span class="data-table__unit">(${indicatorText(indicator,"unit_zh")})</span></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(
            (point) => html`<tr>
              <th scope="row">${periodWithNote(indicator, point.period)}</th>
              ${hasCategory ? html`<td>${label(point.category ?? "")}</td>` : null}
              <td class="data-table__value">
                ${point.value === null
                  ? html`<span class="data-table__missing" title=${t("嗰期冇數字,唔係零", "No figure for this period; not zero")}>${t("冇數字", "No data")}</span>`
                  : exactNumber(point.value)}
              </td>
            </tr>`
          )}
        </tbody>
      </table>
    </div>
  </details>`;
}
