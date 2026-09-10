import {html} from "npm:htl";
import {t} from "./locale.js";
import {moneyFlowCases, moneyRecipients, assessMoneyFlow} from "./money-flow.js";

export function moneyFlowExercise() {
  const cases = moneyFlowCases();
  const content = html`<div class="money-case"></div>`;
  const caseButtons = cases.map((item, index) => html`<button type="button" data-case=${item.id} aria-pressed=${String(index === 0)} onclick=${() => show(item)}><small>0${index + 1}</small>${item.title}</button>`);
  const root = html`<section class="money-exercise" aria-label=${t("資金流向互動練習", "Money-flow practice")}>
    <nav class="money-case-nav" aria-label=${t("選擇情境；切換會清除本題選擇", "Choose a case; switching clears this case's choices")}>${caseButtons}</nav>
    ${content}
    <p class="money-local-note">${t("選擇只留喺本頁記憶體；切換情境、重新載入或轉換語言會清除。唔計排名，唔儲存或傳送答案。", "Choices remain only in this page's memory and clear when you change case, reload or switch language. There are no rankings, saved answers or submissions.")}</p>
  </section>`;

  function show(item) {
    for (const button of caseButtons) button.setAttribute("aria-pressed", String(button.dataset.case === item.id));
    const answers = {recipient: null, responsibility: null};
    const status = html`<p class="money-status" role="status" aria-live="polite"></p>`;
    const feedback = html`<div class="money-feedback" hidden></div>`;
    function options(name, values) {
      return values.map(([value, label]) => html`<label class="money-option"><input type="radio" name=${`money-${name}`} value=${value} onchange=${() => {
        answers[name] = value;
        feedback.hidden = true;
        status.textContent = t("選擇已更新，請再核對。", "Choice updated. Check again when ready.");
      }}><span>${label}</span></label>`);
    }
    function check() {
      const result = assessMoneyFlow(item.id, answers);
      if (!result.complete) {
        status.textContent = t("請先選擇收款者同責任，再核對解說。", "Choose both a recipient and a responsibility before checking.");
        return;
      }
      status.textContent = result.correct ? t("兩項都啱。接住解釋你嘅理由。", "Both are correct. Now explain your reasoning.") : t("仲有概念要釐清。對照下方資金流向，再試一次。", "Some concepts need another look. Follow the flow below, then try again.");
      const recipientLabel = moneyRecipients().find(([id]) => id === item.recipient)[1];
      feedback.replaceChildren(html`<div>
        <div class="money-flow-diagram" aria-label=${t("呢個情境嘅正確資金流向", "Correct money flow for this case")}><span>${item.payer}</span><span aria-hidden="true">→</span><strong>${recipientLabel}</strong></div>
        <p><strong>${t("收款者：", "Recipient: ")}</strong>${result.recipientCorrect ? t("判斷正確。", "Correct.") : item.recipientHint}</p>
        <p><strong>${t("責任與風險：", "Responsibilities and risks: ")}</strong>${item.options.find(([id]) => id === item.responsibility)[1]}</p>
        <p>${item.explanation}</p>
        <div class="money-discuss"><strong>${t("同身邊同學講清楚", "Explain it to a classmate")}</strong><p>${item.question}</p></div>
      </div>`);
      feedback.hidden = false;
    }
    content.replaceChildren(html`<div>
      <header class="money-scenario"><span class="monitor-kicker">${t("虛構情境 · 概念練習", "Fictional case · Concept practice")}</span><h2>${item.title}</h2><p>${item.scenario}</p></header>
      <div class="money-questions">
        <fieldset><legend>${t("1. 呢次款項由邊個取得？", "1. Who receives this payment?")}</legend><p class="money-hint">${t("判斷主要收款者；手續費另外處理。", "Identify the main recipient; charges are considered separately.")}</p>${options("recipient", moneyRecipients())}</fieldset>
        <fieldset><legend>${t("2. 邊句正確交代責任與風險？", "2. Which statement explains the responsibilities and risks?")}</legend>${options("responsibility", item.options)}</fieldset>
      </div>
      <button type="button" class="classroom-button money-check" onclick=${check}>${t("核對資金流向", "Check the money flow")}</button>${status}${feedback}
    </div>`);
  }
  show(cases[0]);
  return root;
}
