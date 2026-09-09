---
title: 住屋與生活成本
keywords: 香港 樓價 指數 租金 生活成本 物價 通脹 食品 交通 水電 收入 財政 預算
sidebar: false
toc: false
---

```js
import { html } from "npm:htl";
import { indicatorCard } from "../components/indicator-card.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { formatDateZh } from "../components/format.js";
const price = await FileAttachment("../data/private_domestic_price.json").json();
const rent = await FileAttachment("../data/private_domestic_rent.json").json();
const cpi = await FileAttachment("../data/cpi.json").json();
const components = await FileAttachment("../data/cpi_components.json").json();
const wage = await FileAttachment("../data/median_wage.json").json();
const income = await FileAttachment("../data/household_income.json").json();
const months = [...new Set(components.series.map((point) => point.period))].sort().reverse();
const card = (indicator) => indicatorCard(indicator, { href: `../indicators/${indicator.indicator_id}` });
```

<div class="monitor-home living-page">

<header class="monitor-header">
  <div class="monitor-brand"><span class="monitor-brand__mark" aria-hidden="true">HK</span><div><span class="monitor-kicker">香港生活觀察 · 從數字到需要</span><h1 id="living-cost">住屋與生活成本</h1></div></div>
  <nav class="monitor-nav" aria-label="生活成本專區導覽"><a href="../">香港總覽</a><a href="./city">城市觀察</a><a href="./industries">行業與工作</a><a class="monitor-nav__primary" href="../learn/budget-memo">寫青年預算備忘 ↗</a></nav>
</header>

<section class="living-hero" aria-labelledby="living-question">
  <div><span class="monitor-kicker">住屋 / 使費 / 收入</span><h2 id="living-question">喺香港生活，<br>邊一筆最有壓力？</h2><p>樓價跌，租金可以升；通脹放慢，生活仍然可以貴。將唔同數據連起來，睇清楚要支援邊一類需要。</p><nav class="living-jump" aria-label="生活成本內容"><a href="#housing">01 住屋</a><a href="#daily-cost">02 日常使費</a><a href="#income">03 收入</a></nav></div>
  <aside class="living-reading"><span class="monitor-kicker">先識讀，再落筆</span><h3>三把唔同嘅尺</h3><dl><div><dt>指數點</dt><dd>睇價格相對基期嘅變化，唔係幾多港元。</dd></div><div><dt>按年 %</dt><dd>同一年前同月比。仍然為正，就代表仍比舊年貴。</dd></div><div><dt>每月港元</dt><dd>睇收入金額，先分清一個人定一個住戶。</dd></div></dl></aside>
</section>

<section class="living-section" aria-labelledby="housing">
  <div class="living-section-heading"><span class="living-number">01</span><div><span class="monitor-kicker">住屋市場</span><h2 id="housing">買樓同租屋，要分開睇。</h2></div><span class="monitor-tag">差餉物業估價署 · 月度</span></div>
  <p>兩個指數各以 1999 年平均為 100，點數唔係樓價或月租金額。兩卡各有獨立刻度；比較升跌幅要開完整走勢同算式，唔好靠小圖斜度判斷。</p>

```js
display(html`<div class="living-card-grid">${[price, rent].map(card)}</div>`);
```

  <div class="living-prompt"><strong>帶住問題睇數據</strong><p>租客、準備置業者、自住業主，會唔會同樣受惠於樓價下跌？全港指數仲未話你知個別家庭住邊、交幾多租或供幾多樓。</p></div>
</section>

<section class="living-section" aria-labelledby="daily-cost">
  <div class="living-section-heading"><span class="living-number">02</span><div><span class="monitor-kicker">日常使費</span><h2 id="daily-cost">同一個月，唔同類別加價幾快？</h2></div><span class="monitor-tag">政府統計處 · 月度</span></div>
  <p>九類綜合消費物價嘅按年變動；正數係比舊年同月貴，負數係較平。呢個圖比較加價速度，唔係消費金額。</p>
  <div class="living-chart-panel">

```js
const selectedMonth = view(Inputs.select(months, { label: "比較月份", value: months[0] }));
```

```js
display(resize((width) => components.series.some((point) => point.period === selectedMonth && Number.isFinite(point.value))
  ? indicatorChart({ ...components, chart: { ...components.chart, period: selectedMonth } }, width)
  : html`<p class="living-no-data" role="status">${selectedMonth} 未有可用分類數字；缺值唔代表零，請選其他月份。</p>`));
display(html`<p class="living-source">資料來源：<a href=${components.source_url} target="_blank" rel="noopener noreferrer">${components.source_zh} · 表 510-60001A ↗</a> · 數據截至 ${formatDateZh(components.updated_at)}${components.build?.stale ? " · 上次更新失敗，顯示舊快照" : ""}</p>`);
```

  <p class="living-source">未有可用數字嘅類別唔畫條；來源標示變動少於 0.05% 嘅格保留缺值，唔當成精確零。<a href="../indicators/cpi_components">開完整數列、類別走勢及引用 ↗</a></p>
  </div>
  <div class="living-prompt"><strong>最大升幅 ≠ 最大通脹貢獻</strong><p>食品、住屋同交通喺住戶開支入面嘅比重唔同。九個百分率唔可以直接相加或平均，亦唔能夠直接推算一個家庭每月多使幾多錢。</p></div>

```js
display(html`<div class="living-context-card">${card(cpi)}</div>`);
```

  <details class="living-explain"><summary>CPI 係咪就係「生活成本指數」？</summary><p>CPI 追蹤一籃子消費商品同服務嘅價格；嚴格嘅生活費用指數量度維持同一生活水平所需嘅費用，兩者有分別。每個家庭嘅購物籃同需要唔同，感受到嘅加價亦會唔同。</p><p>CPI 住屋類別唔等同樓價或每月供樓額。政府差餉寬減、代繳租金等一次性紓困措施亦會影響指數；呢頁用綜合 CPI，冇剔除呢啲措施。</p><a href="https://www.censtatd.gov.hk/en/data/stat_report/product/B8XX0021/att/B8XX0021.pdf" target="_blank" rel="noopener noreferrer">統計處《消費物價指數簡介》 ↗</a></details>
</section>

<section class="living-section" aria-labelledby="income">
  <div class="living-section-heading"><span class="living-number">03</span><div><span class="monitor-kicker">家庭資源</span><h2 id="income">收入有冇跟住變？</h2></div><a href="./city">再睇十八區人口與入息 ↗</a></div>
  <p>工資講僱員，住戶入息講一頭家；兩者都係中位數，唔係人人實收。日期同統計對象唔同，先逐項讀口徑，唔直接相減當成家庭結餘。</p>

```js
display(html`<div class="living-card-grid">${[wage, income].map(card)}</div>`);
```

</section>

<section class="living-memo" aria-labelledby="memo">
  <span class="monitor-kicker">由觀察到公共建議</span><h2 id="memo">唔只寫「生活好貴」，<br>寫清楚邊個需要支援。</h2>
  <div class="living-memo-grid"><div><h3>揀一類需要</h3><p>交通、食品定租住壓力？用同一期數嘅資料支持觀察。</p></div><div><h3>補一塊證據</h3><p>家庭人數、實際開支、居住安排同現有支援，仲有咩未知？</p></div><div><h3>提出可檢視嘅措施</h3><p>講受惠對象、資源來源，同點樣知道措施有效。</p></div></div>
  <a href="../learn/budget-memo">打開青年預算備忘工作紙 ↗</a>
</section>
<p class="site-assurances">官方數據定期快照 · 完成快取後可離線使用 · 外部官方入口需要連線 · 每項資料各有更新日期</p>
</div>
