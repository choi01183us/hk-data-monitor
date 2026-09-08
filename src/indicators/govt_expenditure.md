---
title: 政府經常開支
keywords: 政府開支 經常開支 公共開支 教育 社會福利 衞生 財政預算 分餅 expenditure budget
---

```js
import { indicatorHeader, indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";
import { learningGuidance } from "../components/learning-guidance.js";

const indicator = await FileAttachment("../data/govt_expenditure.json").json();
```

<!-- 中文標題嘅 slug 會變空字串,anchor 撳唔到,所以自己寫 id。 -->
<h1 id="govt-expenditure">政府經常開支</h1>

呢頁用**政府經常開支**口徑。按[預算案附錄 B 第 I 部(PDF p4)](https://www.budget.gov.hk/2026/chi/pdf/c_appendices_b.pdf#page=4)：
**公共開支 = 政府開支 + 營運基金 + 房屋委員會**。

分餅活動可以睇[公共經常開支十個政策組別](./public_expenditure_policy_groups)。
兩頁口徑不同，唔可以放埋同一張圖，亦唔可以將兩者總額相加。

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
