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
  <nav class="monitor-nav" aria-label="首頁導覽">
    <a href="./explore/city">城市觀察</a>
    <a href="./explore/finance">貨幣・股市</a>
    <a href="./explore/industries">行業・金融保險</a>
    <a href="./explore/technology">科技與香港</a>
    <a href="./explore/living-cost">住屋・生活成本</a>
    <a href="#weather-effects">天氣特效</a>
    <a href="#learning-routes">學習路線</a>
    <a class="monitor-nav__primary" href="./learn/budget-memo">寫青年預算備忘 <span aria-hidden="true">↗</span></a>
  </nav>
</header>

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

<div class="monitor-toolbar">
  <h2 id="indicators">全港數據總覽</h2>
  <span class="monitor-tag">官方統計 · 定期更新</span>
  <p>每張卡各有數據日期，點入可睇完整走勢及來源。</p>
</div>

<div class="monitor-dashboard">

<section class="monitor-map-panel" aria-labelledby="hong-kong-map">
  <div class="monitor-panel-heading">
    <div>
      <span class="monitor-kicker">地理總覽</span>
      <h2 id="hong-kong-map">讀懂香港，由這裏開始。</h2>
    </div>
    <a class="monitor-map-open" href="./explore/city#city-map">放大互動地圖 ↗</a>
  </div>
  <section class="weather-demo" id="weather-effects" aria-label="香港地圖天氣特效示範">
    <div class="weather-controls">
      <fieldset class="weather-modes">
        <legend>天氣特效</legend>
        <label><input type="radio" name="weather-scene" value="sunny" checked><span><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>晴空</span></label>
        <label><input type="radio" name="weather-scene" value="rain"><span><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 14a4 4 0 1 1 0-8 6 6 0 0 1 11-1 4.5 4.5 0 0 1 1 9H6m1 3-1 3m6-3-1 3m6-3-1 3"/></svg>落雨</span></label>
        <label><input type="radio" name="weather-scene" value="fog"><span><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h14M7 10h14M3 14h14M7 18h14"/></svg>薄霧</span></label>
        <label><input type="radio" name="weather-scene" value="off"><span><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8"/><path d="m6.5 6.5 11 11"/></svg>關閉</span></label>
      </fieldset>
      <label class="weather-pause"><input type="checkbox"><span>暫停動畫</span></label>
    </div>
    <p class="weather-demo-note">視覺示範，唔代表香港即時天氣。</p>
    <p class="weather-reduced-note">已跟隨系統「減少動態效果」設定，顯示靜態效果。</p>
    <figure class="monitor-map">
      <div class="weather-stage">
        <img src="./assets/hong-kong-map.svg" width="900" height="560" alt="香港地理輪廓，標示新界、九龍、香港島及大嶼山。" fetchpriority="high">
        <div class="weather-art" aria-hidden="true">
          <div class="weather-sun"><div class="weather-sun-core"></div><div class="weather-sun-ring"></div></div>
          <div class="weather-cloud weather-cloud-a"></div><div class="weather-cloud weather-cloud-b"></div><div class="weather-cloud weather-cloud-c"></div>
          <div class="weather-rain">
            <i style="--drop-x:5%;--drop-delay:-1.3s;--drop-duration:2.1s"></i><i style="--drop-x:11%;--drop-delay:-0.5s;--drop-duration:1.8s"></i>
            <i style="--drop-x:18%;--drop-delay:-1.8s;--drop-duration:2.4s"></i><i style="--drop-x:24%;--drop-delay:-0.8s;--drop-duration:2s"></i>
            <i style="--drop-x:30%;--drop-delay:-1.1s;--drop-duration:2.3s"></i><i style="--drop-x:36%;--drop-delay:-0.2s;--drop-duration:1.9s"></i>
            <i style="--drop-x:43%;--drop-delay:-1.7s;--drop-duration:2.2s"></i><i style="--drop-x:49%;--drop-delay:-0.6s;--drop-duration:2.5s"></i>
            <i style="--drop-x:55%;--drop-delay:-1.2s;--drop-duration:2s"></i><i style="--drop-x:61%;--drop-delay:-0.3s;--drop-duration:2.3s"></i>
            <i style="--drop-x:68%;--drop-delay:-1.5s;--drop-duration:1.9s"></i><i style="--drop-x:74%;--drop-delay:-0.9s;--drop-duration:2.4s"></i>
            <i style="--drop-x:80%;--drop-delay:-1.9s;--drop-duration:2.1s"></i><i style="--drop-x:86%;--drop-delay:-0.4s;--drop-duration:2.2s"></i>
            <i style="--drop-x:92%;--drop-delay:-1.4s;--drop-duration:2.5s"></i><i style="--drop-x:98%;--drop-delay:-0.7s;--drop-duration:1.8s"></i>
          </div>
          <div class="weather-fog weather-fog-a"></div><div class="weather-fog weather-fog-b"></div>
        </div>
      </div>
      <figcaption>地圖作地域定位；各指標屬全港統計，唔代表單一地區情況。</figcaption>
    </figure>
  </section>
  <div class="monitor-map-footer">
    <span>地圖：© <a href="https://portal.csdi.gov.hk/csdi-webpage/dataset/landsd_rcd_1637221775627_85634" target="_blank" rel="noopener noreferrer">香港特別行政區政府地政總署</a>；經簡化。</span>
    <a href="./about/sources#hong-kong-map-source">地圖來源及製作說明 <span aria-hidden="true">↗</span></a>
  </div>
</section>

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
  <a class="learning-route" href="./learn/hong-kong">
    <span class="learning-route__eyebrow">模擬社會體驗</span>
    <strong>香港人點生活</strong>
    <span>由工資、家庭入息、物價同就業，理解唔同生活處境。</span>
  </a>
  <a class="learning-route" href="./learn/public-finance">
    <span class="learning-route__eyebrow">資源裁定會議 · 分餅</span>
    <strong>公共資源點分</strong>
    <span>先分清開支口徑，再衡量需要、資金來源同取捨。</span>
  </a>
  <a class="learning-route" href="./learn/budget-memo">
    <span class="learning-route__eyebrow">由證據到建議</span>
    <strong>寫青年預算備忘</strong>
    <span>跟住工作紙，寫清問題、證據、成本同預期成效。</span>
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
