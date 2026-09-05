---
title: 公屋輪候時間
keywords: 公屋 輪候 輪候時間 房屋局 房委會 CWT AWT housing waiting
---

```js
import { indicatorHeader, indicatorAnchors, indicatorNote, manualNotice } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";

const indicator = await FileAttachment("../data/phr_waiting_time.json").json();
```

<!-- 中文標題嘅 slug 會變空字串,anchor 撳唔到,所以自己寫 id。 -->
<h1 id="phr-waiting-time">公屋輪候時間</h1>

```js
display(manualNotice(indicator));
display(indicatorHeader(indicator));
display(indicatorAnchors(indicator));
```

<h2 id="chart">數據</h2>

```js
// 未填數就唔畫圖 —— 一張空圖同一張錯圖一樣誤導
if (indicator.manual_status !== "todo") display(resize((width) => indicatorChart(indicator, width)));
display(indicatorNote(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator));
```
