---
title: 澳門城市觀察
keywords: 澳門 Macau Macao 人口 旅客 通脹 GDP 澳門元 地圖 大三巴 氹仔 路氹 路環 城市 比較
sidebar: false
toc: false
---

```js
import {html} from "npm:htl";
import {macauMap} from "../components/macau-dashboard.js";
import {cityEconomy} from "../components/city-dashboard.js";
const geography = await FileAttachment("../data/macau-geography.json").json();
const indicators = await Promise.all([
  FileAttachment("../data/macau_population.json").json(),
  FileAttachment("../data/macau_visitors.json").json(),
  FileAttachment("../data/macau_inflation.json").json(),
  FileAttachment("../data/macau_gdp.json").json(),
]);
```

<div class="monitor-home city-page macau-page">
<header class="monitor-header">
  <div class="monitor-brand"><span class="monitor-brand__mark" aria-hidden="true">MO</span><div><span class="monitor-kicker">MACAO / 城市・旅遊・生活</span><h1 id="macau">澳門城市觀察</h1></div></div>
  <nav class="monitor-nav" aria-label="澳門專區導覽"><a href="../">香港總覽</a><a href="./city">香港城市觀察</a><a class="monitor-nav__primary" href="../learn/budget-memo">連到青年預算備忘 ↗</a></nav>
</header>

<nav class="city-switch" aria-label="切換觀察城市"><a href="./city"><span>HK</span>香港</a><a href="./macau" aria-current="page"><span>MO</span>澳門</a><p>各城市資料獨立列示；比較前先核對年份、單位同定義。</p></nav>

<div class="city-intro"><div><span class="monitor-kicker">由香港，望向另一個城市</span><h2 id="macau-overview">一座城市，<br>居民同旅客點樣共享？</h2></div><p>從澳門半島到氹仔、路氹同路環，留意歷史建築、旅遊活動與日常生活點樣相連。用數據提出問題，再返香港思考公共資源點分。</p></div>
<nav class="city-section-nav" aria-label="澳門面板"><a href="#macau-map">01 地圖與地點</a><a href="#macau-data">02 年度概況</a><a href="#city-comparison">03 港澳比較</a><span>2025 年度快照 · 非即時資料</span></nav>

<div class="city-top-grid macau-top-grid">
<div id="macau-map">

```js
display(macauMap(geography));
display(html`<p class="city-map-download"><a href=${await FileAttachment("../data/macau-geography.json").url()} download="macau-geography.json">下載本圖資料（ODbL） ↓</a></p>`);
```

</div>
<aside class="city-panel city-connections macau-observe" aria-labelledby="macau-observe-heading">
  <div class="city-panel-heading"><div><span class="monitor-kicker">觀察路線 / 由地點到需要</span><h2 id="macau-observe-heading">睇景點，亦睇居民。</h2></div></div>
  <ol><li><span>01 / 歷史街區</span><h3>保育同人流，點樣兼顧？</h3><p>遊客想參觀，居民需要出入同休息。步行空間、導賞安排、清潔同維修，邊一項最需要證據支持？</p></li><li><span>02 / 城市連繫</span><h3>旅客多，交通就一定夠？</h3><p>全年旅客人次睇到活動規模，但唔能夠話你知某條路、某個時段有幾多人。要再查分時人流同交通使用量。</p></li><li><span>03 / 生活環境</span><h3>海濱同郊遊空間，為邊個而設？</h3><p>居民、遊人同自然環境都可能受影響。提出新設施之前，先想交通、無障礙同日後維護成本。</p></li></ol>
  <div class="city-live-link"><a href="https://www.macaotourism.gov.mo/zh-hant/" target="_blank" rel="noopener noreferrer">澳門旅遊局官方指南 ↗</a></div>
  <p class="city-panel-intro">地點同問題係教學選材，唔係完整景點清單或人氣排名。外部指南需要連線。</p>
</aside>
</div>

<section class="city-economic-section" aria-labelledby="macau-data">
<div class="city-section-heading"><div><span class="monitor-kicker">02 / 2025 年度概況</span><h2 id="macau-data">四個數字，四種問法。</h2></div><p>澳門全境統計 · 點入可睇原數、口徑及引用</p></div>

```js
display(cityEconomy(indicators));
```

<p class="city-economic-note">人手核對官方 2025 年度發布，唔係自動更新或最新即時讀數。人口係年末存量；旅客、GDP 同通脹涵蓋全年。單一年度只作概況，未有歷年走勢；地圖景點唔代表數據嘅地區分布。</p>
</section>

<section class="macau-compare city-panel" aria-labelledby="city-comparison">
<div class="city-panel-heading"><div><span class="monitor-kicker">03 / 比較之前，先對口徑</span><h2 id="city-comparison">香港同澳門，可以點樣一齊睇？</h2></div></div>
<div class="macau-comparison-grid">
  <article><span class="monitor-kicker">金額</span><h3>港元 ≠ 澳門元</h3><p>澳門 GDP 以澳門元（MOP）列示；香港金額以港元（HKD）列示。本站冇換匯，兩者唔相加亦唔直接排行。香港現有 GDP 卡係人均值，澳門呢張係總額，換匯後亦唔可以直接比較。GDP 更唔等於政府收入。</p><a href="../indicators/macau_gdp">澳門 GDP 口徑 ↗</a></article>
  <article><span class="monitor-kicker">人口</span><h3>先對日期，再對涵蓋範圍</h3><p>年末人口同年中人口唔係同一時點；總人口亦唔等於香港地圖所用嘅陸上非住院人口。比較服務需要，要先講清楚計邊啲人。</p><a href="../indicators/population">查香港人口定義 ↗</a></article>
  <article><span class="monitor-kicker">物價</span><h3>升幅細，唔代表樣樣平</h3><p>兩地通脹反映各自消費籃子嘅價格變動。通脹率唔係價格水平；唔能夠單靠兩個百分比斷定邊個城市生活成本較低。</p><a href="./living-cost">香港生活成本觀察 ↗</a></article>
</div>
<p class="city-map-note">旅客人次會重複計同一人多次到訪，唔可同居民人數相加成為「城市人口」。平均收入、中位收入同淨資產亦要分開；本頁未提供港澳財富排行。</p>
</section>

<div class="macau-memo"><div><span class="monitor-kicker">由比較，到有證據嘅建議</span><h2 id="macau-memo">借鏡做法，仲要查本地需要。</h2><p>揀一個地圖地點同一項數據，寫低觀察、受影響群組、仍欠嘅證據。再返香港資料頁，核對同一議題，整理成青年預算備忘；澳門數字唔直接代替香港預算證據。</p></div><a href="../learn/budget-memo">整理我的論據 ↗</a></div>
<p class="site-assurances">完成快取後，澳門地圖、地點選取同年度讀數可離線使用。<a href="../about/sources#macau-sources">資料、地圖授權及修改說明 ↗</a></p>
</div>
