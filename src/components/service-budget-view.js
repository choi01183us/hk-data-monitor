import {html} from "npm:htl";
import {t, isEnglish} from "./locale.js";
import {SERVICE_PROGRAMMES, SERVICE_PERIODS, SERVICE_HEADS, SERVICE_TEXT, serviceProgrammePoints} from "./service-programmes.js";
import {anchorVersusYear} from "./anchor.js";
import {indicatorAnchors} from "./indicator-page.js";
import {citationPicker, sourceFooter} from "./source-footer.js";

const topics = [
  {id: "welfare", zh: "社會福利", en: "Social welfare", icon: "◎", start: "170/3", note_zh: "由生活保障，到家庭、長者、康復及青年支援。", note_en: "From income support to services for families, older people, rehabilitation and young people."},
  {id: "education", zh: "教育", en: "Education", icon: "◇", start: "156/4", note_zh: "由幼兒到大學：分清教學、特殊學校、資助與支援。", note_en: "From early years to university: distinguish teaching, special schools, financial assistance and support."},
  {id: "health", zh: "醫療與衞生", en: "Health and healthcare", icon: "+", start: "140/3", note_zh: "由預防疾病、基層醫療，到醫院治療及康復。", note_en: "From disease prevention and primary care to hospital treatment and rehabilitation."},
];
const million = (value) => new Intl.NumberFormat(isEnglish() ? "en-GB" : "zh-HK", {minimumFractionDigits: 1, maximumFractionDigits: 1}).format(value / 1e6);
const signed = (value) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${million(Math.abs(value))}`;
const pdf = (p) => `https://www.budget.gov.hk/2026/${isEnglish() ? "eng" : "chi"}/pdf/${isEnglish() ? "head" : "chead"}${p.head.padStart(3, "0")}.pdf${isEnglish() ? "" : `#page=${p.pdf_page}`}`;
const external = (url, zh, en) => html`<a href=${url} target="_blank" rel="noopener noreferrer">${t(zh, en)} ↗</a>`;
const pointsFor = serviceProgrammePoints;

export function publicServicesExplorer(indicator) {
  let activeTopic = topics[0];
  let selected = SERVICE_PROGRAMMES.find((p) => `${p.head}/${p.programme}` === activeTopic.start);
  const select = html`<select id="service-programme" aria-label=${t("選擇服務綱領", "Choose a service programme")}></select>`;
  const detail = html`<div class="service-detail"></div>`;
  const table = html`<div class="service-table-wrap" tabindex="0" role="region" aria-label=${t("綱領撥款比較表，可橫向捲動", "Programme provision comparison table; scroll horizontally")}></div>`;
  const topicNote = html`<p class="service-topic-note" role="status" aria-live="polite"></p>`;
  const order = html`<select aria-label=${t("表格排序", "Table order")}><option value="source">${t("按總目及綱領次序", "Head and programme order")}</option><option value="change">${t("按增加金額排序", "Largest increase first")}</option></select>`;
  const buttons = topics.map((topic) => {
    const button = html`<button type="button" aria-pressed=${String(topic === activeTopic)}><span aria-hidden="true">${topic.icon}</span><strong>${t(topic.zh, topic.en)}</strong><small>${SERVICE_PROGRAMMES.filter((p) => p.topic === topic.id).length} ${t("個綱領", "programmes")}</small></button>`;
    button.addEventListener("click", () => {
      activeTopic = topic;
      selected = SERVICE_PROGRAMMES.find((p) => `${p.head}/${p.programme}` === topic.start);
      buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(topics[i] === topic)));
      updateTopic();
    });
    return button;
  });
  function updateSelection() {
    const points = pointsFor(indicator, selected);
    const max = Math.max(...points.map((row) => row.value));
    const delta = points[2].value - points[1].value;
    const head = SERVICE_HEADS[selected.head];
    const filtered = {...indicator, series: points, category_order: [selected.category],
      basis_zh: [indicator.basis_zh, selected.scope_zh].filter(Boolean).join("；"),
      basis_en: [indicator.basis_en, selected.scope_en].filter(Boolean).join(" ")};
    const anchor = anchorVersusYear(points, "2025-26", {label: "修訂預算 → 2026–27 預算", labelEn: "revised estimate → 2026–27 estimate"});
    detail.replaceChildren(html`<div class="service-reading">
      <div class="service-reading__intro"><span class="monitor-kicker">${t(head.zh, head.en)} · ${t("總目", "Head")} ${selected.head} / ${t("綱領", "Programme")} ${selected.programme}</span><h3>${t(selected.name_zh, selected.name_en)}</h3><p>${t(selected.description_zh, selected.description_en)}</p><div class="service-amount"><strong>${million(points[2].value)}</strong><span>${t("百萬港元", "HK$ million")}</span></div><p class="service-date">2026–27 · ${t("預算撥款", "Estimated provision")}</p><p class="service-delta">${signed(delta)} ${t("百萬港元，比 2025–26 修訂預算", "HK$ million versus the 2025–26 revised estimate")}</p></div>
      <div class="service-trend"><h4>${t("同一綱領，三年撥款", "One programme, three years")}</h4><div class="service-bars" role="img" aria-label=${points.map((point, i) => `${point.period} ${t(SERVICE_PERIODS[i].status_zh, SERVICE_PERIODS[i].status_en)}: ${million(point.value)} ${t("百萬港元", "HK$ million")}`).join("; ")}>
        ${points.map((point, i) => html`<div class="service-bar-column"><strong>${million(point.value)}</strong><div class="service-bar-track"><div class=${`service-bar service-bar--${i}`} style=${{height: `${max === 0 ? 0 : point.value / max * 100}%`}}></div></div><span>${point.period}</span><small>${t(SERVICE_PERIODS[i].status_zh, SERVICE_PERIODS[i].status_en)}</small></div>`)}
      </div><p class="service-small">${t("零起點 · 百萬港元 · 按當時價格，未扣除通脹", "Zero baseline · HK$ million · Current prices, not adjusted for inflation")}</p></div>
    </div>
    <div class="service-explanation"><div><strong>${t("再搵一塊證據", "Find the next piece of evidence")}</strong><p>${t(selected.needs_zh, selected.needs_en)}</p></div><div><strong>${t("先讀口徑", "Read the scope first")}</strong><p>${t(selected.scope_zh || "按官方綱領範圍列示；各機構的服務對象及職責不同。", selected.scope_en || "Follows the official programme scope; organisations have different responsibilities and eligible service users.")}</p>${external(pdf(selected), `核對原表及服務指標 · PDF p${selected.pdf_page}`, `Official English PDF · Programme ${selected.programme}`)}</div></div>
    ${anchor ? indicatorAnchors({anchors: [anchor]}) : html`<p>${t("基期為零，百分比變動不適用。", "Percentage change is not applicable when the base is zero.")}`}
    <p class="service-small">${t("金額增減 = 2026–27 預算 − 2025–26 修訂預算。比較的是兩種預算狀態；唔係實際開支增長，亦唔代表服務一定改善。", "Amount change = 2026–27 estimate minus 2025–26 revised estimate. This compares two estimate statuses, not growth in actual expenditure or proof of better services.")}</p>
    ${citationPicker(filtered, {period: "2026-27"})}`);
    select.value = selected.category;
    for (const button of table.querySelectorAll("button[data-programme]")) button.setAttribute("aria-pressed", String(button.dataset.programme === selected.category));
  }
  function updateTable() {
    let programmes = SERVICE_PROGRAMMES.filter((p) => p.topic === activeTopic.id);
    if (order.value === "change") programmes = [...programmes].sort((a, b) => {
      const av = pointsFor(indicator, a), bv = pointsFor(indicator, b);
      return (bv[2].value - bv[1].value) - (av[2].value - av[1].value);
    });
    table.replaceChildren(html`<table class="service-table"><caption>${t(activeTopic.zh, activeTopic.en)} · ${t("各綱領財政撥款（百萬港元），不設跨綱領總額", "Programme financial provision (HK$ million); no cross-programme total")}</caption><thead><tr><th scope="col">${t("服務綱領", "Programme")}</th>${SERVICE_PERIODS.map((p) => html`<th scope="col">${p.period}<br><small>${t(p.status_zh, p.status_en)}</small></th>`)}<th scope="col">${t("預算較修訂增減", "Estimate less revised")}</th></tr></thead><tbody>${programmes.map((p) => {
      const values = pointsFor(indicator, p);
      const button = html`<button type="button" data-programme=${p.category} aria-pressed=${String(p === selected)}>${t(p.name_zh, p.name_en)}<small>${t("總目", "Head")} ${p.head} / ${p.programme}</small></button>`;
      button.addEventListener("click", () => { selected = p; updateSelection(); });
      return html`<tr><th scope="row">${button}</th>${values.map((v) => html`<td>${million(v.value)}</td>`)}<td>${signed(values[2].value - values[1].value)}</td></tr>`;
    })}</tbody></table>`);
  }
  function updateTopic() {
    topicNote.textContent = t(activeTopic.note_zh, activeTopic.note_en);
    select.replaceChildren(...SERVICE_PROGRAMMES.filter((p) => p.topic === activeTopic.id).map((p) => html`<option value=${p.category}>${t(p.name_zh, p.name_en)} · ${p.head}/${p.programme}</option>`));
    updateTable(); updateSelection();
  }
  select.addEventListener("change", () => { selected = SERVICE_PROGRAMMES.find((p) => p.category === select.value); updateSelection(); });
  order.addEventListener("change", updateTable);
  updateTopic();
  return html`<section class="service-explorer" aria-labelledby="service-explorer"><div class="living-section-heading"><span class="living-number">01</span><div><span class="monitor-kicker">${t("資源投放", "Resource allocation")}</span><h2 id="service-explorer">${t("一項服務，幾多資源？", "What goes into a service?")}</h2></div></div><div class="service-topics" role="group" aria-label=${t("選擇公共服務主題", "Choose a public service topic")}>${buttons}</div>${topicNote}<label class="service-select-label" for="service-programme">${t("揀一個綱領深入睇", "Explore a programme")} ${select}</label>${detail}<div class="service-table-heading"><h3>${t("同一主題，各項撥款一覽", "All programmes in this topic")}</h3><label>${t("排序", "Order")} ${order}</label></div><p class="service-small">${t("按服務名稱切換上面詳情；增加金額排名唔係需要、重要性或成效排名。", "Select a programme name to change the detail above. Ranking by increase does not rank need, importance or performance.")}</p>${table}</section>`;
}

function evidenceLinks() {
  const blocks = [
    ["社會福利：需要同輪候", "Welfare: need and waiting", "個案、受助人數、服務名額同輪候時間係四種唔同量度；先核對對象及日期。", "Cases, recipients, places and waiting times measure different things; check populations and dates.", [
      ["https://data.gov.hk/tc-data/dataset/hk-swd-ssb-ss-stat-fig", "綜援及公共福利金分類個案", "CSSA and Social Security Allowance cases"],
      ["https://data.gov.hk/tc-data/dataset/hk-swd-elderly-statistics-on-waiting-list-and-waiting-time-for-ccs", "長者社區照顧輪候及輪候時間", "Community care waiting lists and times"],
      ["https://data.gov.hk/tc-data/dataset/hk-swd-elderly-statistics-on-waiting-list-rcs", "資助安老院舍輪候", "Subsidised residential care waiting lists"],
      ["https://www.budget.gov.hk/2026/chi/pdf/chead170.pdf#page=7", "安老、康復及青年服務名額與指標", "Older people, rehabilitation and youth service indicators"],
    ]],
    ["教育：學額同支援", "Education: places and support", "學年唔係財政年度；特殊學校亦唔等於全部 SEN 支援。學生人數、師生比例同班級人數不可互換。", "Academic years differ from financial years. Special schools are not all SEN support; pupil counts, pupil–teacher ratios and class sizes differ.", [
      ["https://www.budget.gov.hk/2026/chi/pdf/chead156.pdf#page=2", "幼兒、小學及中學學生與教師", "Pupils and teachers across school stages"],
      ["https://www.budget.gov.hk/2026/chi/pdf/chead156.pdf#page=6", "特殊學校學生及支援", "Special school pupils and support"],
      ["https://www.budget.gov.hk/2026/chi/pdf/chead173.pdf#page=2", "學生資助申請及處理目標", "Student assistance applications and processing targets"],
      ["https://www.budget.gov.hk/2026/chi/pdf/chead190.pdf#page=2", "大學學額及服務指標", "University places and service indicators"],
    ]],
    ["醫療：可及性同成效", "Health: access and outcomes", "門診人次唔係病人人數；單位成本唔係病人收費。比較輪候及服務量，要查專科、緊急程度與轉移服務註腳。", "Attendances are not distinct patients, and unit costs are not patient charges. Check specialties, urgency and service-transfer notes when comparing waiting times and activity.", [
      ["https://www.budget.gov.hk/2026/chi/pdf/chead140.pdf#page=4", "醫管局病床、服務量與成效指標", "HA beds, activity and outcome indicators"],
      ["https://www.budget.gov.hk/2026/chi/pdf/chead037.pdf#page=4", "疾病預防、母嬰及學生健康", "Disease prevention, maternal, child and student health"],
      ["https://www.budget.gov.hk/2026/chi/pdf/chead037.pdf#page=8", "兒童評估及康復服務", "Child assessment and rehabilitation"],
    ]],
  ];
  return html`<section class="living-section" aria-labelledby="service-needs"><div class="living-section-heading"><span class="living-number">02</span><div><span class="monitor-kicker">${t("由開支到成效", "From spending to outcomes")}</span><h2 id="service-needs">${t("錢增加，服務有冇改善？", "Does more funding improve services?")}</h2></div></div><p>${t("以下係官方資料入口，需要連線。用嚟補服務需要及成效證據；本頁冇將未接入的服務數字當成零。", "These official links require a connection. Use them to find evidence of needs and outcomes; service figures not yet included here are not treated as zero.")}</p><div class="service-evidence-grid">${blocks.map(([zh, en, note, noteEn, links]) => html`<article><h3>${t(zh, en)}</h3><p>${t(note, noteEn)}</p><ul>${links.map(([url, z, e]) => html`<li>${external(isEnglish() && url.includes("/chi/pdf/chead") ? url.replace("/chi/pdf/chead", "/eng/pdf/head").replace(/#page=\d+$/, "") : url, z, e)}</li>`)}</ul></article>`)}</div>
  <details class="living-explain"><summary>${t("社會保障入面有啲咩？", "What sits within social security?")}</summary><p>${t("社署「社會保障」綱領包括綜援及公共福利金等支援。公共福利金包括高齡津貼、長者生活津貼及傷殘津貼等；綱領金額唔係任何一項津貼的獨立開支。", "The SWD Social Security programme includes CSSA and social security allowances. These include Old Age Allowance, Old Age Living Allowance and Disability Allowance; the programme figure is not the separate cost of any one benefit.")}</p><ul><li>${external("https://www.swd.gov.hk/tc/pubsvc/socsecu/comprehens/cssa/", "綜合社會保障援助（綜援）", "Comprehensive Social Security Assistance (CSSA)")}</li><li>${external("https://www.swd.gov.hk/tc/pubsvc/socsecu/ssallowance/", "公共福利金：長者及傷殘支援", "Social Security Allowance: old age and disability support")}</li><li>${external("https://www.swd.gov.hk/tc/pubsvc/socsecu/emergencyr/", "緊急救濟", "Emergency relief")}</li></ul><p>${t("在職家庭津貼另列職學處總目 173 綱領 2。下層計劃已包含在上層綱領時，唔可以再加一次。", "Working Family Allowance is listed separately under Head 173, Programme 2. A scheme included in a parent programme must not be counted again.")}</p></details></section>`;
}

export function publicServicesPage(indicator) {
  const context = [
    ["01", "邊啲人需要支援？", "Who needs support?", "人口、十八區住戶入息、失業與照顧需要。收入中位數唔能夠直接辨認所有貧困家庭。", "Population, district household income, unemployment and care needs. Median income does not identify every household in poverty.", "./city", "人口與入息地圖", "Population and income map"],
    ["02", "實際購買力有冇變？", "Has purchasing power changed?", "食品、交通、租金及工資。名義撥款增加，未必代表能買到更多相同服務。", "Food, transport, rent and wages. A rise in nominal provision does not necessarily buy more of the same service.", "./living-cost", "住屋與生活成本", "Housing and living costs"],
    ["03", "資源從哪裏來？", "Where will funding come from?", "政府收入、財政儲備，以及經濟與收入預測。儲備係某一刻的存量，收入係一段時間的流量，唔直接相加當年度收入。", "Revenue, fiscal reserves, and economic and revenue forecasts. Reserves are a stock at a date and revenue is a flow over a period; do not add them as annual revenue.", "../learn/public-finance", "公共資源點分", "Allocating public resources"],
  ];
  return html`<div class="monitor-home service-page"><header class="monitor-header"><div class="monitor-brand"><span class="monitor-brand__mark" aria-hidden="true">HK</span><div><span class="monitor-kicker">${t("由生活需要，到財政選擇", "From daily needs to fiscal choices")}</span><h1 id="public-services">${t("公共服務與預算", "Public services and the Budget")}</h1></div></div><nav class="monitor-nav" aria-label=${t("公共服務導覽", "Public services navigation")}><a href="../">${t("香港總覽", "Hong Kong overview")}</a><a href="./living-cost">${t("生活成本", "Living costs")}</a><a href="./city">${t("城市觀察", "City explorer")}</a><a class="monitor-nav__primary" href="../learn/budget-memo">${t("寫青年預算備忘", "Write a youth budget memo")} ↗</a></nav></header>
  <section class="service-hero"><div><span class="monitor-kicker">${t("社會福利 / 教育 / 醫療", "Welfare / Education / Health")}</span><h2>${t("一筆預算，", "Behind every allocation,")}<br>${t("照顧邊一種需要？", "whose needs are met?")}</h2><p>${t("由安老、家庭支援，到學校同醫院。先睇每項服務獲編配幾多，再查需要、覆蓋與成效，寫出有根據的建議。", "From care for older people and families to schools and hospitals: examine provision, then need, coverage and outcomes to develop an evidence-based proposal.")}</p><div class="living-jump"><a href="#service-explorer">${t("睇各項撥款", "Explore provision")} ↓</a><a href="#service-needs">${t("搵需要與成效證據", "Find needs and outcomes")} ↓</a></div></div><aside class="service-edition"><span class="monitor-kicker">${t("財政預算案 · 定期快照", "Budget · Periodic snapshot")}</span><strong>2026–27</strong><p>${t("預算版 · 2026 年 2 月 25 日公布", "Budget edition · Published 25 February 2026")}</p><dl><div><dt>${SERVICE_PROGRAMMES.length}</dt><dd>${t("服務綱領", "programmes")}</dd></div><div><dt>${Object.keys(SERVICE_HEADS).length}</dt><dd>${t("開支總目", "heads")}</dd></div><div><dt>${SERVICE_PERIODS.length}</dt><dd>${t("財政年度", "financial years")}</dd></div></dl></aside></section>
  <div class="service-scope"><strong>${t("呢頁係「綱領財政撥款」", "This page shows programme financial provision")}</strong><p>${t("包括部分非經常及非經營開支，唔係全港三大政策範疇的經常開支總額。三個主題係閱讀分類；圖表只比較同一綱領的三年，唔跨綱領相加。", "Includes some non-recurrent and non-operating expenditure; not territory-wide recurrent totals for the three policy areas. Topics are for navigation. Charts compare one programme over three years, with no cross-programme summation.")}</p></div>
  ${indicator.build?.stale ? html`<p role="status">${t("上次取得資料失敗，顯示已儲存的預算快照。", "The latest retrieval failed; showing the saved Budget snapshot.")}</p>` : null}
  ${publicServicesExplorer(indicator)}${evidenceLinks()}
  <section class="living-section" aria-labelledby="budget-context"><div class="living-section-heading"><span class="living-number">03</span><div><span class="monitor-kicker">${t("編預算的另一半", "The other half of budgeting")}</span><h2 id="budget-context">${t("政府仲需要知道甚麼？", "What else does government need to know?")}</h2></div></div><div class="service-evidence-grid">${context.map(([n,z,e,dz,de,url,lz,le]) => html`<article><span class="monitor-kicker">${n}</span><h3>${t(z,e)}</h3><p>${t(dz,de)}</p><a href=${url}>${t(lz,le)} ↗</a></article>`)}</div><p class="service-small">${t("再核對中期預測、債務與利息、工程承擔及新增措施的持續成本；今年有錢做，唔代表未來每年都負擔得到。", "Also examine medium-term forecasts, debt and interest, capital commitments and ongoing costs of new measures. Affordability this year does not guarantee affordability every year.")} ${external("https://www.budget.gov.hk/2026/chi/estimates.html", "預算案官方預算文件", "Official Budget estimates")}</p></section>
  <section class="living-memo"><span class="monitor-kicker">${t("由讀數到建議", "From reading figures to a proposal")}</span><h2>${t("寫「增撥」之前，講清楚要改變甚麼。", "Before asking for more, define what should change.")}</h2><div class="living-memo-grid"><div><h3>${t("一個對象", "One group")}</h3><p>${t("誰有未被滿足的需要？用需求數據及來源支持。", "Whose needs are unmet? Support the claim with demand evidence and sources.")}</p></div><div><h3>${t("一項安排", "One intervention")}</h3><p>${t("增加名額、人手、津貼，抑或改服務流程？說明資源來源與取捨。", "More places, staff or allowances, or a different process? Explain funding and trade-offs.")}</p></div><div><h3>${t("一個可檢視的結果", "One testable outcome")}</h3><p>${t("改善哪個指標、何時檢討？撥款多咗本身唔係成效。", "Which indicator should improve, and when will it be reviewed? More funding is not itself an outcome.")}</p></div></div><a href="../learn/budget-memo">${t("打開青年預算備忘工作紙", "Open the youth budget memo worksheet")} ↗</a></section>
  <details class="living-explain"><summary>${t("完整口徑與原始數列", "Full scope and underlying series")}</summary><p>${t(SERVICE_TEXT.notes_zh, SERVICE_TEXT.notes_en)}</p><a href="../indicators/service_programme_provision">${t("開完整資料表及來源", "Open the full data table and sources")} ↗</a></details>
  ${sourceFooter(indicator, {period: "2026-27"})}<p class="site-assurances">${t("官方預算定期快照 · 完成快取後可離線使用 · 外部官方入口需要連線", "Official Budget snapshots · Available offline once cached · External official links require a connection")}</p></div>`;
}
