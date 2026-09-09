---
title: 香港城市觀察
keywords: 香港 地圖 新聞 航班 飛機 經濟 進口 出口 航運 港口 商業區 郊區 郊野 預算
sidebar: false
toc: false
---

```js
import {cityMap, cityNews, cityFlights, cityEconomy} from "../components/city-dashboard.js";
const news = await FileAttachment("../data/city_news.json").json();
const flights = await FileAttachment("../data/city_flights.json").json();
const mapUrl = await FileAttachment("../assets/hong-kong-map.svg").url();
const economy = await Promise.all([
  FileAttachment("../data/goods_imports.json").json(),
  FileAttachment("../data/goods_exports.json").json(),
  FileAttachment("../data/port_cargo.json").json(),
  FileAttachment("../data/cpi.json").json(),
]);
```

<div class="monitor-home city-page">

<header class="monitor-header">
  <div class="monitor-brand"><span class="monitor-brand__mark" aria-hidden="true">HK</span><div><span class="monitor-kicker">HONG KONG / 城市・經濟・生活</span><h1 id="city">香港城市觀察</h1></div></div>
  <nav class="monitor-nav" aria-label="城市專區導覽"><a href="../">香港總覽</a><a href="./technology">科技與香港</a><a class="monitor-nav__primary" href="../learn/budget-memo">寫青年預算備忘 ↗</a></nav>
</header>

<div class="city-intro"><div><span class="monitor-kicker">由城市動態，睇到公共需要</span><h2 id="city-overview">香港，如何連繫世界。</h2></div><p>一張地圖，連起新聞、航空同貿易。先觀察變化，再用數據問：資源應該放喺邊？</p></div>
<nav class="city-section-nav" aria-label="城市面板"><a href="#city-map">01 地圖</a><a href="#city-news">02 新聞</a><a href="#city-economy-heading">03 經濟與航運</a><a href="#city-flights">04 航班</a><span>定時快照 · 官方即時入口</span></nav>

<div class="city-top-grid">

<div id="city-map">

```js
display(cityMap(mapUrl));
```

</div>

<div id="city-news">

```js
display(cityNews(news, {invalidation}));
```

</div>

</div>

<section class="city-economic-section" aria-labelledby="city-economy-heading">
<div class="city-section-heading"><div><span class="monitor-kicker">03 / 經濟與航運</span><h2 id="city-economy-heading">睇金額，亦睇貨運量。</h2></div><p>全港統計 · 各卡有獨立時期、單位同刻度</p></div>

```js
display(cityEconomy(economy));
```

<p class="city-economic-note">進口採用到岸價（CIF），出口採用離岸價（FOB），整體出口包括港產品出口及轉口。港口貨物吞吐量計重量，唔係貿易金額或貨櫃數；進出口亦唔等於政府收入。</p>
</section>

<div class="city-bottom-grid">

<div id="city-flights">

```js
display(cityFlights(flights, {invalidation}));
```

</div>

<aside class="city-panel city-connections" aria-labelledby="city-connections-heading">
  <div class="city-panel-heading"><div><span class="monitor-kicker">由觀察到提案</span><h2 id="city-connections-heading">為城市投資，先問三件事。</h2></div></div>
  <ol><li><span>01 / 需要</span><h3>邊啲人會受影響？</h3><p>航運、商業活動同郊遊設施，分別牽涉工人、居民、商戶同環境。全港數字以外，仲欠邊啲地區資料？</p></li><li><span>02 / 證據</span><h3>新聞同統計，有咩分別？</h3><p>一則公報係事件紀錄；月度或季度數據先可以睇較長走勢。唔好用單一事件直接推斷整體變化。</p></li><li><span>03 / 成效</span><h3>使咗錢，點知有改善？</h3><p>寫低受惠對象、成本同可追蹤成效，再到備忘工作紙整理論據。</p></li></ol>
  <div class="city-live-link"><a href="../learn/budget-memo">整理成青年預算備忘 ↗</a></div>
  <div class="city-shipping-links"><h3>繼續查航運</h3><a href="../indicators/port_cargo">港口貨運完整走勢 ↗</a><a href="https://www.mardep.gov.hk/e_files/hk/pub_services/arridepa.html" target="_blank" rel="noopener noreferrer">海事處船舶抵離港查詢 ↗</a><p>官方入口提供船舶抵離港文字報表，唔係即時船位地圖；需要連線。</p></div>
</aside>

</div>

<p class="site-assurances">完成快取後，地圖、搜尋同快照可離線閱讀。新聞與航班擷取時間各自列明；最新消息及出行安排請用官方連線入口。</p>

</div>
