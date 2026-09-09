import {html, svg} from "npm:htl";
import {hongKongDistricts, districtGeographySource} from "./hong-kong-districts.js";
import {hongKongAttractions, attractionSource} from "./hong-kong-attractions.js";
import {districtPeriods, districtFrame, rankDistricts, populationRadius, incomeBand} from "./district-view.js";
import {cityMap} from "./city-dashboard.js";
import {formatNumber, formatDateZh} from "./format.js";

const link = (href, label) => html`<a href=${href} target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
const amount = (value, unit) => value === null ? "未提供" : `${formatNumber(value, {digits: 0})} ${unit}`;
const colours = ["#153449", "#28627a", "#429caa", "#81d8c6"];

export function districtExplorer({population, income, mapUrl}) {
  const years = districtPeriods(population, income);
  if (!years.length) return html`<p class="callout">人口與住戶入息未有共同年度，暫時唔可以作地區比較。</p>`;
  let mode = "population", selected = "A", attraction = hongKongAttractions[0]?.id;
  const body = html`<div class="district-content"></div>`;
  const status = html`<p class="district-status" role="status"></p>`;
  const yearSelect = html`<select aria-label="地區比較年份" onchange=${() => render()}>${years.map((year) => html`<option value=${year}>${year} 年</option>`)}</select>`;
  const districtSelect = html`<select aria-label="選擇地區" onchange=${() => {selectDistrict(districtSelect.value);}}>${hongKongDistricts.map((d) => html`<option value=${d.id}>${d.label}</option>`)}</select>`;
  const compare = html`<select aria-label="比較地區" onchange=${() => render()}><option value="">全港參考</option>${hongKongDistricts.map((d) => html`<option value=${d.id}>${d.label}</option>`)}</select>`;
  const toolbar = html`<div class="district-controls"><label>共同年度 ${yearSelect}</label><label>選取地區 ${districtSelect}</label><label>對照 ${compare}</label></div>`;
  const radios = [["population", "人口分布"], ["income", "住戶入息"], ["attractions", "旅遊景點"], ["places", "商業與郊野"]].map(([id, label]) => html`<label><input type="radio" name="district-layer" value=${id} checked=${id === mode} onchange=${() => {mode = id; if (mode === "attractions") selectDistrict(selected); else render();}}><span>${label}</span></label>`);
  const root = html`<section class="city-panel district-explorer" aria-labelledby="district-heading"><div class="city-panel-heading"><div><span class="monitor-kicker">01 / 社區與旅遊</span><h2 id="district-heading">同一座城市，不同生活。</h2></div><span class="monitor-tag">十八區</span></div><fieldset class="district-layers"><legend>揀一個地圖圖層</legend>${radios}</fieldset>${toolbar}${status}${body}</section>`;
  function selectDistrict(id) {selected = id; districtSelect.value = id; if (mode === "attractions" && hongKongAttractions.find((p) => p.id === attraction)?.district_id !== id) attraction = hongKongAttractions.find((p) => p.district_id === id)?.id; render();}
  function render() {
    const active = body.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = active?.getAttribute("data-focus-key");
    toolbar.hidden = mode === "places";
    if (mode === "places") {status.textContent = "商業與郊野代表地點 · 連到全港背景資料"; body.replaceChildren(cityMap(mapUrl)); return;}
    const rankingWasOpen = body.querySelector(".district-ranking")?.open ?? false;
    const frame = districtFrame(population, income, hongKongDistricts, yearSelect.value);
    const current = frame.rows.find((r) => r.id === selected);
    const comparison = frame.rows.find((r) => r.id === compare.value);
    const measure = mode === "income" ? "income" : "population";
    const unit = measure === "income" ? "港元／月" : "人";
    status.textContent = `${frame.period} 年 · 已選 ${current.label} · ${mode === "income" ? "顏色表示住戶每月入息中位數" : mode === "population" ? "圓面積表示陸上非住院人口" : "代表景點連繫所屬地區資料"}`;
    const selectedPlace = hongKongAttractions.find((p) => p.id === attraction);
    const map = svg`<svg viewBox="0 0 900 560" class="district-map-overlay" aria-label=${`${frame.period} 年十八區${mode === "income" ? "住戶入息" : mode === "population" ? "人口" : "景點"}地圖`}>
      ${frame.rows.map((row) => svg`<path d=${row.path} fill-rule="evenodd" data-focus-key=${`area-${row.id}`} fill=${mode === "income" ? (colours[incomeBand(row.income)] ?? "#586876") : "#12303b"} stroke=${row.id === selected ? "#f6c677" : "#6692a1"} stroke-width=${row.id === selected ? 2.6 : 0.8} class="district-area" data-district=${row.id} tabindex="0" role="button" aria-label=${`${row.label}；${amount(row[measure], unit)}`} aria-pressed=${String(row.id === selected)} onclick=${() => selectDistrict(row.id)} onkeydown=${(event) => {if (["Enter", " "].includes(event.key)) {event.preventDefault(); selectDistrict(row.id);}}}><title>${row.label}：${amount(row[measure], unit)}</title></path>`)}
      ${mode === "population" ? frame.rows.filter((row) => row.population !== null).map((row) => svg`<circle class="district-population-dot" cx=${row.x} cy=${row.y} r=${populationRadius(row.population)} fill="#8bdcc5" fill-opacity="0.55" stroke="#c4f6e7" stroke-width="1.2" pointer-events="none"><title>${row.label}：${amount(row.population, "人")}</title></circle>`) : null}
    </svg>`;
    const markers = mode === "attractions" ? hongKongAttractions.map((place, i) => html`<button class="district-attraction-marker" data-focus-key=${`marker-${place.id}`} type="button" style=${{left: `${place.x / 9}%`, top: `${place.y / 5.6}%`}} aria-label=${place.label} aria-pressed=${String(place.id === attraction)} onclick=${() => {attraction = place.id; selectDistrict(place.district_id);}}><span>${i + 1}</span></button>`) : [];
    const ranked = rankDistricts(frame.rows, measure);
    const max = Math.max(...ranked.map((r) => r[measure] ?? 0));
    const context = comparison ?? frame.national;
    body.replaceChildren(html`<div>
      <div class="district-map-wrap"><img class="district-base-map" src=${mapUrl} width="900" height="560" alt="香港地理輪廓">${map}${markers}</div>
      ${mode === "income" ? html`<div class="district-legend"><span>住戶每月入息中位數（港元）</span>${["少於 20,000", "20,000 至少於 30,000", "30,000 至少於 40,000", "40,000 或以上"].map((label, index) => html`<span><i style=${{background: colours[index]}}></i>${label}</span>`)}</div>` : mode === "population" ? html`<div class="district-legend"><span>圓面積代表人數，唔代表人口密度。</span><span>人口口徑：陸上非住院人口</span></div>` : html`<p class="district-legend">金色編號係所選景點，圓點係其他位置；可用下方清單選取。序號唔代表人氣排名。</p>`}
      ${mode === "attractions" ? html`<div class="district-attractions"><div class="district-attraction-choices">${hongKongAttractions.map((p, i) => html`<button type="button" data-attraction=${p.id} data-focus-key=${`place-${p.id}`} aria-pressed=${String(p.id === attraction)} onclick=${() => {attraction = p.id; selectDistrict(p.district_id);}}>${i + 1}. ${p.label}</button>`)}</div>${selectedPlace ? html`<article class="district-attraction-detail"><h3>${selectedPlace.label}</h3><p>${selectedPlace.description}</p><p>${selectedPlace.question}</p><p class="district-location-note">${selectedPlace.location_note}</p><span>${link(selectedPlace.source_url, selectedPlace.source_zh)} · ${hongKongDistricts.find((d) => d.id === selectedPlace.district_id)?.label}</span></article>` : html`<p class="district-attraction-detail">呢區暫時未有加入代表景點。可從上方清單揀另一個景點。</p>`}</div>` : null}
      <section class="district-comparison" aria-label="地區資料對照"><div class="district-comparison-heading"><h3>${current.label}</h3><span>對照：${comparison?.label ?? "全港"}</span></div><div class="district-comparison-grid"><div><span>陸上非住院人口</span><strong>${amount(current.population, "人")}</strong><small>${comparison?.label ?? "全港"}：${amount(context.population, "人")}</small></div><div><span>住戶每月入息中位數</span><strong>${amount(current.income, "港元")}</strong><small>${comparison?.label ?? "全港"}：${amount(context.income, "港元")}</small></div></div><p>入息中位數唔係平均收入、個人月薪或財富；全港中位數直接取自官方，唔係十八區平均。</p></section>
      <details class="district-ranking" open=${rankingWasOpen}><summary>睇十八區${measure === "income" ? "入息" : "人口"}比較及完整數字</summary><div class="district-ranking-list">${ranked.map((row) => html`<button type="button" data-rank-district=${row.id} data-focus-key=${`rank-${row.id}`} aria-pressed=${String(row.id === selected)} onclick=${() => selectDistrict(row.id)}><span>${row.label}</span><span class="district-rank-track" aria-hidden="true"><i style=${{width: `${max && row[measure] !== null ? row[measure] / max * 100 : 0}%`}}></i></span><strong>${amount(row[measure], measure === "income" ? "元" : "人")}</strong></button>`)}</div></details>
      <div class="district-next"><p>同一區內亦有不同生活處境；地區整體背景唔可以代替個別家庭需要，更唔能夠按人口直接推算政府分區開支。</p><a href="../learn/budget-memo">將地區觀察寫成預算問題 ↗</a><a href="./industries">了解行業、金融與保險 ↗</a></div>
      ${population.build?.stale || income.build?.stale ? html`<p class="callout">呢次未能更新部分地區資料，現正顯示已保存版本。引用時請保留以下更新日期。</p>` : null}
      <footer class="city-provenance district-sources"><span>人口：${link(population.source_url, population.source_zh)} · 更新 ${formatDateZh(population.updated_at)} · 千人 × 1,000 → 人</span><span>入息：${link(income.source_url, income.source_zh)} · 更新 ${formatDateZh(income.updated_at)} · 港元</span><span>${link(population.licence_url, "統計資料使用條款")} · ${link(districtGeographySource.source_url, districtGeographySource.source_zh)} · 地圖經裁切及簡化</span><a href="../indicators/district_population">人口資料及引用</a><a href="../indicators/district_household_income">入息資料及引用</a><span>${districtGeographySource.attribution}</span><span>${attractionSource.attribution} · ${link(attractionSource.licence_url, "CSDI 使用條款")}</span><a href="../about/sources#district-sources">地圖與資料口徑</a></footer>
    </div>`);
    if (focusKey) [...body.querySelectorAll("[data-focus-key]")].find((element) => element.getAttribute("data-focus-key") === focusKey)?.focus({preventScroll: true});
  }
  render();
  return root;
}
