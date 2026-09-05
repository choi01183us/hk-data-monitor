---
title: 人均本地生產總值
keywords: GDP 本地生產總值 人均 經濟 生產總值 統計處 gdp per capita
---

```js
import { sourceFooter } from "../components/source-footer.js";
import { dataTable } from "../components/data-table.js";
import { formatNumber, formatChineseMagnitude } from "../components/format.js";

const gdp = await FileAttachment("../data/gdp.json").json();
```

<!-- 中文標題嘅 slug 會變空字串,連 anchor 都撳唔到,所以一律自己寫 id。 -->
<h1 id="gdp">人均本地生產總值</h1>

<p class="lede">${gdp.question_zh}</p>

<div class="headline">
  <div class="headline__number">
    <strong>${formatNumber(gdp.latest.value, { digits: 0 })}</strong>
    <span class="headline__unit">${gdp.unit_zh}</span>
  </div>
  <div class="headline__period">${gdp.latest.period} 年</div>
</div>

<h2 id="anchors">相當於……</h2>

<p class="section-hint">
數字太大嘅時候好難有感覺。下面每一句都附埋算式,你可以自己撳計數機驗。
</p>

<div class="anchors">
  ${gdp.anchors.map((anchor) => html`<div class="anchor">
    <p class="anchor__text">${anchor.text_zh}</p>
    <p class="anchor__basis">點計出嚟:${anchor.basis_zh}</p>
  </div>`)}
</div>

<h2 id="chart">歷年變化</h2>

```js
// period 係字串(SPEC 第 5 節要求),畫圖先轉返數字做線性軸。
// 保留 value === null 嘅點 —— Plot 會斷開條線,
// 咁「嗰年冇數」就睇得出,唔會被一條直線蒙混過去。
const rows = gdp.series.map((point) => ({ year: Number(point.period), value: point.value }));
```

```js
display(
  resize((width) =>
    Plot.plot({
      width,
      height: width < 480 ? 260 : 360,
      marginLeft: width < 480 ? 52 : 64,
      marginBottom: 36,
      x: { label: "年份", tickFormat: "d", nice: true },
      y: {
        label: `${gdp.name_zh}(${gdp.unit_zh})`,
        grid: true,
        zero: gdp.chart?.y_zero ?? false,
        tickFormat: (value) => formatChineseMagnitude(value),
      },
      marks: [
        Plot.areaY(rows, { x: "year", y: "value", fillOpacity: 0.12 }),
        Plot.lineY(rows, { x: "year", y: "value", strokeWidth: 2 }),
        Plot.dot(rows.filter((row) => row.year === Number(gdp.latest.period)), {
          x: "year",
          y: "value",
          r: 4,
          fill: "currentColor",
        }),
        Plot.tip(
          rows,
          Plot.pointerX({
            x: "year",
            y: "value",
            title: (row) =>
              row.value === null
                ? `${row.year} 年\n冇數字`
                : `${row.year} 年\n${formatNumber(row.value, { digits: 0 })} ${gdp.unit_zh}`,
          })
        ),
      ],
    })
  )
);
```

<div class="chart-note">

**點解要留意「以當時市價計算」?** ${gdp.notes_zh}

</div>

```js
display(dataTable(gdp));
```

```js
display(sourceFooter(gdp));
```
