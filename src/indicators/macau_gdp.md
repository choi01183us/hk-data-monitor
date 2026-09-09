---
draft: true
title: 澳門本地生產總值
keywords: 澳門 Macau Macao 2025 人口 旅客 通脹 經濟 GDP 澳門元
---

```js
import {indicatorHeader, indicatorAnchors, indicatorNote, manualNotice} from "../components/indicator-page.js";
import {indicatorChart} from "../components/indicator-chart.js";
import {dataTable} from "../components/data-table.js";
import {sourceFooter} from "../components/source-footer.js";
const indicator = await FileAttachment("../data/macau_gdp.json").json();
```

<h1 id="macau-gdp">澳門本地生產總值</h1>

<p class="lede">澳門年度概況 · 人手核對官方資料</p>

```js
display(manualNotice(indicator));
display(indicatorHeader(indicator));
display(indicatorAnchors(indicator));
```

<h2 id="chart">澳門一年生產咗幾多經濟價值？</h2>

呢度係按當年價格計算嘅 GDP 總額，以澳門元（MOP）列示，唔係港元，亦唔係人均 GDP、居民收入或政府收入。跨年比較增長，亦要分清名義同實質。

本頁只收錄 2025 年，長條呈現該年原值，唔係歷年走勢或即時數據。原數、完整定義同引用見下面資料表。

```js
display(resize((width) => indicatorChart(indicator, width)));
display(indicatorNote(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator));
```

<h2 id="connections">由數據到城市需要</h2>

- [澳門城市觀察](../explore/macau#macau-data)：連住人口、旅客、物價、經濟，留意各自統計範圍。
- [港澳比較前先對口徑](../explore/macau#city-comparison)：貨幣、時間同分母要先講清楚。
- [青年預算備忘](../learn/budget-memo)：將澳門當作參考案例；香港建議仍需查香港本地證據。
