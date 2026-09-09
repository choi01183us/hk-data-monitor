import {html} from "npm:htl";
import {t, isEnglish} from "./locale.js";
import {formatDateZh} from "./format.js";
import {cityPlaceEnglish, cityPlaceTypesEnglish} from "../lang/city-en-GB.js";
import {mapViewport} from "./map-viewport.js";
import {hongKongPlaces, placeTypes} from "./hong-kong-places.js";
import {citySnapshotIsOld, filterFlightRecords} from "./city-view.js";
import {indicatorCard} from "./indicator-card.js";

const hkTime = (locale) => new Intl.DateTimeFormat(locale, {timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"});
const timeFormats = {zh: hkTime("zh-HK"), en: hkTime("en-GB")};
const time = (value) => timeFormats[isEnglish() ? "en" : "zh"].format(new Date(value));
const placeText = (place, field) => t(place[field], cityPlaceEnglish[place.id][field]);
const external = (url, label) => html`<a href=${url} target="_blank" rel="noopener noreferrer">${label} <span aria-hidden="true">↗</span></a>`;

function provenance(doc, invalidation) {
  const age = html`<strong class="city-stale">${t("呢份快照已超過更新參考時段，最新狀況請到官方網站查閱。", "This snapshot is older than the reference update interval. Check the official website for the latest information.")}</strong>`;
  const update = () => { age.hidden = !citySnapshotIsOld(doc); };
  update();
  // 只重算裝置時鐘；長開頁面／離線仍可提示資料年齡，無網絡請求。
  const timer = setInterval(update, 60_000);
  invalidation?.then(() => clearInterval(timer));
  return html`<footer class="city-provenance">
    <span>${t("快照擷取：", "Snapshot captured: ")}${time(doc.fetched_at)}${t("（香港時間）", " (Hong Kong time)")}</span>
    <span>${t("來源更新：", "Source updated: ")}${time(doc.updated_at)}</span>
    ${age}
    <span>${external(doc.source_url, t(doc.source_zh, doc.kind === "news" ? "Information Services Department, HKSAR Government" : "Airport Authority Hong Kong"))} · ${external(doc.licence_url, t("使用條款", "Terms of use"))}</span>
  </footer>`;
}

export function cityMap(mapUrl) {
  let selected = hongKongPlaces.find((p) => p.id === "central");
  const mapView = mapViewport({label: t("香港商業交通及郊野地圖", "Map of Hong Kong business areas, transport and countryside")});
  const active = new Set(placeTypes.map((t) => t.id));
  const detail = html`<div class="city-place-detail" aria-live="polite"></div>`;
  const status = html`<p class="city-map-status" role="status"></p>`;
  const markers = hongKongPlaces.map((place, index) => html`<button type="button" class="city-marker" data-type=${place.type} data-place=${place.id} data-map-x=${place.x} data-map-y=${place.y} style=${{left: `${place.x / 9}%`, top: `${place.y / 5.6}%`}} aria-label=${placeText(place, "label")} aria-pressed="false" title=${placeText(place, "label")} onclick=${() => select(place)}><span>${index + 1}</span></button>`);
  const choices = hongKongPlaces.map((place, index) => html`<button type="button" class="city-place-choice" data-type=${place.type} data-place=${place.id} aria-pressed="false" onclick=${() => select(place)}><span>${String(index + 1).padStart(2, "0")}</span>${placeText(place, "label")}</button>`);
  const filters = placeTypes.map((type) => html`<label data-type=${type.id}><input type="checkbox" checked onchange=${(event) => {
    event.target.checked ? active.add(type.id) : active.delete(type.id);
    if (selected && !active.has(selected.type)) selected = hongKongPlaces.find((p) => active.has(p.type));
    render();
  }}><span>${t(type.label, cityPlaceTypesEnglish[type.id])}</span></label>`);
  const root = html`<section class="city-panel city-geography" aria-labelledby="city-map-heading">
    <div class="city-panel-heading"><div><span class="monitor-kicker">${t("01 / 城市地圖", "01 / CITY MAP")}</span><h2 id="city-map-heading">${t("地點背後，連住哪些需要？", "What needs connect with each place?")}</h2></div><span class="monitor-tag">${t("香港", "Hong Kong")}</span></div>
    <fieldset class="city-map-filters"><legend>${t("顯示地點類別", "Place categories")}</legend>${filters}</fieldset>
    ${mapView.element}
    ${status}<div class="city-place-choices" aria-label=${t("選取地點", "Select a place")}>${choices}</div>${detail}
    <p class="city-map-note">${t("標記採用官方地名定位點，唔代表分區邊界；商業、交通同郊野係教學分類，可以重疊。數據連結均屬全港背景，唔代表該地區數字。", "Markers use official place-name locations, not district boundaries. Business, transport and countryside are teaching categories that may overlap. Linked data provide Hong Kong-wide context, not figures for the selected place.")}</p>
    <footer class="city-provenance"><span>${t("© 香港特別行政區政府地政總署 · 地圖經簡化", "© Lands Department, HKSAR Government · Simplified map")}</span><a href="../about/sources#hong-kong-places">${t("地點來源與定位說明", "Place sources and location notes")}</a></footer>
  </section>`;
  mapView.setContent(html`<div class="city-map-canvas"><img src=${mapUrl} width="900" height="560" alt=${t("香港地理輪廓；可從地圖標記或下方清單選取地點。", "Outline map of Hong Kong. Select a place using a marker or the list below.")}>${markers}</div>`, html`<span>${t("© 香港特別行政區政府地政總署 · 地圖經簡化；標記只代表定位點。", "© Lands Department, HKSAR Government · Simplified map; markers indicate locations only. ")}<a href="../about/sources#hong-kong-places">${t("地點來源與定位說明", "Place sources and location notes")} ↗</a></span>`);
  function select(place) { selected = place; render(); }
  function render() {
    for (const button of [...markers, ...choices]) {
      button.hidden = !active.has(button.dataset.type);
      button.setAttribute("aria-pressed", String(button.dataset.place === selected?.id));
    }
    status.textContent = selected ? t(`已選：${selected.label} · 可從清單選取鄰近標記`, `Selected: ${placeText(selected, "label")} · Use the list to select nearby markers`) : t("未選取類別。勾選上方類別可顯示地點。", "No categories selected. Tick a category above to show places.");
    mapView.setSelection(selected, selected ? t(`已選地點：${selected.label}`, `Selected place: ${placeText(selected, "label")}`) : t("請先勾選地點類別，再選取地點。", "Tick a place category first, then select a place."));
    if (!selected) { detail.replaceChildren(); return; }
    const links = {
      business: [[t("四大行業", "Four key industries"), "../indicators/four_key_industries"], [t("工資", "Wages"), "../indicators/median_wage"], [t("科技與香港", "Technology and Hong Kong"), "./technology"]],
      transport: [[t("貨物進口", "Goods imports"), "../indicators/goods_imports"], [t("貨物出口", "Goods exports"), "../indicators/goods_exports"], [t("港口貨運", "Port cargo"), "../indicators/port_cargo"]],
      countryside: [[t("人口背景", "Population context"), "../indicators/population"], [t("公共資源點分", "Sharing public resources"), "../learn/public-finance"]]
    }[selected.type];
    detail.replaceChildren(html`<div><div class="city-place-title"><h3>${placeText(selected, "label")}</h3>${external(selected.source_url, placeText(selected, "source_zh"))}</div><p>${placeText(selected, "description")}</p><p class="city-place-question">${placeText(selected, "question")}</p><nav aria-label=${t("連繫全港資料", "Related Hong Kong-wide data")}><span>${t("全港背景", "Hong Kong-wide context")}</span>${links.map(([label, href]) => html`<a href=${href}>${label} ↗</a>`)}</nav></div>`);
  }
  render();
  return root;
}

export function cityNews(doc, {invalidation} = {}) {
  return html`<section class="city-panel city-news" aria-labelledby="city-news-heading">
    <div class="city-panel-heading"><div><span class="monitor-kicker">${t("02 / 新聞快照", "02 / NEWS SNAPSHOT")}</span><h2 id="city-news-heading">${t("政府新聞公報", "Government press releases")}</h2></div><span class="monitor-tag">${t("定時快照", "Scheduled snapshot")}</span></div>
    <p class="city-panel-intro">${t("按發布時間排列。呢度係政府公報，唔涵蓋所有傳媒新聞。", "Ordered by publication time. These are government press releases, not a comprehensive news feed.")}</p>
    <p class="city-panel-intro">${t("來源中文原文", "Original Chinese source")}</p>
    <ol class="city-headlines">${doc.records.slice(0, 7).map((record) => html`<li><time datetime=${record.published_at}>${time(record.published_at)}</time><span lang="zh-HK">${external(record.url, record.title)}</span></li>`)}</ol>
    <div class="city-live-link">${external(doc.live_url, t("查閱今日官方新聞", "Read today's official news"))}</div>${provenance(doc, invalidation)}
  </section>`;
}

export function cityFlights(doc, {invalidation} = {}) {
  let direction = "departure";
  const body = html`<tbody></tbody>`;
  const status = html`<p class="city-flight-summary" role="status"></p>`;
  const search = html`<input type="search" placeholder=${t("例如 CX 或 HND", "For example, CX or HND")} aria-label=${t("搜尋航班號碼或機場代碼", "Search flight numbers or airport codes")} oninput=${() => render()}>`;
  const choices = [ ["departure", t("離港", "Departures")], ["arrival", t("抵港", "Arrivals")] ].map(([id, label]) => html`<label><input type="radio" name="city-flight-direction" value=${id} checked=${id === direction} onchange=${() => {direction = id; render();}}><span>${label}</span></label>`);
  const root = html`<section class="city-panel city-flights" aria-labelledby="city-flights-heading">
    <div class="city-panel-heading"><div><span class="monitor-kicker">${t("04 / 航空連繫", "04 / AVIATION LINKS")}</span><h2 id="city-flights-heading">${t("香港國際機場 · 客機紀錄", "Hong Kong International Airport · Passenger flight records")}</h2></div><span class="monitor-tag">${t("歷史紀錄", "Historical records")}</span></div>
    <p class="city-panel-intro">${t("原定日期為 ", "Passenger flights scheduled for ")}<strong>${formatDateZh(doc.requested_date)}</strong>${t(" 嘅客機航班。時間為香港時間；實際升降可能跨日，唔可當成該日實際升降總數。", ". Times are in Hong Kong time. Actual movements may fall on another day, so these records are not the total actual arrivals and departures that day.")}</p>
    <div class="city-flight-controls"><fieldset><legend>${t("航班方向", "Flight direction")}</legend>${choices}</fieldset><label class="city-flight-search"><span>${t("航班 / 機場代碼", "Flight / airport code")}</span>${search}</label></div>
    ${status}<div class="city-flight-table"><table><thead><tr><th scope="col">${t("原定時間", "Scheduled time")}</th><th scope="col">${t("航班號碼（含共用）", "Flight numbers (including codeshares)")}</th><th scope="col">${t("機場代碼", "Airport codes")}</th><th scope="col">${t("來源狀態", "Source status")}</th></tr></thead>${body}</table></div>
    <p class="city-panel-intro">${t("同一列可有多個共用航班號碼；機場欄沿用 IATA 代碼。狀態係擷取當時嘅紀錄，出行前請查官方即時頁。", "One row may contain several codeshare flight numbers. Airports retain their IATA codes. Status is recorded at the time of capture; check the official live page before travelling.")}</p>
    <p class="city-panel-intro">${t("航班狀態：來源中文原文", "Flight status: Original Chinese source")}</p>
    <div class="city-live-link">${external(doc.live_url, t("開啟機場即時航班查詢", "Open live airport flight information"))}</div>${provenance(doc, invalidation)}
  </section>`;
  function render() {
    const query = search.value.trim();
    const rows = filterFlightRecords(doc.records, direction, query);
    const shown = rows.slice(0, 10);
    status.textContent = query ? (shown.length ? t("搜尋結果：按原定時間顯示首 10 筆以內紀錄。", "Search results: up to the first 10 records, ordered by scheduled time.") : t("快照中未找到相符紀錄，請核對代碼或到官方頁查詢。", "No matching records in this snapshot. Check the code or use the official website.")) : t("按原定時間顯示首 10 筆；可搜尋其他航班或機場代碼。", "Showing the first 10 records by scheduled time. Search for another flight or airport code.");
    body.replaceChildren(...shown.map((r) => html`<tr><td>${r.time}</td><td>${r.flights.map((f) => f.no).join(" / ")}</td><td>${r.airports.join(" / ")}</td><td>${r.status ? html`<span lang="zh-HK">${r.status}</span>` : t("未提供", "Not available")}</td></tr>`));
  }
  render();
  return root;
}

export function cityEconomy(indicators) {
  return html`<div class="city-economy">${indicators.map((indicator) => indicatorCard(indicator, {href: `../indicators/${indicator.indicator_id}`}))}</div>`;
}
