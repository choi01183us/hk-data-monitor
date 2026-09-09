import {html} from "npm:htl";
import {t, isEnglish} from "./locale.js";
import {weatherState, weatherTemperature} from "./weather-state.js";

const timeFormats = Object.fromEntries(["zh-HK", "en-GB"].map((locale) => [locale, new Intl.DateTimeFormat(locale, {
  timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
})]));
const time = (value) => Number.isFinite(Date.parse(value)) ? timeFormats[isEnglish() ? "en-GB" : "zh-HK"].format(new Date(value)) : t("未提供", "Not available");
const external = (url, label) => url ? html`<a href=${url} target="_blank" rel="noopener noreferrer">${label} <span aria-hidden="true">↗</span></a>` : null;

/** Render only the supplied local snapshot. The timer reads the device clock. */
export function weatherMap(doc, {mapUrl, invalidation} = {}) {
  if (!mapUrl) throw new TypeError("Weather map requires the caller's local map attachment");
  const caption = html`<strong class="weather-caption"></strong>`;
  const temperatureValue = html`<strong class="weather-temperature-value"></strong>`;
  const temperatureLabel = html`<span class="weather-temperature-label"></span>`;
  const temperatureTime = html`<time class="weather-temperature-time"></time>`;
  const temperature = html`<div class="weather-temperature">${temperatureValue}<span>${temperatureLabel}${temperatureTime}</span></div>`;
  const status = html`<p class="weather-status" role="status"></p>`;
  const nightNote = html`<span class="weather-night-note" hidden>${t("夜景係示意，唔代表實際月相。", "The night scene is illustrative; it does not show the actual lunar phase.")}</span>`;
  const root = html`<section class="weather-demo" id="weather-effects" data-weather-scene="off" aria-label=${t("香港地圖與天文台天氣快照", "Hong Kong map and Observatory weather snapshot")}>
    <div class="weather-report"><div><span class="weather-eyebrow">${t("香港天文台 · 天氣標記", "HONG KONG OBSERVATORY · WEATHER ICONS")}</span>${caption}${temperature}</div><span class="weather-badge">${t("定時快照", "Scheduled snapshot")}</span></div>
    ${status}
    <p class="weather-demo-note">${t("定時快照，唔係每秒實況，亦唔代表香港各區天氣相同。", "A scheduled snapshot, not a second-by-second live view. Weather may differ across Hong Kong.")}${nightNote}</p>
    <p class="weather-reduced-note">${t("已跟隨系統「減少動態效果」設定，顯示靜態效果。", "Showing a still illustration to follow your reduced-motion setting.")}</p>
    <figure class="monitor-map">
      <div class="weather-stage">
        <img src=${mapUrl} width="900" height="560" alt=${t("香港地理輪廓，標示新界、九龍、香港島及大嶼山。", "Outline map of Hong Kong showing the New Territories, Kowloon, Hong Kong Island and Lantau Island.")} fetchpriority="high">
        <div class="weather-art" aria-hidden="true">
          <div class="weather-sun"><div class="weather-sun-core"></div><div class="weather-sun-ring"></div></div>
          <div class="weather-moon"></div><div class="weather-stars"></div>
          <div class="weather-cloud weather-cloud-a"></div><div class="weather-cloud weather-cloud-b"></div><div class="weather-cloud weather-cloud-c"></div>
          <div class="weather-rain">${[5, 11, 18, 24, 30, 36, 43, 49, 55, 61, 68, 74, 80, 86, 92, 98].map((x) => html`<i style=${`--drop-x:${x}%`}></i>`)}</div>
          <div class="weather-fog weather-fog-a"></div><div class="weather-fog weather-fog-b"></div>
        </div>
      </div>
      <figcaption>${t("地圖作地域定位；各指標屬全港統計，唔代表單一地區情況。", "The map provides geographical orientation. Indicators are Hong Kong-wide statistics, not figures for a single district.")}</figcaption>
    </figure>
    <div class="weather-provenance">
      <div class="weather-times"><span>${t("報告更新：", "Report: ")}<time datetime=${doc?.updated_at}>${time(doc?.updated_at)}</time></span><span>${t("標記更新：", "Icon: ")}<time datetime=${doc?.records?.[0]?.icon_updated_at}>${time(doc?.records?.[0]?.icon_updated_at)}</time></span><span>${t("快照擷取：", "Captured: ")}<time datetime=${doc?.fetched_at}>${time(doc?.fetched_at)}</time></span><span>${t("香港時間", "Hong Kong time")}</span></div>
      <div class="weather-source">${external(doc?.source_url, t(doc?.source_zh ?? "香港天文台", "Hong Kong Observatory"))}${external(doc?.live_url, t("查閱最新官方天氣", "Check the latest official weather"))}${external(doc?.licence_url, t("使用條款", "Terms of use"))}</div>
      <span>${t("© 香港特別行政區政府；天文台標記轉為本站示意效果。", "© HKSAR Government. Observatory icons are interpreted as illustrations created by this website.")}</span>
    </div>
  </section>`;
  function update() {
    const state = weatherState(doc);
    const reading = weatherTemperature(doc);
    temperature.dataset.status = reading.status;
    temperatureValue.textContent = reading.value === null ? "—" : `${reading.value}°C`;
    temperatureLabel.textContent = reading.status === "unavailable" ? t("暫未有可用氣溫", "Temperature unavailable") : reading.status === "stale" ? t("上次錄得 · 香港天文台", "Last recorded · Hong Kong Observatory") : t("香港天文台氣溫", "Hong Kong Observatory temperature");
    temperatureTime.hidden = reading.recorded_at === null;
    if (reading.recorded_at) {
      temperatureTime.dateTime = reading.recorded_at;
      temperatureTime.textContent = `${t("量度：", "Observed: ")}${time(reading.recorded_at)}${t("（香港時間）", " (Hong Kong time)")}`;
    } else {
      temperatureTime.removeAttribute("datetime");
      temperatureTime.textContent = "";
    }
    const label = t(state.labels_zh.join(" · "), state.labels_en.join(" · ")) || t("暫未有可用天氣標記", "No weather icon is available");
    const text = state.status === "stale" ? t("快照已過期或裝置時間有偏差，天氣特效已關閉；請查閱官方最新天氣。", "The snapshot is out of date or the device clock differs. Weather effects are off; check the latest official weather.") :
      state.status === "transition" ? t("天氣標記包含轉變；顯示全部標記，暫不播放單一天氣特效。", "The weather icons indicate a change. All labels are shown, without a single-weather illustration.") :
      state.status === "unknown" || state.status === "unavailable" ? t("暫未能確定天氣標記，天氣特效已關閉；請查閱官方最新天氣。", "The weather icon could not be established. Weather effects are off; check the latest official weather.") :
      t("按天文台最新報告的天氣標記。", "Based on the weather icon in the Observatory's latest report.");
    if (caption.textContent !== label) caption.textContent = label;
    if (status.textContent !== text) status.textContent = text;
    if (root.dataset.weatherScene !== state.scene) root.dataset.weatherScene = state.scene;
    root.dataset.weatherStatus = state.status;
    nightNote.hidden = !state.scene.startsWith("night");
  }
  update();
  // Recompute age without fetching data or replacing the artwork, so a minute
  // tick never restarts the single, at-most-four-second introductory animation.
  const timer = setInterval(update, 60_000);
  invalidation?.then(() => clearInterval(timer));
  return root;
}
