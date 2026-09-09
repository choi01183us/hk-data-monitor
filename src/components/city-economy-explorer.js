import {html} from "npm:htl";
import {t} from "./locale.js";
import {cityEconomy} from "./city-dashboard.js";

// 只將已驗證嘅全港指標分組閱讀；唔將唔同單位、年份或財政口徑合併。
const cityTopics = () => [
  {id: "trade", label: t("貿易與航運", "Trade and shipping"), indicators: ["goods_imports", "goods_exports", "port_cargo"], question: t("貨運同貿易變化，會帶來哪些交通、技能與環境需要？", "What transport, skills and environmental needs might arise from changes in cargo transport and trade?"), note: t("進口採用到岸價（CIF），出口採用離岸價（FOB），整體出口包括港產品出口及轉口。港口貨物吞吐量計重量，唔係貿易金額或貨櫃數；進出口亦唔等於政府收入。", "Imports use cost, insurance and freight (CIF) values; exports use free on board (FOB) values. Total exports include domestic exports and re-exports. Port cargo throughput measures weight, not trade value or container numbers. Imports and exports are not government revenue."), href: "../indicators/port_cargo", next: t("查港口貨運完整走勢", "View the full port cargo series")},
  {id: "living", label: t("住屋與物價", "Housing and prices"), indicators: ["private_domestic_price", "private_domestic_rent", "cpi"], question: t("樓價、租金同日常物價升跌，對租戶、業主同不同家庭有咩影響？", "How do changes in property prices, rents and everyday prices affect tenants, owners and different households?"), note: t("住宅售價及租金卡顯示指數水平；通脹卡顯示綜合消費物價指數按年變動（%），唔可以直接比較高低。通脹放慢唔代表物價下跌；樓價指數唔係一個單位嘅售價，整體物價變化亦唔等於每個家庭嘅實際開支。", "The housing price and rent cards show index levels. The inflation card shows the year-on-year change in the Composite Consumer Price Index (%), so their levels cannot be compared directly. Slower inflation does not mean falling prices. A property price index is not the price of a flat, and overall price changes do not measure each household's actual spending."), href: "./living-cost", next: t("探索生活成本與住屋", "Explore living costs and housing")},
  {id: "work", label: t("就業與收入", "Employment and income"), indicators: ["unemployment", "median_wage", "household_income"], question: t("工作機會、個人薪酬同住戶入息，邊一項先答到你關心嘅家庭需要？", "Which measure best addresses the household needs you are investigating: job opportunities, individual wages or household income?"), note: t("失業率、工資中位數同住戶入息中位數量度不同對象。住戶入息唔係個人月薪，中位數唔係平均數；全港走勢亦唔能夠直接當成某一區嘅變化。", "The unemployment rate, median wage and median household income measure different things. Household income is not an individual's monthly wage, and a median is not a mean. Hong Kong-wide trends cannot be treated as changes in a particular district."), href: "./industries", next: t("由行業了解工作與技能", "Explore work and skills through industries")},
  {id: "finance", label: t("金融市場", "Financial markets"), indicators: ["banking_institutions", "hkex_listings", "money_supply"], question: t("銀行、上市市場同貨幣供應，分別點樣連繫儲蓄、融資與就業？", "How do banks, the listed market and money supply connect with saving, financing and employment?"), note: t("每張卡會寫明所顯示嘅分類，入內可查銀行類別、上市公司與市值，以及 M1、M2、M3。貨幣供應分類互相包含；市值、集資額同政府收入係不同概念，唔可以相加。", "Each card identifies its displayed category. Open it to explore banking categories, listed companies and market capitalisation, or M1, M2 and M3. Money supply categories are nested. Market capitalisation, funds raised and government revenue are different concepts and must not be added together."), href: "./finance", next: t("探索港交所、銀行與貨幣", "Explore HKEX, banks and money")},
  {id: "technology", label: t("科技與連繫", "Technology and connections"), indicators: ["rd_expenditure", "household_internet"], question: t("科研投入同上網普及以外，仲需要哪些證據，先知科技有冇改善生活？", "Beyond research spending and internet access, what evidence would show whether technology improves people's lives?"), note: t("全港研發開支包括不同執行機構，唔等於政府科研預算。住戶上網比例唔直接代表個人數碼技能，亦唔能夠證明每個家庭都有合適設備。", "Hong Kong's R&D expenditure covers different performing sectors; it is not the government's research budget. The share of households with internet access does not directly measure individual digital skills or show that every household has suitable equipment."), href: "./technology", next: t("探索科技與公共需要", "Explore technology and public needs")}
];

export function cityEconomyExplorer(indicators) {
  const topics = cityTopics();
  let selected = topics[0].id;
  const body = html`<div class="city-topic-content" aria-live="polite"></div>`;
  const controls = html`<fieldset class="city-topic-controls"><legend>${t("揀一個城市主題", "Choose a city topic")}</legend>${topics.map((topic) => html`<label><input type="radio" name="city-economic-topic" value=${topic.id} checked=${topic.id === selected} onchange=${() => {selected = topic.id; render();}}><span>${topic.label}</span></label>`)}</fieldset>`;
  function render() {
    const topic = topics.find((item) => item.id === selected);
    const docs = topic.indicators.map((id) => indicators.find((doc) => doc.indicator_id === id));
    // 缺少附件係程式錯誤，由存取資料直接 hard fail；唔用假卡或預設值。
    body.replaceChildren(html`<div class="city-topic-intro"><h3>${topic.label}</h3><p>${topic.question}</p><a href=${topic.href}>${topic.next} ↗</a></div>`, cityEconomy(docs), html`<p class="city-economic-note">${topic.note}</p>`);
  }
  render();
  return html`<div class="city-economy-explorer">${controls}${body}</div>`;
}
