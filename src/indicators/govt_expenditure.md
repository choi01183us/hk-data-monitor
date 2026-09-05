---
title: 政府經常開支
keywords: 政府開支 經常開支 公共開支 教育 社會福利 衞生 財政預算 分餅 expenditure budget
---

```js
import { indicatorHeader, indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";

const indicator = await FileAttachment("../data/govt_expenditure.json").json();
```

<!-- 中文標題嘅 slug 會變空字串,anchor 撳唔到,所以自己寫 id。 -->
<h1 id="govt-expenditure">政府經常開支</h1>

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
