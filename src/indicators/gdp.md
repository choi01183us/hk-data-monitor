---
title: 人均本地生產總值
keywords: GDP 本地生產總值 人均 經濟 生產總值 統計處 gdp per capita
---

```js
import { indicatorHeader, indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";
import { learningGuidance } from "../components/learning-guidance.js";

const gdp = await FileAttachment("../data/gdp.json").json();
```

<!-- 中文標題嘅 slug 會變空字串,anchor 撳唔到,所以自己寫 id。 -->
<h1 id="gdp">人均本地生產總值</h1>

```js
display(indicatorHeader(gdp));
display(indicatorAnchors(gdp));
```

<h2 id="chart">歷年變化</h2>

```js
display(resize((width) => indicatorChart(gdp, width)));
display(indicatorNote(gdp));
display(learningGuidance(gdp));
display(dataTable(gdp));
display(sourceFooter(gdp));
```
