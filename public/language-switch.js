import {isEnglish, languageHref, localHref} from "./locale.js";

// Fixed Framework navigation labels, authored here because Framework escapes config names.
const navigationLabels = {
  "香港數據監測站": "Hong Kong Data Monitor",
  "主題探索": "Explore by topic", "學習路線": "Learning routes", "公共財政": "Public finance",
  "經濟同人口": "Economy and population", "就業同物價": "Employment and prices", "人手數據": "Manually transcribed data", "關於": "About",
  "貨幣與股市": "Money and stock markets", "銀行與認可機構數目": "Banks and authorised institutions", "M1、M2、M3 貨幣供應量": "M1, M2 and M3 money supply",
  "住屋與生活成本": "Housing and living costs", "香港城市觀察": "Hong Kong city explorer", "香港行業・金融與保險": "Hong Kong industries: finance and insurance",
  "十八區人口": "Population across 18 districts", "十八區住戶入息": "Household income across 18 districts", "科技與香港": "Technology and Hong Kong",
  "本地研發總開支": "Gross domestic expenditure on R&D", "住戶上網率": "Household internet access", "香港人點生活": "Life in Hong Kong",
  "公共資源點分": "Sharing public resources", "寫青年預算備忘": "Writing a youth budget memorandum", "政府經常開支": "Government recurrent expenditure",
  "政府收入": "Government revenue", "財政儲備": "Fiscal reserves", "人均本地生產總值": "GDP per capita", "香港人口": "Hong Kong population",
  "四大行業佔 GDP 比重": "Four key industries: share of GDP", "商品進口貨值": "Value of merchandise imports", "商品整體出口貨值": "Value of total merchandise exports",
  "港口貨物吞吐量": "Port cargo throughput", "上市公司數目": "Number of listed companies", "失業率": "Unemployment rate",
  "每月工資中位數": "Median monthly wage", "住戶每月入息中位數": "Median monthly household income", "通脹率": "Inflation rate",
  "九類消費物價變動": "Price changes across nine CPI groups", "私人住宅售價指數": "Private domestic price index", "私人住宅租金指數": "Private domestic rental index",
  "公共經常開支(十個政策組別)": "Public recurrent expenditure: ten policy area groups", "公屋輪候時間": "Public rental housing waiting time",
  "資料來源同授權": "Sources and licences", "私隱": "Privacy"
};

const siteRoot = new URL("./", import.meta.url).href;

function initialiseLanguage() {
  if (document.documentElement.dataset.hkdmLanguageReady === "true") return;
  document.documentElement.dataset.hkdmLanguageReady = "true";
  const english = isEnglish();
  const locale = english ? "en-GB" : "zh-HK";
  const title = document.querySelector('meta[name="hkdm:title-en-GB"]');
  if (english && title?.content) document.title = title.content;

  // Only explicitly marked authored attributes; no translation of arbitrary DOM content.
  if (english) {
    for (const attribute of ["alt", "title", "aria-label", "placeholder", "content"]) {
      for (const element of document.querySelectorAll(`[data-en-${attribute}]`)) {
        element.setAttribute(attribute, element.getAttribute(`data-en-${attribute}`));
      }
    }
    for (const element of document.querySelectorAll("#observablehq-sidebar a, #observablehq-sidebar summary")) {
      if (element.children.length > 0) continue;
      const authored = navigationLabels[element.textContent.trim()];
      if (authored) element.textContent = authored;
    }
  }
  const sidebarToggle = document.querySelector("#observablehq-sidebar-toggle");
  if (sidebarToggle) sidebarToggle.title = english ? "Show or hide navigation" : "顯示或收起導覽";
  const search = document.querySelector("#observablehq-search input");
  if (search) {
    search.placeholder = english ? "Search Hong Kong data" : "搜尋香港數據";
    search.setAttribute("aria-label", search.placeholder);
  }

  const nav = document.createElement("nav");
  nav.className = "hkdm-language-switch";
  nav.setAttribute("aria-label", english ? "Language" : "語言選擇");
  for (const [code, label] of [["zh-HK", "繁體中文"], ["en-GB", "English (UK)"]]) {
    const link = document.createElement("a");
    link.href = languageHref(location.href, code);
    link.textContent = label;
    link.lang = code;
    link.hreflang = code;
    link.dataset.languageChoice = code;
    if (code === locale) link.setAttribute("aria-current", "true");
    nav.appendChild(link);
  }
  document.body.insertBefore(nav, document.body.firstChild);

  function localiseLink(link) {
    if (!link || link.hasAttribute("download") || link.dataset.languageChoice) return;
    const original = link.getAttribute("href");
    const next = localHref(original, {locale, baseUrl: location.href, siteRoot});
    if (next !== original) link.setAttribute("href", next);
  }
  for (const link of document.querySelectorAll("a[href]")) localiseLink(link);
  // Delegation also covers newly rendered charts/cards and search results without an observer.
  function prepareNavigation(event) {
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    if (link.dataset.languageChoice) link.href = languageHref(location.href, link.dataset.languageChoice);
    else localiseLink(link);
  }
  for (const event of ["click", "pointerdown", "contextmenu", "focusin"]) {
    document.addEventListener(event, prepareNavigation, true);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialiseLanguage, {once: true});
else initialiseLanguage();
