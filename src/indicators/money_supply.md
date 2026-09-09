---
title: 香港貨幣供應量 M1、M2、M3
keywords: M1 M2 M3 貨幣 供應 金管局 存款 現金 金融 股票 市值
---

```js
import { indicatorChart } from "../components/indicator-chart.js";
import { indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { moneyHeader } from "../components/money-header.js";
import { moneyChartView, moneyQuarterAnchors } from "../components/money-view.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";
import { learningGuidance } from "../components/learning-guidance.js";
const indicator = await FileAttachment("../data/money_supply.json").json();
const periods = [...new Set(indicator.series.map((point) => point.period))].sort().reverse();
```

<h1 id="money-supply">香港貨幣供應量 M1、M2、M3</h1>

<p class="lede">現金同存款可以用唔同範圍量度。M1、M2、M3 逐層包含，唔可以加埋。</p>

```js
const selectedQuarter = view(Inputs.select(periods, { label: "讀數季度", value: periods[0] }));
```

```js
display(moneyHeader(indicator, selectedQuarter));
```

呢度係**所有貨幣折合港元、未經季節性調整嘅季末數字**，唔係只計港元存款、季度交易總額，亦唔係月度資料。大字以萬億港元顯示至小數兩位；1 萬億港元 = 1,000,000,000,000 港元，原始金額見下方資料表及引用。

<h2 id="chart">三條線，代表三個包含範圍</h2>

```js
const selectedSeries = view(Inputs.select(["全部", "M1", "M2", "M3"], { label: "顯示數列", value: "全部" }));
```

```js
display(resize((width) => indicatorChart(moneyChartView(indicator, selectedSeries), width)));
```

M2 同 M3 接近時，線會重疊；可以揀單一數列睇清楚。圖表顯示完整歷史，讀數季度只控制上面嘅大字、去年同季比較同下方引用，唔改成另一條歷史。

```js
display(indicatorAnchors({ anchors: moneyQuarterAnchors(indicator, selectedQuarter) }));
display(indicatorNote(indicator));
display(learningGuidance(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator, { period: selectedQuarter }));
```

<h2 id="understand">理解 M1、M2、M3，同股市有咩關係</h2>

- [貨幣與股市](../explore/finance)：用包含圖理解三種定義，分清市值、成交額同集資額。
- [住屋與生活成本](../explore/living-cost)：貨幣供應變動本身唔足以解釋樓價或通脹嘅原因。
- [政府收入](./govt_revenue)：私人現金、存款同政府收入係唔同口徑。
- [青年預算備忘](../learn/budget-memo)：要講措施點樣影響具體群組，唔把 M3 當成可動用公帑。
