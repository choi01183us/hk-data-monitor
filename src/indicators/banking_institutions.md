---
title: 香港銀行與認可機構數目
keywords: 銀行 持牌銀行 有限制牌照銀行 接受存款公司 金管局 分行 認可機構
---

```js
import { financeCountPanel } from "../components/finance-count-panel.js";
import { financeCounts } from "../components/finance-counts.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { indicatorAnchors, indicatorNote, manualNotice } from "../components/indicator-page.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";
import { html } from "npm:htl";
import { learningGuidance } from "../components/learning-guidance.js";
const indicator = await FileAttachment("../data/banking_institutions.json").json();
const counts = financeCounts(indicator, indicator.coverage.end);
```

<h1 id="banking-institutions">香港有幾多間銀行？</h1>

<p class="lede">持牌銀行、有限制牌照銀行同接受存款公司，係三種唔同牌照。數清機構之前，先講清計邊類。</p>

```js
display(manualNotice(indicator));
display(financeCountPanel(indicator, counts.period));
```

本頁係**一個月末嘅人手快照**，唔係每月自動更新，亦未有歷史走勢。原表包括已獲發牌或已註冊但尚未運作嘅機構。要查最新牌照名單，請到[金管局紀錄冊](https://vpr.hkma.gov.hk/chi/regulatory-resources/registers/register-of-ais-and-lros/)。

<h2 id="chart">同一個月末，三種牌照</h2>

```js
display(resize((width) => counts.rows.some((row) => row.value !== null) ? indicatorChart({ ...indicator, chart: { type: "bar", period: counts.period } }, width) : html`<p class="finance-no-data" role="status">呢個月末未有可用數字；缺值唔代表零。</p>`));
display(indicatorAnchors({ anchors: counts.total === null ? [] : [{ id: "composition", text_zh: `三類合共 ${counts.total} 間認可機構`, basis_zh: counts.rows.map((row) => `${row.category} ${row.value}`).join(" + ") + ` = ${counts.total} 間。代表辦事處不包括在內。` }] }));
display(indicatorNote(indicator));
display(learningGuidance(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator));
```

<h2 id="read-more">銀行同金融市場點連起來？</h2>

- [貨幣與股市](../explore/finance#institutions)：比較銀行及上市公司數目，讀 IPO、黃金市場同港交所業務。
- [M1、M2、M3](./money_supply)：銀行存款同貨幣供應量有關，但機構數目唔代表銀行規模。
- [金融與保險行業](../explore/industries)：睇儲蓄、借貸、支付同風險管理點樣服務生活。
