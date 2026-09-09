---
title: 公共經常開支(按政策組別)
keywords: 公共開支 經常開支 政策組別 分餅 預算案 附錄B 教育 房屋 衞生 保安 expenditure policy area
---

```js
import {t} from "../components/locale.js";
import { indicatorHeader, indicatorAnchors, indicatorNote, manualNotice } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";
import { learningGuidance } from "../components/learning-guidance.js";
import { publicExpenditureViews } from "../components/public-expenditure-views.js";

const indicator = await FileAttachment("../data/public_expenditure_policy_groups.json").json();
const chartViews = publicExpenditureViews(indicator);
```

<!-- 中文標題嘅 slug 會變空字串,anchor 撳唔到,所以自己寫 id。 -->
<h1 id="public-expenditure-policy-groups">公共經常開支(按政策組別)</h1>

呢頁用**公共經常開支**口徑。按[預算案附錄 B 第 I 部(PDF p4)](https://www.budget.gov.hk/2026/chi/pdf/c_appendices_b.pdf#page=4)：
**公共開支 = 政府開支 + 營運基金 + 房屋委員會**。

[政府經常開支四類](./govt_expenditure)只計政府帳目。兩頁唔可以放埋同一張圖，亦唔可以將兩者總額相加。

```js
display(manualNotice(indicator));
display(indicatorHeader(indicator));
display(indicatorAnchors(indicator));
```

<h2 id="chart">邊個範疇加咗最多錢？</h2>

同頁三年分別係實際、修訂預算、預算，唔代表三年都已經花咗嘅錢。
「增減金額」用後一年減前一年，按增加金額由大至小排列；正數係增加，負數係減少。
呢度比較名義金額，未扣除物價變動，唔係 PDF 右方嘅實質變動百分比。
圖上以萬／億顯示，可能經四捨五入；完整年度金額見資料表，增減金額用兩年數值相減。

```js
const selectedView = chartViews.length > 0
  ? view(Inputs.select(chartViews, { label: t("顯示", "Display"), format: (item) => item.label, value: chartViews[0] }))
  : null;
```

```js
// 未填數就唔畫圖 —— 一張空圖同一張錯圖一樣誤導
if (selectedView) display(resize((width) => indicatorChart(selectedView.indicator, width)));
```

<h2 id="total-expenditure-note">引用時分清經常開支同開支總額</h2>

```js
display(indicatorNote(indicator));
display(learningGuidance(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator, {comparison: selectedView?.comparison, period: selectedView?.indicator.chart.period}));
```
