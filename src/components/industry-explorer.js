import {t} from "./locale.js";
import { html } from "npm:htl";
import {financialInstitutions} from "./financial-institutions.js";
import { industryTopics, industrySources, industryProductTypes } from "./hong-kong-industries.js";

// 純本地閱讀切換；無輸入答案、fetch、行情計算或偏好儲存。
export function industryExplorer() {
  const content = html`<div class="industry-content"></div>`;
  const status = html`<p class="industry-status" role="status"></p>`;
  const choices = industryTopics.map((topic, index) => html`<label class="industry-choice">
    <input type="radio" name="industry-topic" value=${topic.id} checked=${index === 0} onchange=${() => show(topic)}>
    <span>${topic.label}</span><small>${topic.code}</small>
  </label>`);
  const root = html`<section class="industry-explorer" aria-label="${t("認識香港行業", "Explore Hong Kong's industries")}">
    <fieldset class="industry-choices"><legend>${t("揀一個行業，由生活開始認識", "Choose an industry and start with everyday life")}</legend><div>${choices}</div></fieldset>
    ${status}${content}
  </section>`;

  function officialLink(source, label = source.title) {
    return html`<a href=${source.url} target="_blank" rel="noopener noreferrer">${label} <span aria-hidden="true">↗</span></a>`;
  }
  function resource(id) {
    const source = industrySources[id];
    return html`<article class="industry-resource"><span>${source.institution}</span>${officialLink(source)}<p>${source.detail}</p></article>`;
  }
  function financialSections() {
    return html`<div class="industry-financial-basics">
      <section class="industry-panel industry-regulation" aria-labelledby="industry-regulation-heading">
        <div class="industry-panel-heading"><h3 id="industry-regulation-heading">${t("邊個負責邊一部分？", "Who is responsible for what?")}</h3><span>${t("機構職能", "Institutional roles")}</span></div>
        ${financialInstitutions()}
        <p class="industry-note">${t("實際分工會按機構同活動而不同。例如銀行做證券業務須向證監會註冊，日常前線監管由金管局負責。", "Responsibilities depend on the institution and activity. For example, banks conducting securities business must register with the SFC, while the HKMA carries out their day-to-day frontline supervision. ")}${officialLink(industrySources.sfc, t("查監管分工", "Check regulatory responsibilities"))}</p>
      </section>
      <section class="industry-panel industry-products" aria-labelledby="industry-products-heading">
        <div class="industry-panel-heading"><h3 id="industry-products-heading">${t("存款、投資、保險，保障有咩分別？", "How do protections differ for deposits, investments and insurance?")}</h3><span>${t("先辨認產品性質", "Identify the type of product first")}</span></div>
        <div class="industry-product-grid">${industryProductTypes.map((product) => html`<article><h4>${product.name}</h4><p>${product.purpose}</p><p class="industry-note">${product.distinction}</p></article>`)}</div>
        <p class="industry-note">${t("「喺銀行買」唔代表係存款；具體保障按產品條款及相關制度。", "Buying a product at a bank does not make it a deposit. Protection depends on the product terms and the relevant scheme. ")}${officialLink(industrySources.depositProtection, t("存保會解釋", "Deposit Protection Board guidance"))}</p>
      </section>
      <section class="industry-panel industry-market-reading" aria-labelledby="industry-market-reading">
        <div class="industry-panel-heading"><h3 id="industry-market-reading">${t("學睇市場，先讀原始資料", "Start learning about markets from original sources")}</h3><span>${t("香港交易所官方入口 · 需要連線", "Official HKEX sources · Internet connection required")}</span></div>
        <div class="industry-source-grid">${["hkexMarkets", "hkexNews", "ipo"].map(resource)}</div>
        <p><a href="./finance">${t("M1、M2、M3 與股市市值：用數據理解金融 ↗", "M1, M2, M3 and market capitalisation: understand finance through data ↗")}</a></p>
        <p class="industry-note">${t("留意公司數目、市值、成交額及集資額各有自己嘅定義。本頁提供閱讀入口，唔提供買賣或保單推薦。", "Company numbers, market capitalisation, turnover and funds raised each have distinct definitions. This page provides reading sources, not trading or insurance recommendations.")}</p>
      </section>
    </div>`;
  }
  function show(topic) {
    status.textContent = `${t("目前主題：", "Current topic: ")}${topic.label}`;
    content.replaceChildren(html`<div>
      <header class="industry-focus"><span class="monitor-kicker">${topic.tag}</span><h2 id="industry-question">${topic.title}</h2><p>${topic.intro}</p></header>
      <div class="industry-overview">
        <section class="industry-panel"><span class="industry-eyebrow">${t("行業功能", "Industry functions")}</span><h3>${t("主要做啲乜？", "What does the industry do?")}</h3><p>${topic.does}</p></section>
        <section class="industry-panel"><span class="industry-eyebrow">${t("由身邊開始", "Start with everyday life")}</span><h3>${t("同市民生活有咩關係？", "How does it affect people's lives?")}</h3><p>${topic.everyday}</p></section>
      </div>
      <section class="industry-panel industry-process" aria-labelledby="industry-process-heading">
        <div class="industry-panel-heading"><h3 id="industry-process-heading">${t("順住一個流程理解", "Follow a process")}</h3><span>${t("簡化教學例子 · 實際安排按業務而定", "Simplified teaching example · Arrangements vary by business")}</span></div>
        <ol class="industry-workflow">${topic.flow.map((step) => html`<li><strong>${step.title}</strong><p>${step.text}</p></li>`)}</ol>
      </section>
      <section class="industry-panel" aria-labelledby="industry-concepts-heading">
        <div class="industry-panel-heading"><h3 id="industry-concepts-heading">${t("先學識呢啲詞", "Learn these terms first")}</h3><span>${t("連到真實工作", "Connect with real work")}</span></div>
        <dl class="industry-concepts">${topic.concepts.map((concept) => html`<div><dt>${concept.term}</dt><dd>${concept.text}</dd></div>`)}</dl>
      </section>
      <div class="industry-career-layout">
        <section class="industry-panel" aria-labelledby="industry-jobs-heading">
          <div class="industry-panel-heading"><h3 id="industry-jobs-heading">${t("行內有邊啲工作？", "What kinds of work are involved?")}</h3><span>${t("工作例子 · 唔係招聘或薪酬資料", "Examples of roles · Not vacancies or salary data")}</span></div>
          <div class="industry-job-grid">${topic.jobs.map((job) => html`<article><h4>${job.name}</h4><p>${job.task}</p></article>`)}</div>
        </section>
        <section class="industry-panel industry-skills" aria-labelledby="industry-skills-heading">
          <span class="industry-eyebrow">${t("由中學開始練", "Start practising at secondary school")}</span><h3 id="industry-skills-heading">${t("可以培養嘅能力", "Skills you can develop")}</h3>
          <ul>${topic.skills.map((skill) => html`<li>${skill}</li>`)}</ul>
          <p class="industry-note">${t("呢啲係學習方向；個別職務有唔同資格、牌照同經驗要求，須查原有制度。", "These are learning directions. Qualifications, licences and experience requirements vary by role; check the relevant arrangements.")}</p>
        </section>
      </div>
      <p class="industry-caveat"><strong>${t("讀數之前，先分清：", "Before reading the figures: ")}</strong>${topic.caveat}</p>
      ${topic.financial ? financialSections() : null}
      <div class="industry-inquiry-layout">
        <section class="industry-panel industry-scenario" aria-labelledby="industry-scenario-heading">
          <div class="industry-panel-heading"><h3 id="industry-scenario-heading">${t("如果係你，會先問乜？", "What would you ask first?")}</h3><span>${t("虛構課堂情境", "Fictional classroom scenario")}</span></div>
          <p class="industry-scenario-question">${topic.scenario}</p>
          ${topic.financial ? html`<p><a href="../learn/money-flow">${t("落手做：資金去咗邊？", "Try it: where does the money go?")}</a></p>` : null}
          <details><summary>${t("打開討論提示", "Open discussion prompts")}</summary><ul>${topic.prompts.map((prompt) => html`<li>${prompt}</li>`)}</ul></details>
        </section>
        <section class="industry-panel industry-budget" aria-labelledby="industry-budget-heading">
          <span class="industry-eyebrow">${t("連到青年預算備忘", "Connect to a youth budget memo")}</span><h3 id="industry-budget-heading">${t("公帑可以解決邊種需要？", "Which needs could public funding address?")}</h3>
          <p>${topic.budget}</p><details><summary>${t("要補咩證據同成效指標？", "What evidence and outcome measures are needed?")}</summary><p>${topic.evidence}</p></details>
          <a class="industry-next" href="../learn/budget-memo">${t("整理成有證據嘅建議", "Develop an evidence-based proposal")} <span aria-hidden="true">↗</span></a>
        </section>
      </div>
      <section class="industry-panel industry-related" aria-labelledby="industry-related-heading">
        <div class="industry-panel-heading"><h3 id="industry-related-heading">${t("將行業同香港資料連起來", "Connect industries with Hong Kong data")}</h3><span>${t("閱讀關係 · 唔代表因果", "Explore connections · Not proof of causation")}</span></div>
        <p>${topic.statNote}</p><div class="industry-related-links">${topic.related.map(([label, href]) => html`<a href=${href}>${label} <span aria-hidden="true">↗</span></a>`)}</div>
        <p class="industry-note">${officialLink(industrySources.industryDefinitions, t("核對官方行業定義（PDF · 需要連線）", "Check official industry definitions (PDF · Internet required)"))}${t("；文章數字有出版日期，最新數字請查站內指標頁。", ". Figures in the article have a publication date; use this site's indicator pages for current data.")}</p>
      </section>
      <section class="industry-panel industry-resources" aria-labelledby="industry-resources-heading">
        <div class="industry-panel-heading"><h3 id="industry-resources-heading">${t("接住查官方資料", "Explore official sources next")}</h3><span>${t("外部網站 · 需要連線", "External websites · Internet connection required")}</span></div>
        <div class="industry-source-grid">${topic.sources.map(resource)}</div>
        <p class="industry-source-date">${t("來源入口核對：2026年9月9日；內容日期及制度以原頁為準。本站用自己嘅文字作導讀。", "Source links checked on 9 September 2026. Consult the original pages for dates and current arrangements. This site uses its own wording for the guide.")}</p>
      </section>
    </div>`);
  }
  show(industryTopics[0]);
  return root;
}
