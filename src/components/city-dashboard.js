import {html} from "npm:htl";
import {mapViewport} from "./map-viewport.js";
import {hongKongPlaces, placeTypes} from "./hong-kong-places.js";
import {citySnapshotIsOld, filterFlightRecords} from "./city-view.js";
import {indicatorCard} from "./indicator-card.js";

const hkTime = new Intl.DateTimeFormat("zh-HK", {timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"});
const time = (value) => hkTime.format(new Date(value));
const external = (url, label) => html`<a href=${url} target="_blank" rel="noopener noreferrer">${label} <span aria-hidden="true">↗</span></a>`;

function provenance(doc, invalidation) {
  const age = html`<strong class="city-stale">呢份快照已超過更新參考時段，最新狀況請到官方網站查閱。</strong>`;
  const update = () => { age.hidden = !citySnapshotIsOld(doc); };
  update();
  // 只重算裝置時鐘；長開頁面／離線仍可提示資料年齡，無網絡請求。
  const timer = setInterval(update, 60_000);
  invalidation?.then(() => clearInterval(timer));
  return html`<footer class="city-provenance">
    <span>快照擷取：${time(doc.fetched_at)}（香港時間）</span>
    <span>來源更新：${time(doc.updated_at)}</span>
    ${age}
    <span>${external(doc.source_url, doc.source_zh)} · ${external(doc.licence_url, "使用條款")}</span>
  </footer>`;
}

export function cityMap(mapUrl) {
  let selected = hongKongPlaces.find((p) => p.id === "central");
  const mapView = mapViewport({label: "香港商業交通及郊野地圖"});
  const active = new Set(placeTypes.map((t) => t.id));
  const detail = html`<div class="city-place-detail" aria-live="polite"></div>`;
  const status = html`<p class="city-map-status" role="status"></p>`;
  const markers = hongKongPlaces.map((place, index) => html`<button type="button" class="city-marker" data-type=${place.type} data-place=${place.id} data-map-x=${place.x} data-map-y=${place.y} style=${{left: `${place.x / 9}%`, top: `${place.y / 5.6}%`}} aria-label=${place.label} aria-pressed="false" title=${place.label} onclick=${() => select(place)}><span>${index + 1}</span></button>`);
  const choices = hongKongPlaces.map((place, index) => html`<button type="button" class="city-place-choice" data-type=${place.type} data-place=${place.id} aria-pressed="false" onclick=${() => select(place)}><span>${String(index + 1).padStart(2, "0")}</span>${place.label}</button>`);
  const filters = placeTypes.map((type) => html`<label data-type=${type.id}><input type="checkbox" checked onchange=${(event) => {
    event.target.checked ? active.add(type.id) : active.delete(type.id);
    if (selected && !active.has(selected.type)) selected = hongKongPlaces.find((p) => active.has(p.type));
    render();
  }}><span>${type.label}</span></label>`);
  const root = html`<section class="city-panel city-geography" aria-labelledby="city-map-heading">
    <div class="city-panel-heading"><div><span class="monitor-kicker">01 / 城市地圖</span><h2 id="city-map-heading">地點背後，連住哪些需要？</h2></div><span class="monitor-tag">香港</span></div>
    <fieldset class="city-map-filters"><legend>顯示地點類別</legend>${filters}</fieldset>
    ${mapView.element}
    ${status}<div class="city-place-choices" aria-label="選取地點">${choices}</div>${detail}
    <p class="city-map-note">標記採用官方地名定位點，唔代表分區邊界；商業、交通同郊野係教學分類，可以重疊。數據連結均屬全港背景，唔代表該地區數字。</p>
    <footer class="city-provenance"><span>© 香港特別行政區政府地政總署 · 地圖經簡化</span><a href="../about/sources#hong-kong-places">地點來源與定位說明</a></footer>
  </section>`;
  mapView.setContent(html`<div class="city-map-canvas"><img src=${mapUrl} width="900" height="560" alt="香港地理輪廓；可從地圖標記或下方清單選取地點。">${markers}</div>`, html`<span>© 香港特別行政區政府地政總署 · 地圖經簡化；標記只代表定位點。<a href="../about/sources#hong-kong-places">地點來源與定位說明 ↗</a></span>`);
  function select(place) { selected = place; render(); }
  function render() {
    for (const button of [...markers, ...choices]) {
      button.hidden = !active.has(button.dataset.type);
      button.setAttribute("aria-pressed", String(button.dataset.place === selected?.id));
    }
    status.textContent = selected ? `已選：${selected.label} · 可從清單選取鄰近標記` : "未選取類別。勾選上方類別可顯示地點。";
    mapView.setSelection(selected, selected ? `已選地點：${selected.label}` : "請先勾選地點類別，再選取地點。");
    if (!selected) { detail.replaceChildren(); return; }
    const links = {
      business: [["四大行業", "../indicators/four_key_industries"], ["工資", "../indicators/median_wage"], ["科技與香港", "./technology"]],
      transport: [["貨物進口", "../indicators/goods_imports"], ["貨物出口", "../indicators/goods_exports"], ["港口貨運", "../indicators/port_cargo"]],
      countryside: [["人口背景", "../indicators/population"], ["公共資源點分", "../learn/public-finance"]]
    }[selected.type];
    detail.replaceChildren(html`<div><div class="city-place-title"><h3>${selected.label}</h3>${external(selected.source_url, selected.source_zh)}</div><p>${selected.description}</p><p class="city-place-question">${selected.question}</p><nav aria-label="連繫全港資料"><span>全港背景</span>${links.map(([label, href]) => html`<a href=${href}>${label} ↗</a>`)}</nav></div>`);
  }
  render();
  return root;
}

export function cityNews(doc, {invalidation} = {}) {
  return html`<section class="city-panel city-news" aria-labelledby="city-news-heading">
    <div class="city-panel-heading"><div><span class="monitor-kicker">02 / 新聞快照</span><h2 id="city-news-heading">政府新聞公報</h2></div><span class="monitor-tag">定時快照</span></div>
    <p class="city-panel-intro">按發布時間排列。呢度係政府公報，唔涵蓋所有傳媒新聞。</p>
    <ol class="city-headlines">${doc.records.slice(0, 7).map((record) => html`<li><time datetime=${record.published_at}>${time(record.published_at)}</time>${external(record.url, record.title)}</li>`)}</ol>
    <div class="city-live-link">${external(doc.live_url, "查閱今日官方新聞")}</div>${provenance(doc, invalidation)}
  </section>`;
}

export function cityFlights(doc, {invalidation} = {}) {
  let direction = "departure";
  const body = html`<tbody></tbody>`;
  const status = html`<p class="city-flight-summary" role="status"></p>`;
  const search = html`<input type="search" placeholder="例如 CX 或 HND" aria-label="搜尋航班號碼或機場代碼" oninput=${() => render()}>`;
  const choices = [ ["departure", "離港"], ["arrival", "抵港"] ].map(([id, label]) => html`<label><input type="radio" name="city-flight-direction" value=${id} checked=${id === direction} onchange=${() => {direction = id; render();}}><span>${label}</span></label>`);
  const root = html`<section class="city-panel city-flights" aria-labelledby="city-flights-heading">
    <div class="city-panel-heading"><div><span class="monitor-kicker">04 / 航空連繫</span><h2 id="city-flights-heading">香港國際機場 · 客機紀錄</h2></div><span class="monitor-tag">歷史紀錄</span></div>
    <p class="city-panel-intro">原定日期為 <strong>${doc.requested_date}</strong> 嘅客機航班。時間為香港時間；實際升降可能跨日，唔可當成該日實際升降總數。</p>
    <div class="city-flight-controls"><fieldset><legend>航班方向</legend>${choices}</fieldset><label class="city-flight-search"><span>航班 / 機場代碼</span>${search}</label></div>
    ${status}<div class="city-flight-table"><table><thead><tr><th scope="col">原定時間</th><th scope="col">航班號碼（含共用）</th><th scope="col">機場代碼</th><th scope="col">來源狀態</th></tr></thead>${body}</table></div>
    <p class="city-panel-intro">同一列可有多個共用航班號碼；機場欄沿用 IATA 代碼。狀態係擷取當時嘅紀錄，出行前請查官方即時頁。</p>
    <div class="city-live-link">${external(doc.live_url, "開啟機場即時航班查詢")}</div>${provenance(doc, invalidation)}
  </section>`;
  function render() {
    const query = search.value.trim();
    const rows = filterFlightRecords(doc.records, direction, query);
    const shown = rows.slice(0, 10);
    status.textContent = query ? (shown.length ? "搜尋結果：按原定時間顯示首 10 筆以內紀錄。" : "快照中未找到相符紀錄，請核對代碼或到官方頁查詢。") : "按原定時間顯示首 10 筆；可搜尋其他航班或機場代碼。";
    body.replaceChildren(...shown.map((r) => html`<tr><td>${r.time}</td><td>${r.flights.map((f) => f.no).join(" / ")}</td><td>${r.airports.join(" / ")}</td><td>${r.status || "未提供"}</td></tr>`));
  }
  render();
  return root;
}

export function cityEconomy(indicators) {
  return html`<div class="city-economy">${indicators.map((indicator) => indicatorCard(indicator, {href: `../indicators/${indicator.indicator_id}`}))}</div>`;
}
