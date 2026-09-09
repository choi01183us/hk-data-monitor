import {html} from "npm:htl";
import {industryRegulators, industrySources} from "./hong-kong-industries.js";

// 用本站字體顯示機構名稱，唔描摹官方商標；四個職能仍由同一份導讀資料維護。
const policies = {
  SFC: {url: "https://www.sfc.hk/TC/Quick-links/Others/Disclaimer", label: "參考資料前，請閱讀證監會免責聲明。"},
  IA: {url: "https://www.ia.org.hk/en/legal_information.html", label: "參考資料前，請閱讀保監局法律資料（英文）。"}
};
export function financialInstitutions() {
  return html`<div class="financial-institutions"><div class="institution-grid">${industryRegulators.map((institution) => {
    const source = industrySources[institution.source], policy = policies[institution.code];
    return html`<article class="institution-card" data-institution=${institution.code}>
      <div class="institution-identity"><span class="institution-code">${institution.code}</span><span class="institution-kind">${institution.code === "HKEX" ? "市場營運集團" : institution.code === "HKMA" ? "貨幣與銀行監管" : "法定監管機構"}</span></div>
      <h4>${source.institution}</h4><p>${institution.text}</p>
      <a class="institution-official" href=${source.url} target="_blank" rel="noopener noreferrer">睇${institution.name}官方職能 ↗</a>
      ${policy ? html`<p class="institution-policy"><a href=${policy.url} target="_blank" rel="noopener noreferrer">${policy.label}</a></p>` : null}
    </article>`;
  })}</div><p class="institution-note">本站編寫嘅機構導讀；各機構並無贊助或認可本站。官方入口需要連線。</p></div>`;
}
