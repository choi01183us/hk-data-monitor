import {html} from "npm:htl";
import {t} from "./locale.js";

// 同計劃既有原圖及角色次序；基金標誌與 HKEX 市場營運機構導讀屬不同用途。
// 來源、尺寸及本機審閱範圍：docs/財策新世代品牌.md。
export const programmeLogoGroups = Object.freeze([
  Object.freeze({roleZh: "主辦機構", roleEn: "Organised by", logos: Object.freeze([
    Object.freeze({id: "bgca", zh: "香港小童群益會", en: "The Boys' & Girls' Clubs Association of Hong Kong", width: 329, height: 160})
  ])}),
  Object.freeze({roleZh: "資助機構", roleEn: "Funded by", logos: Object.freeze([
    Object.freeze({id: "hkex", zh: "香港交易所慈善基金", en: "HKEX Foundation", width: 465, height: 160})
  ])}),
  Object.freeze({roleZh: "支持機構", roleEn: "Supported by", logos: Object.freeze([
    Object.freeze({id: "edb", zh: "教育局 商校合作計劃", en: "Education Bureau — Business-School Partnership Programme", width: 366, height: 160}),
    Object.freeze({id: "hkcss", zh: "香港社會服務聯會", en: "The Hong Kong Council of Social Service", width: 223, height: 160})
  ])})
]);

const logoIds = programmeLogoGroups.flatMap((group) => group.logos.map((logo) => logo.id));

function completeLogoKeys(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === logoIds.length
    && logoIds.every((id) => Object.hasOwn(value, id));
}

export function validateProgrammeLogos(logos) {
  if (!completeLogoKeys(logos) || !logoIds.every((id) => typeof logos[id] === "string" && logos[id].trim().length > 0)) {
    throw new Error("Programme branding requires the four supplied logo URLs.");
  }
  return logos;
}

// 對四張圖片逐張記錄狀態；唔可以數三個角色組別當作已載齊四圖。
export function programmeLogoState(states) {
  if (!completeLogoKeys(states) || !logoIds.every((id) => ["pending", "loaded", "failed"].includes(states[id]))) {
    throw new Error("Programme logo state must identify all four images.");
  }
  if (logoIds.some((id) => states[id] === "failed")) return "failed";
  return logoIds.every((id) => states[id] === "loaded") ? "ready" : "pending";
}

export function programmeBrand({logos}) {
  validateProgrammeLogos(logos);
  const states = Object.fromEntries(logoIds.map((id) => [id, "pending"]));
  const status = html`<p class="programme-logo-status" role="status" hidden></p>`;
  const band = html`<div class="programme-logo-band" hidden aria-label=${t("計劃主辦、資助及支持機構", "Programme organiser, funder and supporters")}>
    ${programmeLogoGroups.map((group) => html`<div class="programme-logo-group">
      <div class="programme-logo-role"><span lang="en-GB">${group.roleEn}:</span><span lang="zh-HK">${group.roleZh}：</span></div>
      <div class="programme-logo-row">${group.logos.map((logo) => html`<img data-programme-logo=${logo.id} alt=${t(logo.zh, logo.en)} width=${logo.width} height=${logo.height}>`)}</div>
    </div>`)}
  </div>`;
  const root = html`<section class="programme-brand" data-logo-state="pending" aria-label=${t("財策新世代", "NextGen Financial & Policy Ambassadors")}>
    <div class="programme-identity"><p class="programme-name-zh" lang="zh-HK">財策新世代</p><p class="programme-name-en" lang="en-GB">NextGen Financial &amp; Policy Ambassadors</p></div>
    ${band}${status}
  </section>`;
  function settle(id, state) {
    // 首次失敗後唔因重複 load 事件復原半組，重新 render 才重新載入整組。
    if (states[id] !== "pending") return;
    states[id] = state;
    const current = programmeLogoState(states);
    root.dataset.logoState = current;
    band.hidden = current !== "ready";
    status.hidden = current !== "failed";
    if (current === "failed") status.textContent = t("機構標誌暫時未能顯示。", "The institution logos could not be displayed.");
  }
  for (const img of band.querySelectorAll("img")) {
    const id = img.dataset.programmeLogo;
    img.addEventListener("load", () => settle(id, "loaded"), {once: true});
    img.addEventListener("error", () => settle(id, "failed"), {once: true});
    img.src = logos[id];
    if (img.complete && img.naturalWidth > 0) settle(id, "loaded");
  }
  return root;
}
