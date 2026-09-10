---
title: 香港數據監測站
keywords: 香港 數據 統計 開放數據 中學 公民 經濟 社會 分餅 預算 備忘 科技 創科 研發 上網
toc: false
sidebar: false
---

```js
import { indicatorCard } from "./components/indicator-card.js";

const loaded = await Promise.all([
  FileAttachment("./data/govt_expenditure.json").json(),
  FileAttachment("./data/govt_revenue.json").json(),
  FileAttachment("./data/fiscal_reserves.json").json(),
  FileAttachment("./data/gdp.json").json(),
  FileAttachment("./data/population.json").json(),
  FileAttachment("./data/unemployment.json").json(),
  FileAttachment("./data/median_wage.json").json(),
  FileAttachment("./data/household_income.json").json(),
  FileAttachment("./data/cpi.json").json(),
  FileAttachment("./data/cpi_components.json").json(),
  FileAttachment("./data/private_domestic_price.json").json(),
  FileAttachment("./data/private_domestic_rent.json").json(),
  FileAttachment("./data/four_key_industries.json").json(),
  FileAttachment("./data/hkex_listings.json").json(),
  FileAttachment("./data/money_supply.json").json(),
  FileAttachment("./data/banking_institutions.json").json(),
  FileAttachment("./data/goods_imports.json").json(),
  FileAttachment("./data/goods_exports.json").json(),
  FileAttachment("./data/port_cargo.json").json(),
  FileAttachment("./data/district_population.json").json(),
  FileAttachment("./data/district_household_income.json").json(),
  FileAttachment("./data/rd_expenditure.json").json(),
  FileAttachment("./data/household_internet.json").json(),
  FileAttachment("./data/public_expenditure_policy_groups.json").json(),
  FileAttachment("./data/phr_waiting_time.json").json(),
]);
// SPEC 第 2 節第 4 條:未填數嘅人手指標唔出現。首頁唔會有一張「—」嘅卡。
const indicators = loaded.filter((indicator) => indicator.manual_status !== "todo");
```


<div class="monitor-home">

<header class="monitor-header">
  <div class="monitor-brand">
    <span class="monitor-brand__mark" aria-hidden="true">HK</span>
    <div>
      <span class="monitor-kicker">認識城市 · 理解生活 · 討論財政</span>
      <h1 id="home">香港數據監測站</h1>
    </div>
  </div>
  <nav class="monitor-quick-nav" aria-label="首頁捷徑">
    <a href="#hong-kong-map">地圖</a>
    <a href="#home-news">新聞</a>
    <a href="./learn/classroom">課堂任務</a>
    <a href="#indicators">數據</a>
  </nav>
</header>

<nav class="home-classroom" aria-label="揀今日嘅課堂任務">
  <strong>今日想解答咩？</strong>
  <a href="./learn/classroom#simulation">生活點揀 <span aria-hidden="true">↗</span></a>
  <a href="./learn/classroom#allocation">資源點分 <span aria-hidden="true">↗</span></a>
  <a href="./learn/classroom#memorandum">建議點寫 <span aria-hidden="true">↗</span></a>
</nav>

<div class="monitor-feature">

<section class="monitor-map-panel" aria-labelledby="hong-kong-map">
  <div class="monitor-panel-heading">
    <div>
      <span class="monitor-kicker">地理總覽</span>
      <h2 id="hong-kong-map">讀懂香港，由這裏開始。</h2>
    </div>
    <a class="monitor-map-open" href="./explore/city#city-map">放大互動地圖 ↗</a>
  </div>

```js
import {weatherMap} from "./components/weather-map.js";
const weather = await FileAttachment("./data/city_weather.json").json();
const weatherMapUrl = await FileAttachment("./assets/hong-kong-map.svg").url();
display(weatherMap(weather, {mapUrl: weatherMapUrl, invalidation}));
```


  <div class="monitor-map-footer">
    <span>地圖：© <a href="https://portal.csdi.gov.hk/csdi-webpage/dataset/landsd_rcd_1637221775627_85634" target="_blank" rel="noopener noreferrer">香港特別行政區政府地政總署</a>；經簡化。</span>
    <a href="./about/sources#hong-kong-map-source">地圖來源及製作說明 <span aria-hidden="true">↗</span></a>
  </div>
</section>

<div id="home-news" class="monitor-feature-news">

```js
import {cityNews} from "./components/city-dashboard.js";
const news = await FileAttachment("./data/city_news.json").json();
display(cityNews(news, {compact: true, invalidation}));
```

<a class="monitor-news-more" href="./explore/city#city-news">更多新聞與城市動態 <span aria-hidden="true">↗</span></a>

</div>

</div>

<div class="monitor-topics">

<a class="monitor-topic-entry" href="./explore/public-services">
  <span class="monitor-topic-entry__icon" aria-hidden="true">◎</span>
  <span><strong>公共服務與預算</strong><span>社福 · 教育 · 醫療 · 30 個服務綱領 · 三年撥款與需要</span></span>
  <span class="monitor-topic-entry__action">睇清資源點照顧需要 ↗</span>
</a>

<a class="monitor-topic-entry" href="./explore/city">
  <span class="monitor-topic-entry__icon" aria-hidden="true">◉</span>
  <span><strong>香港城市觀察</strong><span>十八區人口與入息 · 旅遊景點 · 新聞航班 · 進出口航運</span></span>
  <span class="monitor-topic-entry__action">探索城市連繫 <span aria-hidden="true">↗</span></span>
</a>

<a class="monitor-topic-entry" href="./explore/finance">
  <span class="monitor-topic-entry__icon" aria-hidden="true">↗</span>
  <span><strong>貨幣與股市</strong><span>銀行與上市公司 · M1–M3 · IPO · 黃金 · 港交所業務</span></span>
  <span class="monitor-topic-entry__action">分清每種「錢」 ↗</span>
</a>

<a class="monitor-topic-entry" href="./explore/industries">
  <span class="monitor-topic-entry__icon" aria-hidden="true">◇</span>
  <span><strong>香港行業・金融與保險</strong><span>行業做甚麼 · 工作與技能 · 市民生活 · 預算問題</span></span>
  <span class="monitor-topic-entry__action">認識城市背後嘅工作 ↗</span>
</a>

<a class="monitor-topic-entry" href="./explore/living-cost">
  <span class="monitor-topic-entry__icon" aria-hidden="true">⌂</span>
  <span><strong>住屋與生活成本</strong><span>樓價與租金 · 食品交通水電 · 收入與支援需要</span></span>
  <span class="monitor-topic-entry__action">睇清生活壓力 ↗</span>
</a>

<a class="monitor-topic-entry" href="./explore/technology">
  <span class="monitor-topic-entry__icon" aria-hidden="true">◎</span>
  <span><strong>科技與香港</strong><span>研發投入 · 數碼共融 · 青年機會</span></span>
  <span class="monitor-topic-entry__action">連起數據，探索影響 <span aria-hidden="true">↗</span></span>
</a>

</div>

<div class="monitor-toolbar">
  <h2 id="indicators">全港數據總覽</h2>
  <span class="monitor-tag">官方統計 · 定期更新</span>
  <p>每張卡各有數據日期，點入可睇完整走勢及來源。</p>
</div>

<div class="monitor-dashboard">

```js
display(html`<div class="card-grid">${indicators.map((indicator) => indicatorCard(indicator))}</div>`);
```

</div>

<section class="monitor-learning" aria-labelledby="learning-routes">
<div class="monitor-section-heading">
  <div><span class="monitor-kicker">由觀察到行動</span><h2 id="learning-routes">帶住問題，繼續探索</h2></div>
  <p>揀一條路線，將數字變成有根據嘅論點。</p>
</div>

<nav class="learning-routes" aria-label="學習路線">
  <a class="learning-route" href="./learn/classroom#simulation">
    <span class="learning-route__eyebrow">模擬社會體驗</span>
    <strong>完成角色決策紀錄</strong>
    <span>跟住模擬社會任務，引用生活數據，解釋角色嘅選擇同代價。</span>
  </a>
  <a class="learning-route" href="./learn/classroom#allocation">
    <span class="learning-route__eyebrow">資源裁定會議 · 分餅</span>
    <strong>提出資源優先次序</strong>
    <span>跟住分餅任務，核對公共開支，提出取捨並回應另一組意見。</span>
  </a>
  <a class="learning-route" href="./learn/classroom#memorandum">
    <span class="learning-route__eyebrow">青年預算備忘</span>
    <strong>由證據寫到建議</strong>
    <span>跟住備忘任務查證據，再用工作紙寫草稿、互評同修訂。</span>
  </a>
</nav>

</section>

<div class="monitor-notes">
  <section aria-labelledby="how-to-use">
    <h2 id="how-to-use">睇數，亦要睇出處</h2>
    <p>先核對時期、單位、群組同預算狀態，再分開寫「數據顯示咩」同「我建議點做」。指標頁可複製數字連官方來源。</p>
  </section>
  <section aria-labelledby="status">
    <h2 id="status">待填，唔等於零</h2>
    <p>公共經常開支十組同公屋輪候時間要人手核對。未填指標唔會出卡；需要嗰部分證據時，先記低缺口，等核對後再落結論。</p>
  </section>
</div>

<p class="site-assurances">有來源 · 有數據日期 · 唔收集個人資料 · 完成快取後可離線閱讀</p>

</div>

```js
import {programmeBrand} from "./components/programme-brand.js";
const programmeLogos = {
  bgca: await FileAttachment("./assets/programme/bgca.png").url(),
  hkex: await FileAttachment("./assets/programme/hkex.png").url(),
  edb: await FileAttachment("./assets/programme/edb.png").url(),
  hkcss: await FileAttachment("./assets/programme/hkcss.png").url()
};
display(programmeBrand({logos: programmeLogos}));
```
