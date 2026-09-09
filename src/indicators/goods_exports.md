---
title: 商品整體出口貨值
keywords: 商品 出口 轉口 貿易 經濟 物流
---

```js
import { indicatorHeader, indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";
import { learningGuidance } from "../components/learning-guidance.js";

const indicator = await FileAttachment("../data/goods_exports.json").json();
```

<h1 id="goods-exports">商品整體出口貨值</h1>

```js
display(indicatorHeader(indicator));
display(indicatorAnchors(indicator));
```

<h2 id="chart">整體出口包括港產品出口及轉口</h2>

一件貨物經香港轉口，出口貨值會包括件貨嘅價值；但香港提供嘅貿易及物流服務所創造嘅增加價值係另一回事。唔可以將呢條線當成香港製造業產值或政府收入。

```js
display(resize((width) => indicatorChart(indicator, width)));
display(indicatorNote(indicator));
display(learningGuidance(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator));
```

<h2 id="connections">連住一齊睇</h2>

- [商品進口貨值](./goods_imports)
- [港口貨物吞吐量](./port_cargo)
- [四大行業比重](./four_key_industries)
- [青年預算備忘](../learn/budget-memo)：將數據背景、具體措施同成效指標分開寫。
