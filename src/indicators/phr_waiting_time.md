---
title: 公屋輪候時間
keywords: 公屋 輪候 輪候時間 房屋局 房委會 CWT AWT housing waiting
---

```js
import { indicatorHeader, indicatorAnchors, indicatorNote, manualNotice } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";
import { learningGuidance } from "../components/learning-guidance.js";

const indicator = await FileAttachment("../data/phr_waiting_time.json").json();
```

<!-- 中文標題嘅 slug 會變空字串,anchor 撳唔到,所以自己寫 id。 -->
<h1 id="phr-waiting-time">公屋輪候時間</h1>

```js
display(manualNotice(indicator));
display(indicatorHeader(indicator));
display(indicatorAnchors(indicator));
```

<h2 id="chart">已核對季度的平均輪候時間</h2>

<p>先分清邊類申請者、傳統公屋定包括簡約公屋，再引用季度及單位。三項唔係三批互不重疊的人，亦唔係今日申請後要等幾耐的承諾。</p>

```js
// 未填數就唔畫圖 —— 一張空圖同一張錯圖一樣誤導
if (indicator.manual_status !== "todo") display(resize((width) => indicatorChart(indicator, width)));
display(indicatorNote(indicator));
display(learningGuidance(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator));
```
