---
title: 本地研發總開支
keywords: 科技 創科 研究 研發 創新 企業 大學 財政預算 研究及發展 R&D GERD
---

```js
import { indicatorHeader, indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";
import { learningGuidance } from "../components/learning-guidance.js";

const indicator = await FileAttachment("../data/rd_expenditure.json").json();
```

<h1 id="rd-expenditure">本地研發總開支</h1>

```js
display(indicatorHeader(indicator));
display(indicatorAnchors(indicator));
```

<h2 id="chart">香港研發投入嘅變化</h2>

呢條線合計企業、大學同政府機構在香港進行嘅研發。寫財政建議時，可以用佢說明香港整體研發投入；提議政府增加撥款，就要另外核對相關計劃嘅預算同資金來源。

```js
display(resize((width) => indicatorChart(indicator, width)));
display(indicatorNote(indicator));
display(learningGuidance(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator));
```

<h2 id="connections">連住一齊睇</h2>

- [科技與香港](../explore/technology)：由研發投入，連到人才培訓同數碼共融。
- [青年失業率](./unemployment)：有研發投入，青年係咪就有合適入行機會？兩條趨勢本身證明唔到因果。
- [四大行業比重](./four_key_industries)：思考科技可點樣支援唔同行業。
- [青年預算備忘](../learn/budget-memo)：將證據、具體措施同成效指標寫成建議。
