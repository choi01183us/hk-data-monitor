import { html } from "npm:htl";
import { industryTopics, industrySources, industryRegulators, industryProductTypes } from "./hong-kong-industries.js";

// 純本地閱讀切換；無輸入答案、fetch、行情計算或偏好儲存。
export function industryExplorer() {
  const content = html`<div class="industry-content"></div>`;
  const status = html`<p class="industry-status" role="status"></p>`;
  const choices = industryTopics.map((topic, index) => html`<label class="industry-choice">
    <input type="radio" name="industry-topic" value=${topic.id} checked=${index === 0} onchange=${() => show(topic)}>
    <span>${topic.label}</span><small>${topic.code}</small>
  </label>`);
  const root = html`<section class="industry-explorer" aria-label="認識香港行業">
    <fieldset class="industry-choices"><legend>揀一個行業，由生活開始認識</legend><div>${choices}</div></fieldset>
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
        <div class="industry-panel-heading"><h3 id="industry-regulation-heading">邊個負責邊一部分？</h3><span>機構職能</span></div>
        <div class="industry-regulator-grid">${industryRegulators.map((regulator) => html`<article class="industry-regulator">
          <span>${regulator.code}</span><h4>${regulator.name}</h4><p>${regulator.text}</p>${officialLink(industrySources[regulator.source], "睇官方職能")}
        </article>`)}</div>
        <p class="industry-note">實際分工會按機構同活動而不同。例如銀行做證券業務須向證監會註冊，日常前線監管由金管局負責。${officialLink(industrySources.sfc, "查監管分工")}</p>
      </section>
      <section class="industry-panel industry-products" aria-labelledby="industry-products-heading">
        <div class="industry-panel-heading"><h3 id="industry-products-heading">存款、投資、保險，保障有咩分別？</h3><span>先辨認產品性質</span></div>
        <div class="industry-product-grid">${industryProductTypes.map((product) => html`<article><h4>${product.name}</h4><p>${product.purpose}</p><p class="industry-note">${product.distinction}</p></article>`)}</div>
        <p class="industry-note">「喺銀行買」唔代表係存款；具體保障按產品條款及相關制度。${officialLink(industrySources.depositProtection, "存保會解釋")}</p>
      </section>
      <section class="industry-panel industry-market-reading" aria-labelledby="industry-market-reading">
        <div class="industry-panel-heading"><h3 id="industry-market-reading">學睇市場，先讀原始資料</h3><span>香港交易所官方入口 · 需要連線</span></div>
        <div class="industry-source-grid">${["hkexMarkets", "hkexNews", "ipo"].map(resource)}</div>
        <p class="industry-note">留意公司數目、市值、成交額及集資額各有自己嘅定義。本頁提供閱讀入口，唔提供買賣或保單推薦。</p>
      </section>
    </div>`;
  }
  function show(topic) {
    status.textContent = `目前主題：${topic.label}`;
    content.replaceChildren(html`<div>
      <header class="industry-focus"><span class="monitor-kicker">${topic.tag}</span><h2 id="industry-question">${topic.title}</h2><p>${topic.intro}</p></header>
      <div class="industry-overview">
        <section class="industry-panel"><span class="industry-eyebrow">行業功能</span><h3>主要做啲乜？</h3><p>${topic.does}</p></section>
        <section class="industry-panel"><span class="industry-eyebrow">由身邊開始</span><h3>同市民生活有咩關係？</h3><p>${topic.everyday}</p></section>
      </div>
      <section class="industry-panel industry-process" aria-labelledby="industry-process-heading">
        <div class="industry-panel-heading"><h3 id="industry-process-heading">順住一個流程理解</h3><span>簡化教學例子 · 實際安排按業務而定</span></div>
        <ol class="industry-workflow">${topic.flow.map((step) => html`<li><strong>${step.title}</strong><p>${step.text}</p></li>`)}</ol>
      </section>
      <section class="industry-panel" aria-labelledby="industry-concepts-heading">
        <div class="industry-panel-heading"><h3 id="industry-concepts-heading">先學識呢啲詞</h3><span>連到真實工作</span></div>
        <dl class="industry-concepts">${topic.concepts.map((concept) => html`<div><dt>${concept.term}</dt><dd>${concept.text}</dd></div>`)}</dl>
      </section>
      <div class="industry-career-layout">
        <section class="industry-panel" aria-labelledby="industry-jobs-heading">
          <div class="industry-panel-heading"><h3 id="industry-jobs-heading">行內有邊啲工作？</h3><span>工作例子 · 唔係招聘或薪酬資料</span></div>
          <div class="industry-job-grid">${topic.jobs.map((job) => html`<article><h4>${job.name}</h4><p>${job.task}</p></article>`)}</div>
        </section>
        <section class="industry-panel industry-skills" aria-labelledby="industry-skills-heading">
          <span class="industry-eyebrow">由中學開始練</span><h3 id="industry-skills-heading">可以培養嘅能力</h3>
          <ul>${topic.skills.map((skill) => html`<li>${skill}</li>`)}</ul>
          <p class="industry-note">呢啲係學習方向；個別職務有唔同資格、牌照同經驗要求，須查原有制度。</p>
        </section>
      </div>
      <p class="industry-caveat"><strong>讀數之前，先分清：</strong>${topic.caveat}</p>
      ${topic.financial ? financialSections() : null}
      <div class="industry-inquiry-layout">
        <section class="industry-panel industry-scenario" aria-labelledby="industry-scenario-heading">
          <div class="industry-panel-heading"><h3 id="industry-scenario-heading">如果係你，會先問乜？</h3><span>虛構課堂情境</span></div>
          <p class="industry-scenario-question">${topic.scenario}</p>
          <details><summary>打開討論提示</summary><ul>${topic.prompts.map((prompt) => html`<li>${prompt}</li>`)}</ul></details>
        </section>
        <section class="industry-panel industry-budget" aria-labelledby="industry-budget-heading">
          <span class="industry-eyebrow">連到青年預算備忘</span><h3 id="industry-budget-heading">公帑可以解決邊種需要？</h3>
          <p>${topic.budget}</p><details><summary>要補咩證據同成效指標？</summary><p>${topic.evidence}</p></details>
          <a class="industry-next" href="../learn/budget-memo">整理成有證據嘅建議 <span aria-hidden="true">↗</span></a>
        </section>
      </div>
      <section class="industry-panel industry-related" aria-labelledby="industry-related-heading">
        <div class="industry-panel-heading"><h3 id="industry-related-heading">將行業同香港資料連起來</h3><span>閱讀關係 · 唔代表因果</span></div>
        <p>${topic.statNote}</p><div class="industry-related-links">${topic.related.map(([label, href]) => html`<a href=${href}>${label} <span aria-hidden="true">↗</span></a>`)}</div>
        <p class="industry-note">${officialLink(industrySources.industryDefinitions, "核對官方行業定義（PDF · 需要連線）")}；文章數字有出版日期，最新數字請查站內指標頁。</p>
      </section>
      <section class="industry-panel industry-resources" aria-labelledby="industry-resources-heading">
        <div class="industry-panel-heading"><h3 id="industry-resources-heading">接住查官方資料</h3><span>外部網站 · 需要連線</span></div>
        <div class="industry-source-grid">${topic.sources.map(resource)}</div>
        <p class="industry-source-date">來源入口核對：2026年9月9日；內容日期及制度以原頁為準。本站用自己嘅文字作導讀。</p>
      </section>
    </div>`);
  }
  show(industryTopics[0]);
  return root;
}
