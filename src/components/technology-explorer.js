import { html } from "npm:htl";
import { indicatorCard } from "./indicator-card.js";
import { technologyTopics, technologySources } from "./technology-topics.js";

// 只切換閱讀主題；六份指標均由頁面本地 FileAttachment 傳入。
// 無 runtime fetch、答案欄位或偏好儲存，亦唔把不同指標相加／合圖。
export function technologyExplorer(indicators) {
  const byId = new Map(indicators.map((indicator) => [indicator.indicator_id, indicator]));
  const content = html`<div class="technology-content"></div>`;
  const status = html`<p class="technology-status" role="status"></p>`;
  const choices = technologyTopics.map((topic, index) => html`<label class="technology-choice">
    <input type="radio" name="technology-topic" value=${topic.id} checked=${index === 0} onchange=${() => show(topic)}>
    <span>${topic.label}</span>
  </label>`);
  const root = html`<section class="technology-explorer" aria-label="連繫科技與香港資料">
    <fieldset class="technology-choices"><legend>揀一個探索主題</legend><div>${choices}</div></fieldset>
    ${status}${content}
  </section>`;

  function linkTo(target) {
    return target.startsWith(".") || target.startsWith("#") ? target : `../indicators/${target}`;
  }
  function show(topic) {
    status.textContent = `目前主題：${topic.label}`;
    const cards = topic.indicators.map((id) => {
      const indicator = byId.get(id);
      // 真缺資料就顯示缺口；唔用另一個指標冒充、亦唔把缺數填零。
      return indicator && indicator.manual_status !== "todo"
        ? indicatorCard(indicator, { href: `../indicators/${id}` })
        : html`<p class="callout">呢項資料暫時未能提供，請先到香港總覽核對資料狀態。</p>`;
    });
    content.replaceChildren(html`<div>
      <div class="technology-focus">
        <span class="monitor-kicker">${topic.tag}</span>
        <h2 id="topic-question">${topic.title}</h2>
        <p>${topic.intro}</p>
      </div>

      <section class="technology-connections" aria-labelledby="connections-heading">
        <div class="technology-panel-heading"><h3 id="connections-heading">資料可以點連繫？</h3><span>閱讀關係 · 唔代表因果</span></div>
        <ol class="connection-grid">${topic.connections.map((item) => html`<li class="connection-node">
          <span class="connection-node__label">${item.label}</span>
          <strong>${item.question}</strong>
          <div>${item.links.map(([label, target]) => html`<a href=${linkTo(target)}>${label} <span aria-hidden="true">↗</span></a>`)}</div>
        </li>`)}</ol>
      </section>

      <div class="technology-evidence-heading"><h3>並排讀數</h3><span>各卡獨立刻度 · 留意各自年份</span></div>
      <div class="technology-evidence">${cards}</div>
      <p class="technology-caveat"><strong>連繫之前，先分清：</strong>${topic.caveat}</p>

      <div class="technology-investigate">
        <section class="technology-resources" aria-labelledby="official-resources">
          <div class="technology-panel-heading"><h3 id="official-resources">接住查官方資料</h3><span>外部網站 · 需要連線</span></div>
          ${topic.sources.map((id) => {
            const source = technologySources[id];
            return html`<article class="technology-resource"><span>${source.institution}</span><a href=${source.url} target="_blank" rel="noopener noreferrer">${source.title} <span aria-hidden="true">↗</span></a><p>${source.detail}</p></article>`;
          })}
          <p class="technology-resource-date">來源入口核對：2026年9月8日。數據日期以各來源標示為準。</p>
        </section>
        <section class="technology-proposal" aria-labelledby="policy-question">
          <div class="technology-panel-heading"><h3 id="policy-question">由問題到預算建議</h3><span>課堂探究方向</span></div>
          <p class="technology-proposal__idea">${topic.proposal}</p>
          <details><summary>仲欠邊啲證據？</summary><p>${topic.missing}</p></details>
          <details><summary>點樣衡量成效？</summary><p>${topic.outcome}</p></details>
          <a class="technology-proposal__next" href="../learn/budget-memo">整理成青年預算備忘 <span aria-hidden="true">↗</span></a>
        </section>
      </div>
    </div>`);
  }
  show(technologyTopics[0]);
  return root;
}
