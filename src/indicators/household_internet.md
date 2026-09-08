---
title: 家中有接駁互聯網嘅住戶比例
keywords: 科技 數碼共融 互聯網 上網 住戶 家庭 網絡 設備 數碼鴻溝
---

```js
import { indicatorHeader, indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";
import { learningGuidance } from "../components/learning-guidance.js";

const indicator = await FileAttachment("../data/household_internet.json").json();
```

<h1 id="household-internet">家中有接駁互聯網嘅住戶比例</h1>

```js
display(indicatorHeader(indicator));
display(indicatorAnchors(indicator));
```

<h2 id="chart">家居上網普及程度</h2>

住戶能夠上網，唔代表家中每個人都識用網上服務。討論電子政府、網上學習或醫療服務時，要再問：邊啲人需要設備、費用支援、培訓，或者保留實體服務？

```js
display(resize((width) => indicatorChart(indicator, width)));
display(indicatorNote(indicator));
display(learningGuidance(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator));
```

<h2 id="connections">連住一齊睇</h2>

- [科技與香港](../explore/technology)：由科技發展連到公共服務同數碼共融。
- [住戶入息中位數](./household_income)：思考設備同月費嘅負擔；兩個全港指標不足以判斷低收入住戶嘅上網率。
- [香港人口](./population)：人口變化可能帶來唔同服務需要；此頁冇按年齡拆分上網比例。
- [青年預算備忘](../learn/budget-memo)：為具體受惠群體提出措施，同時列出仍然欠缺嘅證據。
