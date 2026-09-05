---
title: 香港人口
keywords: 人口 人口統計 香港人口 統計處 population
---

```js
import { indicatorHeader, indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";

const population = await FileAttachment("../data/population.json").json();
```

<h1 id="population">香港人口</h1>

```js
display(indicatorHeader(population));
display(indicatorAnchors(population));
```

<h2 id="chart">歷年變化</h2>

```js
display(resize((width) => indicatorChart(population, width)));
display(indicatorNote(population));
display(dataTable(population));
display(sourceFooter(population));
```
