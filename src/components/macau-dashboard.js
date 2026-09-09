import {html, svg} from "npm:htl";
import {mapViewport} from "./map-viewport.js";
import {macauPlaces, macauPlaceSource, macauPlaceTypes} from "./macau-places.js";

const external = (url, label) => html`<a href=${url} target="_blank" rel="noopener noreferrer">${label} ↗</a>`;

export function macauMap(geography) {
  let selected = macauPlaces[0];
  const active = new Set(macauPlaceTypes.map((type) => type.id));
  const map = mapViewport({label: "澳門景點與城市觀察地圖", resetLabel: "澳門全景"});
  const detail = html`<div class="city-place-detail" aria-live="polite"></div>`;
  const search = html`<input type="search" placeholder="例如：路環、大三巴" aria-label="搜尋澳門地點或地域" oninput=${render}>`;
  const markers = macauPlaces.map((place, i) => html`<button type="button" class="city-marker" data-type=${place.type} data-place=${place.id} data-map-x=${place.x} data-map-y=${place.y} style=${{left: `${place.x / 9}%`, top: `${place.y / 5.6}%`}} aria-label=${place.label} aria-pressed="false" onclick=${() => {selected = place; render();}}><span>${i + 1}</span></button>`);
  const choices = macauPlaces.map((place, i) => html`<button type="button" class="city-place-choice" data-type=${place.type} data-place=${place.id} aria-pressed="false" onclick=${() => {selected = place; render();}}><span>${String(i + 1).padStart(2, "0")}</span>${place.label}</button>`);
  const filters = macauPlaceTypes.map((type) => html`<label data-type=${type.id}><input type="checkbox" checked onchange=${(event) => {event.target.checked ? active.add(type.id) : active.delete(type.id); render();}}><span>${type.label}</span></label>`);
  const base = svg`<svg viewBox="0 0 900 560" role="img" aria-label="澳門主要陸地輪廓，北向上；標記對應下方景點清單。">
    <path d=${geography.path} fill-rule="evenodd" fill="#163b40" stroke="#70b9bb" stroke-width="1"></path>
    <g fill="#cce4e8" font-family="sans-serif" font-size="18"><text x="180" y="116">澳門半島</text><text x="612" y="294">氹仔</text><text x="620" y="361">路氹</text><text x="580" y="489">路環</text></g>
    <g stroke="#577d8b" stroke-width="1" fill="none"><path d="M268,112L326,112M548,290L597,290M545,357L605,357M492,485L565,485"></path></g>
    <g fill="#a5b8c8" font-family="sans-serif" font-size="14"><text x="50" y="46">北 N ↑</text><text x="50" y="520">主要陸地定位圖 · 非導航地圖</text></g>
  </svg>`;
  const attribution = () => html`<span>${external(geography.source.attribution_url, geography.source.attribution)} · ODbL · 經裁切及簡化，非官方界線圖。${external("../about/sources#macau-sources", "完整來源與範圍")}</span>`;
  map.setContent(html`<div class="city-map-canvas">${base}${markers}</div>`, attribution());
  const root = html`<section class="city-panel city-geography" aria-labelledby="macau-map-heading">
    <div class="city-panel-heading"><div><span class="monitor-kicker">01 / 澳門地圖</span><h2 id="macau-map-heading">由一個地點，提出一個問題。</h2></div><span class="monitor-tag">MO · 澳門</span></div>
    <label class="macau-map-search"><span>搜尋地點</span>${search}</label>
    <fieldset class="city-map-filters"><legend>顯示地點類別</legend>${filters}</fieldset>
    ${map.element}<div class="city-place-choices" aria-label="澳門地點清單">${choices}</div>${detail}
    <p class="city-map-note">地點採旅遊局網頁定位，唔代表精確入口、地域邊界或人口分布。序號係清單次序，唔係人氣排名。呢幅圖未畫位於橫琴嘅澳門大學及口岸獨立管轄地塊。</p>
    <footer class="city-provenance">${attribution()}<span>地圖取得及地點核對：${macauPlaceSource.verified_at}；唔等於測量日期。</span></footer>
  </section>`;
  function render() {
    const query = search.value.trim().toLocaleLowerCase("zh-HK");
    const visible = macauPlaces.filter((place) => active.has(place.type) && `${place.label} ${place.region}`.toLocaleLowerCase("zh-HK").includes(query));
    if (!visible.includes(selected)) selected = visible[0];
    for (const button of [...markers, ...choices]) {
      button.hidden = !visible.some((place) => place.id === button.dataset.place);
      button.setAttribute("aria-pressed", String(button.dataset.place === selected?.id));
    }
    map.setSelection(selected, selected ? `找到 ${visible.length} 個地點 · 已選：${selected.label}（${selected.region}）` : "冇相符地點。請清除搜尋字或重新勾選類別；只搜尋已收錄的六個地點。");
    if (!selected) {detail.replaceChildren(); return;}
    detail.replaceChildren(html`<div><div class="city-place-title"><h3>${selected.label}</h3>${external(selected.source_url, "旅遊局介紹")}</div><p>${selected.description}</p><p class="city-place-question">${selected.question}</p><nav aria-label="連繫澳門統計"><span>澳門全境背景</span><a href="#macau-data">人口・旅客・經濟 ↗</a><a href="#city-comparison">比較前對口徑 ↗</a></nav></div>`);
  }
  render();
  return root;
}
