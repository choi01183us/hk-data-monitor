import {html, svg} from "npm:htl";
import {t} from "./locale.js";
import {label as displayLabel, indicatorText} from "./display-text.js";
import {cityPlaceEnglish, attractionTypesEnglish} from "../lang/city-en-GB.js";
import {hongKongDistricts, districtGeographySource} from "./hong-kong-districts.js";
import {hongKongAttractions, attractionSource, attractionTypes} from "./hong-kong-attractions.js";
import {districtPeriods, districtFrame, rankDistricts, populationRadius, incomeBand} from "./district-view.js";
import {districtProfile} from "./district-profile.js";
import {mapViewport} from "./map-viewport.js";
import {cityMap} from "./city-dashboard.js";
import {formatNumber, formatDateZh, formatPeriodZh} from "./format.js";

const link = (href, label) => html`<a href=${href} target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
const amount = (value, unit) => value === null ? t("未提供", "Not available") : `${formatNumber(value, {digits: 0})} ${unit}`;
const placeText = (place, field) => t(place[field], cityPlaceEnglish[place.id][field]);
const colours = ["#153449", "#28627a", "#429caa", "#81d8c6"];

export function districtExplorer({population, income, mapUrl, invalidation}) {
  const years = districtPeriods(population, income);
  if (!years.length) return html`<p class="callout">${t("人口與住戶入息未有共同年度，暫時唔可以作地區比較。", "Population and household income have no common year available, so districts cannot currently be compared.")}</p>`;
  let mode = "population", selected = "A", attraction = hongKongAttractions[0]?.id;
  const mapView = mapViewport({label: t("香港十八區地圖", "Map of Hong Kong's 18 districts")});
  const placesMap = cityMap(mapUrl);
  let historyOpen = false, citationsOpen = false;
  const enabledTypes = new Set(attractionTypes.map((type) => type.id));
  const body = html`<div class="district-content"></div>`;
  const status = html`<p class="district-status" role="status"></p>`;
  const yearSelect = html`<select aria-label=${t("地區比較年份", "Year for district comparison")} onchange=${() => {syncBaseline(); render();}}>${years.map((year) => html`<option value=${year}>${formatPeriodZh(year)}</option>`)}</select>`;
  const baseline = html`<select aria-label=${t("變化比較基期", "Baseline year for changes")} onchange=${() => render()}></select>`;
  function syncBaseline() {
    const choices = years.filter((year) => year <= yearSelect.value);
    const previous = baseline.value;
    baseline.replaceChildren(...choices.map((year) => html`<option value=${year}>${formatPeriodZh(year)}</option>`));
    baseline.value = choices.includes(previous) ? previous : (choices[1] ?? choices[0]);
  }
  syncBaseline();
  const districtSelect = html`<select aria-label=${t("選擇地區", "Select a district")} onchange=${() => {selectDistrict(districtSelect.value);}}>${hongKongDistricts.map((d) => html`<option value=${d.id}>${displayLabel(d.label)}</option>`)}</select>`;
  const compare = html`<select aria-label=${t("比較地區", "Comparison district")} onchange=${() => render()}><option value="">${t("全港參考", "Hong Kong reference")}</option>${hongKongDistricts.map((d) => html`<option value=${d.id}>${displayLabel(d.label)}</option>`)}</select>`;
  const toolbar = html`<div class="district-controls"><label>${t("共同年度", "Common year")} ${yearSelect}</label><label>${t("選取地區", "Selected district")} ${districtSelect}</label><label>${t("對照", "Compare with")} ${compare}</label><label>${t("變化基期", "Baseline year")} ${baseline}</label></div>`;
  const radios = [["population", t("人口分布", "Population distribution")], ["income", t("住戶入息", "Household income")], ["attractions", t("旅遊景點", "Visitor attractions")], ["places", t("商業與郊野", "Business and countryside")]].map(([id, label]) => html`<label><input type="radio" name="district-layer" value=${id} checked=${id === mode} onchange=${() => {mode = id; if (mode === "attractions") selectDistrict(selected); else render();}}><span>${label}</span></label>`);
  const search = html`<input type="search" aria-label=${t("搜尋代表景點", "Search selected attractions")} placeholder=${t("景點、地區或關鍵字", "Attraction, district or keyword")} oninput=${() => render()}>`;
  const filters = html`<div class="district-attraction-filters"><label class="district-attraction-search">${t("搜尋景點", "Search attractions")} ${search}</label><fieldset><legend>${t("代表景點分類", "Attraction categories")}</legend>${attractionTypes.map((type) => html`<label><input type="checkbox" value=${type.id} checked onchange=${(event) => {if (event.target.checked) enabledTypes.add(type.id); else enabledTypes.delete(type.id); render();}}>${t(type.label, attractionTypesEnglish[type.id])}</label>`)}</fieldset><button type="button" onclick=${() => {search.value = ""; attractionTypes.forEach((type) => enabledTypes.add(type.id)); filters.querySelectorAll('input[type="checkbox"]').forEach((input) => {input.checked = true;}); render();}}>${t("顯示全部景點", "Show all attractions")}</button></div>`;
  const root = html`<section class="city-panel district-explorer" aria-labelledby="district-heading"><div class="city-panel-heading"><div><span class="monitor-kicker">${t("01 / 社區與旅遊", "01 / COMMUNITIES AND TOURISM")}</span><h2 id="district-heading">${t("同一座城市，不同生活。", "One city, different lives.")}</h2></div><span class="monitor-tag">${t("十八區", "18 districts")}</span></div><fieldset class="district-layers"><legend>${t("揀一個地圖圖層", "Choose a map layer")}</legend>${radios}</fieldset>${toolbar}${filters}${status}${mapView.element}${body}</section>`;
  // 原生 Cmd-P 同頁面按鈕共用；列印後還原摺疊狀態，Observable 撤銷時移除 listener。
  let printedDetails = [];
  function beforePrint() {
    if (printedDetails.length) return;
    printedDetails = [...root.querySelectorAll(".district-report details")].map((element) => ({element, open: element.open}));
    printedDetails.forEach(({element}) => {element.open = true;});
  }
  function afterPrint() {printedDetails.forEach(({element, open}) => {element.open = open;}); printedDetails = [];}
  window.addEventListener("beforeprint", beforePrint);
  window.addEventListener("afterprint", afterPrint);
  invalidation?.then(() => {window.removeEventListener("beforeprint", beforePrint); window.removeEventListener("afterprint", afterPrint);});
  function selectDistrict(id) {selected = id; districtSelect.value = id; if (mode === "attractions" && hongKongAttractions.find((p) => p.id === attraction)?.district_id !== id) attraction = hongKongAttractions.find((p) => p.district_id === id)?.id; render();}
  function render() {
    const active = (body.contains(document.activeElement) || mapView.element.contains(document.activeElement)) ? document.activeElement : null;
    const focusKey = active?.getAttribute("data-focus-key");
    historyOpen = body.querySelector(".district-profile-history")?.open ?? historyOpen;
    citationsOpen = body.querySelector(".district-profile-citations")?.open ?? citationsOpen;
    filters.hidden = mode !== "attractions";
    toolbar.hidden = mode === "places";
    mapView.element.hidden = mode === "places";
    if (mode === "places") {status.textContent = t("商業與郊野代表地點 · 連到全港背景資料", "Selected business and countryside locations · Linked to Hong Kong-wide context"); body.replaceChildren(placesMap); return;}
    const rankingWasOpen = body.querySelector(".district-ranking")?.open ?? false;
    const frame = districtFrame(population, income, hongKongDistricts, yearSelect.value);
    const current = frame.rows.find((r) => r.id === selected);
    const measure = mode === "income" ? "income" : "population";
    const unit = measure === "income" ? t("港元／月", "HK$ per month") : t("人", "people");
    status.textContent = t(`${frame.period} 年 · 已選 ${current.label} · ${mode === "income" ? "顏色表示住戶每月入息中位數" : mode === "population" ? "圓面積表示陸上非住院人口" : "代表景點連繫所屬地區資料"}`, `${frame.period} · Selected: ${displayLabel(current.label)} · ${mode === "income" ? "Colour represents median monthly household income" : mode === "population" ? "Circle area represents land-based non-institutional population" : "Selected attractions connect with their district data"}`);
    const query = search.value.normalize("NFKC").trim().toLocaleLowerCase("zh-HK");
    const visiblePlaces = hongKongAttractions.filter((p) => enabledTypes.has(p.type) && `${p.label} ${p.description} ${cityPlaceEnglish[p.id].label} ${cityPlaceEnglish[p.id].description} ${hongKongDistricts.find((d) => d.id === p.district_id)?.label} ${displayLabel(hongKongDistricts.find((d) => d.id === p.district_id)?.label)}`.normalize("NFKC").toLocaleLowerCase("zh-HK").includes(query));
    if (!visiblePlaces.some((p) => p.id === attraction)) attraction = visiblePlaces.find((p) => p.district_id === selected)?.id;
    const selectedPlace = visiblePlaces.find((p) => p.id === attraction);
    if (mode === "attractions") status.textContent += t(` · 顯示 ${visiblePlaces.length}／${hongKongAttractions.length} 個代表景點`, ` · Showing ${visiblePlaces.length}/${hongKongAttractions.length} selected attractions`);
    const map = svg`<svg viewBox="0 0 900 560" class="district-map-overlay" aria-label=${t(`${frame.period} 年十八區${mode === "income" ? "住戶入息" : mode === "population" ? "人口" : "景點"}地圖`, `${frame.period} · 18-district ${mode === "income" ? "household income" : mode === "population" ? "population" : "attractions"} map`)}>
      ${frame.rows.map((row) => svg`<path d=${row.path} fill-rule="evenodd" data-focus-key=${`area-${row.id}`} fill=${mode === "income" ? (colours[incomeBand(row.income)] ?? "#586876") : "#12303b"} stroke=${row.id === selected ? "#f6c677" : "#6692a1"} stroke-width=${row.id === selected ? 2.6 : 0.8} class="district-area" data-district=${row.id} data-map-x=${row.x} data-map-y=${row.y} tabindex="0" role="button" aria-label=${`${displayLabel(row.label)}；${amount(row[measure], unit)}`} aria-pressed=${String(row.id === selected)} onclick=${() => selectDistrict(row.id)} onkeydown=${(event) => {if (["Enter", " "].includes(event.key)) {event.preventDefault(); selectDistrict(row.id);}}}><title>${displayLabel(row.label)}：${amount(row[measure], unit)}</title></path>`)}
      ${mode === "population" ? frame.rows.filter((row) => row.population !== null).map((row) => svg`<circle class="district-population-dot" cx=${row.x} cy=${row.y} r=${populationRadius(row.population)} fill="#8bdcc5" fill-opacity="0.55" stroke="#c4f6e7" stroke-width="1.2" pointer-events="none"><title>${displayLabel(row.label)}：${amount(row.population, t("人", "people"))}</title></circle>`) : null}
    </svg>`;
    const markers = mode === "attractions" ? visiblePlaces.map((place) => html`<button class="district-attraction-marker" data-focus-key=${`marker-${place.id}`} type="button" data-map-x=${place.x} data-map-y=${place.y} style=${{left: `${place.x / 9}%`, top: `${place.y / 5.6}%`}} aria-label=${placeText(place, "label")} aria-pressed=${String(place.id === attraction)} onclick=${() => {attraction = place.id; selectDistrict(place.district_id);}}><span>${hongKongAttractions.indexOf(place) + 1}</span></button>`) : [];
    const ranked = rankDistricts(frame.rows, measure);
    const max = Math.max(...ranked.map((r) => r[measure] ?? 0));
    const legend = mode === "income" ? html`<div class="district-legend"><span>${t("住戶每月入息中位數（港元）", "Median monthly household income (HK$)")}</span>${[t("少於 20,000", "Below 20,000"), t("20,000 至少於 30,000", "20,000 to below 30,000"), t("30,000 至少於 40,000", "30,000 to below 40,000"), t("40,000 或以上", "40,000 or above")].map((label, index) => html`<span><i style=${{background: colours[index]}}></i>${label}</span>`)}</div>` : mode === "population" ? html`<div class="district-legend"><span>${t("圓面積代表人數，唔代表人口密度。", "Circle area represents population, not population density.")}</span><span>${t("人口口徑：陸上非住院人口", "Population basis: land-based non-institutional population")}</span></div>` : html`<p class="district-legend">${t("金色編號係所選景點，圓點係其他位置；可用下方清單選取。序號唔代表人氣排名。", "The gold number marks the selected attraction; dots mark other locations. Use the list below to select one. Numbers are not popularity rankings.")}</p>`;
    mapView.setContent(html`<div class="district-map-wrap"><img class="district-base-map" src=${mapUrl} width="900" height="560" alt=${t("香港地理輪廓", "Outline map of Hong Kong")}>${map}${markers}</div>`, html`<div>${legend.cloneNode(true)}<span>${formatPeriodZh(frame.period)} · ${t("官方資料", "Official data")}</span><span>${t("人口：", "Population: ")}${link(population.source_url, indicatorText(population, "source_zh"))} · ${t("更新", "Updated")} ${formatDateZh(population.updated_at)}；${t("入息：", "Income: ")}${link(income.source_url, indicatorText(income, "source_zh"))} · ${t("更新", "Updated")} ${formatDateZh(income.updated_at)}</span><span>${t("地圖：", "Map: ")}${link(districtGeographySource.source_url, t(districtGeographySource.source_zh, "Home Affairs Department (district boundaries); Lands Department (land outline)"))} · ${t("© 香港特別行政區政府，經裁切及簡化。", "© HKSAR Government; clipped and simplified.")}</span></div>`);
    mapView.setSelection(mode === "attractions" ? (selectedPlace ?? current) : current, mode === "attractions" && selectedPlace ? t(`已選景點：${selectedPlace.label} · ${current.label}`, `Selected attraction: ${placeText(selectedPlace, "label")} · ${displayLabel(current.label)}`) : `${formatPeriodZh(frame.period)} · ${displayLabel(current.label)} · ${t("人口", "Population")} ${amount(current.population, t("人", "people"))} · ${t("住戶月入中位數", "Median monthly household income")} ${amount(current.income, t("港元", "HK$"))}`);
    const profile = districtProfile({population, income, districts: hongKongDistricts, selectedId: selected, compareId: compare.value, period: frame.period, fromPeriod: baseline.value});
    profile.querySelector(".district-profile-history").open = historyOpen;
    profile.querySelector(".district-profile-citations").open = citationsOpen;
    const print = html`<button class="district-print" type="button" onclick=${() => window.print()}>${t("列印區情簡報", "Print district briefing")}</button>`;
    profile.querySelector(".district-profile-heading").append(print);
    const nearby = hongKongAttractions.filter((p) => p.district_id === selected);
    profile.append(html`<aside class="district-profile-question"><h4>${t("由區情，提出預算問題", "Turn district evidence into budget questions")}</h4><p>${t(`人口與住戶入息變化之下，${current.label}邊啲居民可能需要支援？仲欠哪些證據，先可以提出具體措施？`, `As population and household income change, which residents in ${displayLabel(current.label)} might need support? What further evidence would help you propose specific measures?`)}</p>${nearby.length ? html`<p>${t("本區已收錄代表景點：", "Selected attractions included in this district: ")}${nearby.map((p) => html`<span>${link(p.source_url, placeText(p, "label"))} </span>`)}</p>` : html`<p>${t("本站暫未收錄本區代表景點；唔代表區內冇旅遊或文化設施。", "No selected attractions from this district are included yet. This does not mean the district has no tourism or cultural facilities.")}</p>`}<p>${t("先列受惠對象、建議措施、成本依據同成效指標，再到", "List the intended beneficiaries, proposed measures, cost evidence and outcome indicators, then organise them in the ")}<a href="../learn/budget-memo">${t("青年預算備忘工作紙", "Youth Budget Memo worksheet")}</a>${t("整理。", ".")}</p></aside>`);
    body.replaceChildren(html`<div>
      ${legend}
      ${mode === "attractions" ? html`<div class="district-attractions"><p class="district-filter-result">${visiblePlaces.length ? t(`顯示 ${visiblePlaces.length} 個相符代表景點；清單與地圖同步。`, `Showing ${visiblePlaces.length} matching attractions; the list and map stay in step.`) : t("未收錄相符代表地點；可清除搜尋或重選分類。", "No selected attractions match. Clear the search or choose different categories.")} ${t("十個景點係選錄，唔係完整名錄或人氣排名。", "These ten attractions are a selection, not a complete directory or popularity ranking.")}</p><div class="district-attraction-choices">${visiblePlaces.map((p) => html`<button type="button" data-attraction=${p.id} data-focus-key=${`place-${p.id}`} aria-pressed=${String(p.id === attraction)} onclick=${() => {attraction = p.id; selectDistrict(p.district_id);}}>${hongKongAttractions.indexOf(p) + 1}. ${placeText(p, "label")}</button>`)}</div>${selectedPlace ? html`<article class="district-attraction-detail"><h3>${placeText(selectedPlace, "label")}</h3><p>${placeText(selectedPlace, "description")}</p><p>${placeText(selectedPlace, "question")}</p><p class="district-location-note">${placeText(selectedPlace, "location_note")}</p><span>${link(selectedPlace.source_url, placeText(selectedPlace, "source_zh"))} · ${displayLabel(hongKongDistricts.find((d) => d.id === selectedPlace.district_id)?.label)}</span></article>` : html`<p class="district-attraction-detail">${t("目前篩選未有相符嘅本區代表景點；唔代表區內冇旅遊設施。可從上方清單揀另一個景點。", "No attraction in this district matches the current selection. This does not mean there are no visitor facilities. Choose another attraction from the list above.")}</p>`}</div>` : null}
      ${profile}
      <details class="district-ranking" open=${rankingWasOpen}><summary>${t(`睇十八區${measure === "income" ? "入息" : "人口"}比較及完整數字`, `Compare ${measure === "income" ? "income" : "population"} across all 18 districts and view the full figures`)}</summary><div class="district-ranking-list">${ranked.map((row) => html`<button type="button" data-rank-district=${row.id} data-focus-key=${`rank-${row.id}`} aria-pressed=${String(row.id === selected)} onclick=${() => selectDistrict(row.id)}><span>${displayLabel(row.label)}</span><span class="district-rank-track" aria-hidden="true"><i style=${{width: `${max && row[measure] !== null ? row[measure] / max * 100 : 0}%`}}></i></span><strong>${amount(row[measure], measure === "income" ? t("元", "HK$") : t("人", "people"))}</strong></button>`)}</div></details>
      <div class="district-next"><p>${t("同一區內亦有不同生活處境；地區整體背景唔可以代替個別家庭需要，更唔能夠按人口直接推算政府分區開支。", "People within the same district have different circumstances. District-level context does not replace evidence about individual households, and population cannot be used to infer government spending by district.")}</p><a href="../learn/budget-memo">${t("將地區觀察寫成預算問題 ↗", "Turn district observations into budget questions ↗")}</a><a href="./industries">${t("了解行業、金融與保險 ↗", "Explore industries, finance and insurance ↗")}</a></div>
      ${population.build?.stale || income.build?.stale ? html`<p class="callout">${t("呢次未能更新部分地區資料，現正顯示已保存版本。引用時請保留以下更新日期。", "Some district data could not be refreshed. The saved versions are shown. Keep the update dates below when citing them.")}</p>` : null}
      <footer class="city-provenance district-sources"><span>${t("人口：", "Population: ")}${link(population.source_url, indicatorText(population, "source_zh"))} · ${t("更新", "Updated")} ${formatDateZh(population.updated_at)} · ${t("千人 × 1,000 → 人", "Thousand people × 1,000 → people")}</span><span>${t("入息：", "Income: ")}${link(income.source_url, indicatorText(income, "source_zh"))} · ${t("更新", "Updated")} ${formatDateZh(income.updated_at)} · ${t("港元", "HK$")}</span><span>${link(population.licence_url, t("統計資料使用條款", "Statistical data terms of use"))} · ${link(districtGeographySource.source_url, t(districtGeographySource.source_zh, "Home Affairs Department (district boundaries); Lands Department (land outline)"))} · ${t("地圖經裁切及簡化", "Map clipped and simplified")}</span><a href="../indicators/district_population">${t("人口資料及引用", "Population data and citations")}</a><a href="../indicators/district_household_income">${t("入息資料及引用", "Income data and citations")}</a><span>${t(districtGeographySource.attribution, "© HKSAR Government; Home Affairs Department and Lands Department. Provided through the Common Spatial Data Infrastructure.")}</span><span>${t(attractionSource.attribution, "© HKSAR Government; Lands Department. Location data provided through the Common Spatial Data Infrastructure.")} · ${link(attractionSource.licence_url, t("CSDI 使用條款", "CSDI terms of use"))}</span><a href="../about/sources#district-sources">${t("地圖與資料口徑", "Map and data definitions")}</a></footer>
    </div>`);
    if (focusKey) [...root.querySelectorAll("[data-focus-key]")].find((element) => element.getAttribute("data-focus-key") === focusKey)?.focus({preventScroll: true});
  }
  render();
  return root;
}
