---
title: 各區人口
keywords: 18區 地區 人口 住戶 收入 香港
---

```js
import { html } from "npm:htl";
import { anchorVersusYear, collectAnchors } from "../components/anchor.js";
import { indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";
import { learningGuidance } from "../components/learning-guidance.js";
import { formatNumber } from "../components/format.js";

const indicator = await FileAttachment("../data/district_population.json").json();
const years = [...new Set(indicator.series.map((point) => point.period))].sort().reverse();
```

<h1 id="district-population">各區人口</h1>

<p class="lede">用同一年嘅居住人口，討論交通、學校及社區設施嘅服務範圍。</p>

```js
const selectedYear = view(Inputs.select(years, { label: "比較年份", value: years[0] }));
```

```js
const reference = indicator.series.find((point) => point.period === selectedYear && point.category === "全港");
display(html`<div class="headline"><div class="headline__item">
  <div class="headline__label">${selectedYear} 年 · 全港參考</div>
  <div class="headline__number"><strong>${reference?.value == null ? "—" : formatNumber(reference.value)}</strong><span class="headline__unit">${indicator.unit_zh}</span></div>
  <p>${indicator.basis_zh}</p>
</div></div>`);
```

<h2 id="chart">同一年比較 18 區居住人口</h2>

人多嘅區未必最擠迫：人口密度需要另外知道土地面積。呢張圖亦唔反映返工人流、旅客或者服務設施是否足夠。

```js
const districtView = { ...indicator, series: indicator.series.filter((point) => point.category !== "全港"), chart: { ...indicator.chart, period: selectedYear } };
display(resize((width) => indicatorChart(districtView, width)));
display(indicatorNote(indicator));
const baseline = indicator.series.find((point) => point.period === "2018" && point.category === "全港");
// 只傳基準年同選取年；選取年缺數時唔借前一年作比較。
const selectedAnchors = baseline?.value != null && reference?.value != null
  ? collectAnchors(anchorVersusYear([baseline, reference], "2018", {label: "全港陸上非住院人口"})) : [];
display(indicatorAnchors({...indicator, anchors: selectedAnchors}));
display(learningGuidance(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator, { period: selectedYear }));
```

<h2 id="connections">連住一齊睇</h2>

- [香港地區地圖](../explore/city)：將地區數字同位置連起來。
- [各區住戶月入中位數](./district_household_income)：人口同住戶收入要用同一年比較。
- [公共經常開支](./public_expenditure_policy_groups)：地區需要點樣連到資源分配？
- [青年預算備忘](../learn/budget-memo)：寫清楚受惠對象、措施同衡量成效嘅方法。
