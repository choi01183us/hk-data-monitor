---
title: 政府收入
keywords: 政府收入 稅收 利得稅 薪俸稅 地價收入 印花稅 財政預算 revenue tax
---

```js
import { indicatorHeader, indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";

const indicator = await FileAttachment("../data/govt_revenue.json").json();
```

<!-- 中文標題嘅 slug 會變空字串,anchor 撳唔到,所以自己寫 id。 -->
<h1 id="govt-revenue">政府收入</h1>

```js
display(indicatorHeader(indicator));
display(indicatorAnchors(indicator));
```

<h2 id="chart">歷年變化</h2>

```js
display(resize((width) => indicatorChart(indicator, width)));
display(indicatorNote(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator));
```
