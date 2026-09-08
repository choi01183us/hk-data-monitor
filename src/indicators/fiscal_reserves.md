---
title: 財政儲備
keywords: 財政儲備 儲備 庫務署 政府存款 赤字 盈餘 reserves
---

```js
import { indicatorHeader, indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";
import { learningGuidance } from "../components/learning-guidance.js";

const indicator = await FileAttachment("../data/fiscal_reserves.json").json();
```

<!-- 中文標題嘅 slug 會變空字串,anchor 撳唔到,所以自己寫 id。 -->
<h1 id="fiscal-reserves">財政儲備</h1>

```js
display(indicatorHeader(indicator));
display(indicatorAnchors(indicator));
```

<h2 id="chart">歷年變化</h2>

```js
display(resize((width) => indicatorChart(indicator, width)));
display(indicatorNote(indicator));
display(learningGuidance(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator));
```
