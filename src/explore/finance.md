---
title: 貨幣與股市
keywords: M1 M2 M3 貨幣 供應 股市 市值 港股 港交所 金管局 存款 融資 金融
sidebar: false
toc: false
---

```js
import { moneyHeader } from "../components/money-header.js";
import { moneyChartView } from "../components/money-view.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { formatDateZh } from "../components/format.js";
import { html } from "npm:htl";
const money = await FileAttachment("../data/money_supply.json").json();
```

<div class="monitor-home finance-page">
<header class="monitor-header">
  <div class="monitor-brand"><span class="monitor-brand__mark" aria-hidden="true">HK</span><div><span class="monitor-kicker">香港金融觀察 · 分清存量與流量</span><h1 id="finance">貨幣與股市</h1></div></div>
  <nav class="monitor-nav" aria-label="金融專區導覽"><a href="../">香港總覽</a><a href="./industries">金融與保險行業</a><a href="./living-cost">住屋與生活成本</a><a class="monitor-nav__primary" href="../learn/budget-memo">寫青年預算備忘 ↗</a></nav>
</header>

<section class="finance-intro" aria-labelledby="finance-question"><span class="monitor-kicker">貨幣供應 / 市場估值 / 公共財政</span><h2 id="finance-question">「市場有幾多錢」，<br>其實有幾種問法。</h2><p>銀行存款、股票市值同政府收入，講緊唔同嘅事。由 M1、M2、M3 開始，睇清每個數字嘅邊界，再連到市民生活。</p><div class="finance-jump"><a href="#money">貨幣供應量</a><a href="#market-cap">股市市值</a><a href="#connections">連到生活與預算</a></div></section>

<section class="finance-section" aria-labelledby="money">
  <div class="finance-heading"><span class="monitor-kicker">01 / 貨幣供應量</span><h2 id="money">M1、M2、M3：三種範圍，同一個季末。</h2><span class="monitor-tag">金管局原始資料 · 統計處轉載 · 季度</span></div>

```js
display(moneyHeader(money, money.coverage.end));
display(html`<p class="finance-source">來源：<a href=${money.source_url} target="_blank" rel="noopener noreferrer">${money.source_zh} ↗</a> · 來源更新 ${formatDateZh(money.updated_at)}${money.build?.stale ? " · 最近取得失敗，顯示舊快照" : ""}</p>`);
```

<p class="finance-note">所有貨幣折合港元；未經季節性調整。大字至小數兩位，1 萬億港元 = 1,000,000,000,000 港元。三者互相包含，唔好相加；唔等同政府可以分配嘅錢。</p>
<div class="finance-chart">

```js
const selectedSeries = view(Inputs.select(["全部", "M1", "M2", "M3"], { label: "顯示數列", value: "全部" }));
```

```js
display(resize((width) => indicatorChart(moneyChartView(money, selectedSeries), width)));
```

<p class="finance-note">M2、M3 接近時會重疊，可揀單一條線。<a href="../indicators/money_supply">完整季度讀數、資料表及引用 ↗</a></p>
</div>

<div class="money-nesting" aria-label="M3 包括 M2，M2 包括 M1">
  <section class="money-layer money-layer--m3"><h3>M3 <span>更廣嘅範圍</span></h3><p>M2，再加有限制牌照銀行及接受存款公司嘅客戶存款、相關可轉讓存款證。</p>
    <section class="money-layer money-layer--m2"><h3>M2 <span>再計儲蓄等項目</span></h3><p>M1，再加持牌銀行嘅儲蓄及定期存款、指定可轉讓存款證等。</p>
      <section class="money-layer money-layer--m1"><h3>M1 <span>現金與活期存款</span></h3><p>公眾持有嘅法定紙幣及硬幣，加持牌銀行客戶嘅活期存款。</p></section>
    </section>
  </section>
</div>
<p class="finance-source">原始統計及知識產權擁有人：香港金融管理局。資料使用須遵守<a href="https://www.hkma.gov.hk/chi/other-information/terms-and-conditions-of-use/" target="_blank" rel="noopener noreferrer">金管局使用條款 ↗</a>。</p>
<p class="finance-note">包含圖只解釋定義，面積唔代表金額。「所有貨幣」唔係只計香港居民，亦唔係只計港元現鈔。完整定義及歷史斷點見<a href="../indicators/money_supply">指標頁</a>；最新月度資料另到<a href="https://www.hkma.gov.hk/chi/data-publications-and-research/data-and-statistics/" target="_blank" rel="noopener noreferrer">金管局原站 ↗</a>核對。</p>
</section>

<section class="finance-section finance-market" aria-labelledby="market-cap">
  <div class="finance-heading"><span class="monitor-kicker">02 / 香港股票市場</span><h2 id="market-cap">市值，係市場點樣為股票估值。</h2><span class="monitor-tag">官方數表入口 · 需要連線</span></div>
  <div class="finance-market-grid"><article><span class="money-code">市值</span><h3>某一時點嘅估值</h3><p>一般由股價乘以已發行股數理解；全市場數字按官方涵蓋範圍計算。股價、股份數目或上市範圍改變，都會影響市值。</p></article><article><span class="money-code">成交額</span><h3>一段時間買賣咗幾多</h3><p>量度交易活動。同一批股票可以多次轉手，成交額唔等於公司收到嘅新資金。</p></article><article><span class="money-code">集資額</span><h3>發行證券籌得嘅資金</h3><p>同市場估值、日常交易係三回事。比較時要核對係首次上市定其他新證券發行。</p></article></div>
  <div class="finance-market-links"><a href="https://www.censtatd.gov.hk/tc/web_table.html?id=340-95003" target="_blank" rel="noopener noreferrer"><strong>查香港股市總市值 ↗</strong><span>統計處表 340-95003 · 原始機構：港交所<br>選「總市值」、主板／GEM，再核對期數同十億港元單位。</span></a><a href="https://www.hkex.com.hk/Market-Data/Statistics/Consolidated-Reports/HKEX-Monthly-Market-Highlights?sc_lang=zh-HK" target="_blank" rel="noopener noreferrer"><strong>港交所每月市場概況 ↗</strong><span>到官方原頁比較市值、成交及集資；唔同項目未必用相同統計期間。</span></a></div>
  <p class="finance-note">呢度講香港上市股票市場嘅市值，唔係「香港交易所」呢間上市公司本身嘅市值。本站目前提供官方閱讀入口，未加入可離線使用嘅市值數列。</p>
  <div class="finance-takeaway"><strong>市值升咗，唔代表政府多咗相同金額可以使。</strong><p>股票係資產，市值係估值；M1–M3 係貨幣供應量。兩者唔可以相加當成香港財富，亦唔代表香港一年生產咗幾多。</p></div>
</section>

<section class="finance-section" aria-labelledby="connections"><div class="finance-heading"><span class="monitor-kicker">03 / 將金融連到生活</span><h2 id="connections">數字一齊變，未必就係因果。</h2></div><div class="finance-market-grid"><article><h3>貨幣與物價</h3><p>除貨幣供應，仲要查需求、供應、進口價格同政策；唔用兩條線同升就落結論。</p><a href="./living-cost">住屋與生活成本 ↗</a></article><article><h3>市場與工作</h3><p>市場估值唔係金融業產出或就業人數；要分清行業實際提供咩服務。</p><a href="./industries">金融與保險行業 ↗</a></article><article><h3>公共資源</h3><p>提出支援措施時，要有政府收入、公共開支及受惠群組嘅證據。</p><a href="../learn/budget-memo">寫青年預算備忘 ↗</a></article></div></section>
<p class="site-assurances">定期官方快照 · 完成快取後離線閱讀 · 不提供買賣建議 · 外部官方入口需要連線</p>
</div>
