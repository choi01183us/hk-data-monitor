---
title: 四大行業佔本地生產總值比重
keywords: 四大行業 金融 旅遊 貿易 物流 專業服務 產業結構 統計處 industries
---

```js
import { indicatorHeader, indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";
import { learningGuidance } from "../components/learning-guidance.js";

const indicator = await FileAttachment("../data/four_key_industries.json").json();
```

<!-- 中文標題嘅 slug 會變空字串,anchor 撳唔到,所以自己寫 id。 -->
<h1 id="four-key-industries">四大行業佔本地生產總值比重</h1>

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
