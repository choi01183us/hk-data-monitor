---
title: 商品進口貨值
keywords: 商品 進口 貿易 經濟 物流
---

```js
import { indicatorHeader, indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";
import { learningGuidance } from "../components/learning-guidance.js";

const indicator = await FileAttachment("../data/goods_imports.json").json();
```

<h1 id="goods-imports">商品進口貨值</h1>

```js
display(indicatorHeader(indicator));
display(indicatorAnchors(indicator));
```

<h2 id="chart">比較同月份，分清貨值同貨量</h2>

進口貨值係貨物嘅金額，唔係幾多公噸。部分商品會留港使用，部分會再轉口；寫建議前，先分清你想支援嘅係本地消費、物流服務定企業貿易。

```js
display(resize((width) => indicatorChart(indicator, width)));
display(indicatorNote(indicator));
display(learningGuidance(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator));
```

<h2 id="connections">連住一齊睇</h2>

- [商品整體出口貨值](./goods_exports)
- [港口貨物吞吐量](./port_cargo)
- [四大行業比重](./four_key_industries)
- [青年預算備忘](../learn/budget-memo)：將數據背景、具體措施同成效指標分開寫。
