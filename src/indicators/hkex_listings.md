---
title: 香港交易所上市公司數目
keywords: 上市 上市公司 港交所 交易所 主板 GEM 股票 HKEX listed
---

```js
import { indicatorHeader, indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";

const indicator = await FileAttachment("../data/hkex_listings.json").json();
```

<!-- 中文標題嘅 slug 會變空字串,anchor 撳唔到,所以自己寫 id。 -->
<h1 id="hkex-listings">香港交易所上市公司數目</h1>

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
