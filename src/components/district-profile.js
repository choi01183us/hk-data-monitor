import {html, svg} from "npm:htl";
import {districtHistory, districtHistoryChart} from "./district-history.js";
import {exactNumber, createCitation} from "./citation.js";
import {formatNumber} from "./format.js";

const number = (value, unit = "") => value === null ? "未提供" : `${exactNumber(value)}${unit ? ` ${unit}` : ""}`;
const signed = (value, unit) => value === null ? "未能計算" : `${value > 0 ? "+" : ""}${number(value, unit)}`;
const percentage = (value) => value === null ? "未能計算" : `${value > 0 ? "+" : ""}${formatNumber(value, {digits: 1})}%`;

/** 純本頁概況；列印範圍及控制由外層處理，元件唔開新視窗或儲存資料。 */
export function districtProfile(options) {
  const model = districtHistory(options);
  const {population, income} = options;
  const sources = [{key: "population", doc: population, label: "陸上非住院人口", unit: "人"}, {key: "income", doc: income, label: "住戶每月入息中位數", unit: "港元／月"}];
  const areas = [{key: "selected", label: model.selected.label}, {key: "comparison", label: model.comparison.label}];
  function citations(source, area) {
    const change = model.changes[area.key][source.key];
    const points = [...new Set([model.fromPeriod, model.period])].map((period) => {
      const row = model.rows.find((row) => row.period === period);
      return row[area.key][source.key] === null ? html`<p>${area.label} ${period} 年未提供數字，未能引用。</p>` : html`<pre class="district-profile-citation">${createCitation(source.doc, {kind: "point", category: area.label, period})}</pre>`;
    });
    return html`<div>${points}<p class="district-profile-formula">${area.label}：${change.delta === null ? "缺少其中一期原值，未能計算變化。" : `${model.period} 年 ${number(change.to)} − ${model.fromPeriod} 年 ${number(change.from)} = ${signed(change.delta, source.unit)}；${change.percent === null ? "基準為零，百分比未能計算。" : `變動 = (${exactNumber(change.to)} − ${exactNumber(change.from)}) ÷ ${exactNumber(change.from)} × 100 = ${percentage(change.percent)}（百分比四捨五入至一位小數）。`}`}</p></div>`;
  }
  function chart(source) {
    const plot = districtHistoryChart(model.rows, source.key);
    const description = `${source.label}；${model.rows[0].period} 至 ${model.period} 年；單位 ${source.unit}。實線 ${model.selected.label}，虛線 ${model.comparison.label}。零起點，缺值或缺年斷線；完整數字見下面資料表。`;
    return html`<figure class="district-history-chart"><figcaption><strong>${source.label}</strong><span>${source.unit} · 零起點</span></figcaption>${svg`<svg viewBox="0 0 560 195" role="img" aria-label=${description}><title>${description}</title>
      <line x1="70" y1="155" x2="540" y2="155" stroke="currentColor" opacity="0.4"></line>
      <line x1="70" y1="25" x2="540" y2="25" stroke="currentColor" opacity="0.2"></line>
      <text x="62" y="159" text-anchor="end" fill="currentColor" font-size="12">0</text>
      ${plot.maximum > 0 ? svg`<text x="62" y="29" text-anchor="end" fill="currentColor" font-size="12">${formatNumber(plot.maximum, {digits: 0})}</text>` : null}
      ${plot.ticks.map((tick, i) => (plot.ticks.length <= 5 || i === 0 || i === plot.ticks.length - 1 || i % 2 === 0) ? svg`<text x=${tick.x} y="180" text-anchor="middle" fill="currentColor" font-size="12">${tick.period}</text>` : null)}
      ${plot.lines.map((line) => svg`<g class=${`district-history-line district-history-line--${line.key}`} fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray=${line.key === "comparison" ? "7 4" : null}>
        ${line.segments.map((segment) => svg`<g>${segment.length > 1 ? svg`<polyline points=${segment.map((point) => `${point.x},${point.y}`).join(" ")}></polyline>` : null}${segment.map((point) => svg`<circle cx=${point.x} cy=${point.y} r="3" fill="currentColor" stroke="none"><title>${areas.find((area) => area.key === line.key).label} · ${point.period} 年：${number(point.value, source.unit)}</title></circle>`)}</g>`)}
      </g>`)}
    </svg>`}<p class="district-history-legend"><span>━━ ${model.selected.label}</span><span>┄┄ ${model.comparison.label}</span></p></figure>`;
  }
  return html`<section class="district-profile district-report" aria-label=${`${model.selected.label}地區概況報告`}>
    <header class="district-profile-heading"><div><span class="monitor-kicker">地區概況報告</span><h3>${model.selected.label} · ${model.period} 年</h3></div><p>對照：${model.comparison.label} · 變化基準：${model.fromPeriod} 年</p></header>
    <div class="district-profile-current">${areas.map((area) => html`<article><h4>${area.label}${area.key === "selected" ? "（所選）" : "（對照）"}</h4><dl>${sources.map((source) => html`<div><dt>${source.label}</dt><dd>${number(model.latest[area.key][source.key], source.unit)}</dd></div>`)}<div><dt>佔同年度全港陸上非住院人口</dt><dd>${model.latest[area.key].share === null ? "未能計算" : `${formatNumber(model.latest[area.key].share, {digits: 2})}%`}</dd></div></dl></article>`)}</div>
    <p class="district-profile-note">人口比例＝該地區人數 ÷ 同表同年度全港人數 × 100；全港分母：${number(model.latest.nationalPopulation, "人")}。此比例唔係人口密度，亦唔係政府分區開支。全港住戶入息中位數直接用官方數字，唔係各區平均；入息未扣通脹，唔代表個人月薪或財富。</p>
    <details class="district-profile-history"><summary>睇歷年走勢、變化及原始數字</summary>
      <p>${model.fromPeriod} → ${model.period} 年${model.fromPeriod === model.period ? "：同一年度，未有跨年變化。" : "：期末值減基準值；百分比以基準值為分母。"}缺值唔補零；基準值為零時，百分比未能計算。</p>
      <div class="district-profile-table-wrap"><table class="district-change-table"><caption>所選期間變化（入息為名義變化）</caption><thead><tr><th scope="col">地區／量度</th><th scope="col">${model.fromPeriod} 年</th><th scope="col">${model.period} 年</th><th scope="col">增減</th><th scope="col">變動</th></tr></thead><tbody>${areas.flatMap((area) => sources.map((source) => {const change = model.changes[area.key][source.key]; return html`<tr><th scope="row">${area.label} · ${source.label}（${source.unit}）</th><td>${number(change.from)}</td><td>${number(change.to)}</td><td>${signed(change.delta)}</td><td>${percentage(change.percent)}</td></tr>`;}))}</tbody></table></div>
      <div class="district-history-charts">${sources.map(chart)}</div>
      <p class="district-profile-note">每幅圖只畫一種量度；兩地區共用該幅圖嘅刻度，人口與入息分開畫。只顯示截至所選年度嘅共同年度；未收錄年份同缺值會斷線，唔作插值。</p>
      <div class="district-profile-table-wrap"><table class="district-history-table"><caption>原始資料表：${model.rows[0].period}–${model.period} 年（缺值＝未提供）</caption><thead><tr><th scope="col">年度</th><th scope="col">地區</th><th scope="col">人口（人）</th><th scope="col">住戶月入中位數（港元）</th></tr></thead><tbody>${model.rows.flatMap((row) => areas.map((area) => html`<tr><th scope="row">${row.period}</th><td>${area.label}</td><td>${number(row[area.key].population)}</td><td>${number(row[area.key].income)}</td></tr>`))}</tbody></table></div>
    </details>
    <details class="district-profile-citations"><summary>來源、口徑及可選取引用</summary>${sources.map((source) => html`<section><h4>${source.label}</h4><p>${source.doc.basis_zh}</p><p><a href=${source.doc.source_url} target="_blank" rel="noopener noreferrer">${source.doc.source_zh}</a> · 數據截至 ${source.doc.updated_at} · 資料版本 ${source.doc.data_version} · <a href=${source.doc.licence_url} target="_blank" rel="noopener noreferrer">使用條款</a></p>${areas.map((area) => citations(source, area))}</section>`)}</details>
    <footer class="district-profile-sources">${sources.map(({doc, label}) => html`<p>${label}：<a href=${doc.source_url} target="_blank" rel="noopener noreferrer">${doc.source_zh}</a> · 數據截至 ${doc.updated_at} · 版本 ${doc.data_version}</p>`)}</footer>
  </section>`;
}
