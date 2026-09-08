---
title: 香港數據監測站
keywords: 香港 數據 統計 開放數據 中學 公民 經濟 社會 分餅 預算 備忘
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
  FileAttachment("./data/four_key_industries.json").json(),
  FileAttachment("./data/hkex_listings.json").json(),
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
    <a href="#learning-routes">學習路線</a>
    <a class="monitor-nav__primary" href="./learn/budget-memo">寫青年預算備忘 <span aria-hidden="true">↗</span></a>
  </nav>
</header>

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
    <span class="monitor-tag">地域定位</span>
  </div>
  <figure class="monitor-map">
    <img src="./assets/hong-kong-map.svg" width="900" height="560" alt="香港地理輪廓，標示新界、九龍、香港島及大嶼山。" fetchpriority="high">
    <figcaption>地圖作地域定位；各指標屬全港統計，唔代表單一地區情況。</figcaption>
  </figure>
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
