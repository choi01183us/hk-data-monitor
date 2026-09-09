---
title: 九類消費物價按年變動
keywords: CPI 物價 通脹 食品 住屋 交通 電力 燃氣 水 衣履 生活成本
---

```js
import {t} from "../components/locale.js";
import {label} from "../components/display-text.js";
import { html } from "npm:htl";
import { indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";
import { learningGuidance } from "../components/learning-guidance.js";
import { cpiComponentAnchors } from "../components/cpi-components-view.js";
const indicator = await FileAttachment("../data/cpi_components.json").json();
const months = [...new Set(indicator.series.map((point) => point.period))].sort().reverse();
```

<h1 id="cpi-components">九類消費物價按年變動</h1>

<p class="lede">同一個月，食品、住屋同交通嘅價錢升跌可以好唔同。</p>

```js
const selectedMonth = view(Inputs.select(months, { label: t("比較月份", "Comparison month"), value: months[0] }));
```

<h2 id="chart">同一月份，邊類加價較快？</h2>

每條係相對一年前同月嘅變動百分率，唔係港元，亦唔係該類開支佔比。升幅最大唔等於對整體通脹貢獻最大，仲要睇開支權數。

```js
display(resize((width) => indicator.series.some((point) => point.period === selectedMonth && Number.isFinite(point.value))
  ? indicatorChart({ ...indicator, chart: { ...indicator.chart, period: selectedMonth } }, width)
  : html`<p class="living-no-data" role="status">${selectedMonth}${t(" 未有可用分類數字；缺值唔代表零，請選其他月份。", " has no available section figures. Missing values do not mean zero; choose another month.")}</p>`));
```

<h2 id="trend">揀一類，追蹤加價速度</h2>

```js
const selectedCategory = view(Inputs.select(indicator.category_order, { label: t("物價類別", "Price section"), format: label, value: "食品" }));
```

```js
display(resize((width) => indicatorChart({ ...indicator, name_zh: `${selectedCategory}按年變動`, name_en: `${label(selectedCategory)}: year-on-year change`, series: indicator.series.filter((point) => point.category === selectedCategory), chart: { type: "line", y_zero: true } }, width)));
display(indicatorAnchors({ ...indicator, anchors: cpiComponentAnchors(indicator.series, selectedMonth, selectedCategory) }));
display(indicatorNote(indicator));
display(learningGuidance(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator, { period: selectedMonth }));
```

<h2 id="connections">連住一齊睇</h2>

- [住屋與生活成本](../explore/living-cost)：比較租住、日常使費同收入背景。
- [整體通脹率](./cpi)：九類變動率唔可以直接相加或平均成整體通脹。
- [青年預算備忘](../learn/budget-memo)：由受惠群組、開支負擔同現有支援提出建議。
