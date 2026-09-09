---
title: 港口貨物吞吐量
keywords: 港口 航運 河運 物流 貨物 吞吐量 貿易
---

```js
import { indicatorHeader, indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";
import { learningGuidance } from "../components/learning-guidance.js";

const indicator = await FileAttachment("../data/port_cargo.json").json();
```

<h1 id="port-cargo">港口貨物吞吐量</h1>

```js
display(indicatorHeader(indicator));
display(indicatorAnchors(indicator));
```

<h2 id="chart">港口處理嘅重量，同商品貨值要分開睇</h2>

呢條線係一季抵港及離港嘅海運、河運貨物重量。轉運貨物抵港同離港都會計入吞吐量，並非互不重複嘅貨物重量；亦唔係貨櫃數或即時船隻數。討論物流支援時，要再找設備使用、從業員技能同環境影響嘅資料。

```js
display(resize((width) => indicatorChart(indicator, width)));
display(indicatorNote(indicator));
display(learningGuidance(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator));
```

<h2 id="connections">連住一齊睇</h2>

- [商品進口貨值](./goods_imports)
- [商品整體出口貨值](./goods_exports)
- [四大行業比重](./four_key_industries)
- [青年預算備忘](../learn/budget-memo)：將數據背景、具體措施同成效指標分開寫。
