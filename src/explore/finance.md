---
title: 貨幣與股市
keywords: 銀行 上市公司 IPO 黃金 全球 港交所業務 M1 M2 M3 貨幣 供應 股市 市值 港股 港交所 金管局 存款 融資 金融
sidebar: false
toc: false
---

```js
import {t} from "../components/locale.js";
import {label, indicatorText} from "../components/display-text.js";
import {financialInstitutions} from "../components/financial-institutions.js";
import { financeCountPanel } from "../components/finance-count-panel.js";
import { moneyHeader } from "../components/money-header.js";
import { moneyChartView } from "../components/money-view.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { formatDateZh } from "../components/format.js";
import { html } from "npm:htl";
const banks = await FileAttachment("../data/banking_institutions.json").json();
const listings = await FileAttachment("../data/hkex_listings.json").json();
const money = await FileAttachment("../data/money_supply.json").json();
```

<div class="monitor-home finance-page">
<header class="monitor-header">
  <div class="monitor-brand"><span class="monitor-brand__mark" aria-hidden="true">HK</span><div><span class="monitor-kicker">香港金融觀察 · 分清存量與流量</span><h1 id="finance">貨幣與股市</h1></div></div>
  <nav class="monitor-nav" aria-label="金融專區導覽"><a href="../">香港總覽</a><a href="./industries">金融與保險行業</a><a href="./living-cost">住屋與生活成本</a><a class="monitor-nav__primary" href="../learn/budget-memo">寫青年預算備忘 ↗</a></nav>
</header>

<section class="finance-intro" aria-labelledby="finance-question"><span class="monitor-kicker">貨幣供應 / 市場估值 / 公共財政</span><h2 id="finance-question">「市場有幾多錢」，<br>其實有幾種問法。</h2><p>銀行存款、股票市值同政府收入，講緊唔同嘅事。由 M1、M2、M3 開始，睇清每個數字嘅邊界，再連到市民生活。</p><div class="finance-jump"><a href="#institutions">銀行與上市公司</a><a href="#financial-roles">四個金融機構</a><a href="#ipo">IPO 集資</a><a href="#global-gold">全球黃金交易</a><a href="#hkex-business">港交所業務</a><a href="#money">貨幣供應量</a><a href="#market-cap">股市市值</a><a href="#connections">連到生活與預算</a></div></section>

<section class="finance-section" aria-labelledby="institutions">
  <div class="finance-heading"><span class="monitor-kicker">機構數目 / 先講清楚計邊個</span><h2 id="institutions">幾多間銀行，幾多間上市公司？</h2></div>
  <p class="finance-note">兩個數列嘅統計日期唔同，各張卡會獨立標明。機構數目係市場結構嘅起點，唔能夠單靠數量判斷規模、競爭或服務好唔好。</p>
  <div class="finance-count-grid">

```js
display(financeCountPanel(banks, banks.coverage.end));
display(financeCountPanel(listings, listings.coverage.end));
```

  </div>
</section>

<section class="finance-section" aria-labelledby="financial-roles">
<div class="finance-heading"><span class="monitor-kicker">四個機構 / 分清各自角色</span><h2 id="financial-roles">邊個監管，邊個營運市場？</h2></div>

```js
display(financialInstitutions());
```

</section>

<section class="finance-section" aria-labelledby="money">
  <div class="finance-heading"><span class="monitor-kicker">01 / 貨幣供應量</span><h2 id="money">M1、M2、M3：三種範圍，同一個季末。</h2><span class="monitor-tag">金管局原始資料 · 統計處轉載 · 季度</span></div>

```js
display(moneyHeader(money, money.coverage.end));
display(html`<p class="finance-source">${t("來源：", "Source: ")}<a href=${money.source_url} target="_blank" rel="noopener noreferrer">${indicatorText(money, "source_zh")} ↗</a>${t(" · 來源更新 ", " · Source updated ")}${formatDateZh(money.updated_at)}${money.build?.stale ? t(" · 最近取得失敗，顯示舊快照", " · Latest retrieval failed; showing the previous snapshot") : ""}</p>`);
```

<p class="finance-note">所有貨幣折合港元；未經季節性調整。大字至小數兩位，1 萬億港元 = 1,000,000,000,000 港元。三者互相包含，唔好相加；唔等同政府可以分配嘅錢。</p>
<div class="finance-chart">

```js
const selectedSeries = view(Inputs.select(["全部", "M1", "M2", "M3"], { label: t("顯示數列", "Display series"), format: label, value: "全部" }));
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

<div class="finance-guide">
<section id="ipo" class="finance-section" aria-labelledby="ipo-heading">
  <div class="finance-heading"><span class="monitor-kicker">IPO / 企業集資</span><h2 id="ipo-heading">上市集資，同每日股票買賣有咩分別？</h2><span class="monitor-tag">導讀及官方報告 · 非即時排行</span></div>
  <div class="finance-market-grid">
    <article><span class="money-code">首次公開招股</span><h3>IPO：透過股份發售集資</h3><p>公司首次向公眾發售股份，可以配合上市籌集資金。要分清發售所得、扣除費用後嘅淨額，以及公司實際用途。</p><a href="https://www.hkex.com.hk/Global/Exchange/FAQ/List-with-HKEX?sc_lang=zh-HK" target="_blank" rel="noopener noreferrer">港交所上市問答 ↗</a></article>
    <article><span class="money-code">上市後交易</span><h3>股票轉手，錢未必入公司</h3><p>投資者互相買賣已發行股票，款項通常流向賣方。公司其後再發新股集資，又係另一類融資活動。</p><a href="https://www.hkexgroup.com/About-HKEX/About-HKEX/Our-Markets-Products-Services?sc_lang=en" target="_blank" rel="noopener noreferrer">港交所市場與服務 ↗</a></article>
    <article><span class="money-code">全球比較</span><h3>先睇期間，再睇名次</h3><p>比較 IPO 集資要用同一期間、相同貨幣及統計範圍。全年、上半年、今年截至某月，唔可以混成同一個排名。</p><a href="https://www.hkexgroup.com/Investor-Relations/Financial-Results-and-Presentations/2026?sc_lang=en" target="_blank" rel="noopener noreferrer">官方業績及簡報 ↗</a></article>
  </div>
  <div class="finance-market-links">
    <a href="https://www.hkex.com.hk/-/media/HKEX-Market/News/News-Release/2026/260226news/260226news_eng.pdf" target="_blank" rel="noopener noreferrer"><strong>2025 全年：官方報告案例 ↗</strong><span>港交所 2025 全年業績報告指出：2025 年 IPO 集資為 286.9 十億港元，全球第 1。<br>統計期間：2025-01-01 至 2025-12-31<br>來源：港交所全年業績 · 2026-02-26 發布</span></a>
    <a href="https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0819/2026081900213.pdf" target="_blank" rel="noopener noreferrer"><strong>2026 上半年：官方報告案例 ↗</strong><span>港交所 2026 中期報告指出：2026 年 1–6 月 IPO 集資為 212.4 十億港元，全球第 2。<br>統計期間：2026-01-01 至 2026-06-30<br>來源：港交所中期業績 · 2026-08-19 發布</span></a>
  </div>
  <p class="finance-note">呢兩個案例分別涵蓋全年同半年，期間長度唔同，唔能夠直接比較金額升跌；名次亦只屬所列期間，唔係即時或最新排行。</p>
  <details class="finance-note"><summary>讀 IPO 報告前，要分清嘅字眼</summary><p>「上市公司總數」係某一時點有幾多間；「新上市公司數量」係期間內新增上市紀錄，可能包括由 GEM 轉主板等情況，唔應直接改名成「IPO 宗數」。新上市、首次集資及上市後集資，要跟各表註腳分開。</p><p>世界排名亦要核對按交易所、市場定地區比較，以及有冇剔除特殊目的收購公司、介紹上市或轉板。名次本身唔反映全部金融業產出，亦唔代表投資回報。上面兩份正式報告各自有期間及口徑，應連同原表一齊引用。</p></details>
  <div class="finance-takeaway"><strong>集資多咗，點樣連到香港市民？</strong><p>可以再查企業投資、專業服務、就業及政府收入。IPO 集資唔係政府可以直接撥用嘅錢；寫預算建議時，要另外提出受惠群組同公共開支嘅證據。</p></div>
  <p class="finance-source">導讀及入口核對：2026-09-09。報告來源：香港交易所；資料期間及發布日見各入口。外部報告需連線閱讀。</p>
</section>

<section id="hkex-business" class="finance-section" aria-labelledby="hkex-business-heading">
  <div class="finance-heading"><span class="monitor-kicker">HKEX / 市場基建</span><h2 id="hkex-business-heading">港交所提供咩服務？</h2><span class="monitor-tag">由上市、交易，讀到交收與科技</span></div>
  <p class="finance-note">以下按教學功能分成六項，唔係港交所財務報告嘅分部分類，亦唔用卡片數目表示各業務規模。</p>
  <div class="finance-market-grid">
    <article><span class="money-code">上市集資</span><h3>讓企業接觸投資者</h3><p>提供上市平台、上市規則及披露要求，讓企業籌集資金，投資者亦有資料理解企業。</p><a href="https://www.hkex.com.hk/Global/Exchange/FAQ/List-with-HKEX?sc_lang=zh-HK" target="_blank" rel="noopener noreferrer">上市服務與要求 ↗</a></article>
    <article><span class="money-code">市場交易</span><h3>連接買方同賣方</h3><p>營運股票、交易所買賣產品、期貨及期權等市場。交易系統、產品規則同市場運作，一齊支持買賣及價格形成。</p><a href="https://www.hkexgroup.com/About-HKEX/About-HKEX/Our-Markets-Products-Services?sc_lang=en" target="_blank" rel="noopener noreferrer">交易市場及產品 ↗</a></article>
    <article><span class="money-code">結算交收</span><h3>成交之後，仲要完成交付</h3><p>計算交易後各方應收應付，再安排款項及證券交付。結算所亦透過按金等措施管理參與者未能履約嘅風險。</p><a href="https://www.hkex.com.hk/Services/Clearing/Securities/Overview?sc_lang=zh-HK" target="_blank" rel="noopener noreferrer">證券結算概覽 ↗</a></article>
    <article><span class="money-code">數據與技術</span><h3>讓市場資訊同系統連得上</h3><p>提供市場數據、連接交易系統及設備託管等服務。呢度講資訊及技術設施，同跨境投資渠道係兩種功能。</p><a href="https://www.hkexgroup.com/About-HKEX/About-HKEX/Our-Markets-Products-Services?sc_lang=en" target="_blank" rel="noopener noreferrer">數據及系統連接服務 ↗</a></article>
    <article><span class="money-code">滬深港通</span><h3>連接內地同香港市場</h3><p>合資格投資者可以經指定渠道買賣對方市場嘅指定證券。北向、南向嘅方向及投資範圍要分清，並非所有證券都包括在內。</p><a href="https://www.hkex.com.hk/Mutual-Market/Connect-Hub/Stock-Connect?sc_lang=zh-HK" target="_blank" rel="noopener noreferrer">滬深港通機制 ↗</a></article>
    <article><span class="money-code">全球商品</span><h3>LME 連到工業用金屬</h3><p>集團旗下倫敦金屬交易所（LME）提供基本金屬市場及參考價格，連繫製造業採購與價格風險管理。金屬市場唔只係黃金。</p><a href="https://www.hkexgroup.com/About-HKEX/About-HKEX/Our-Markets-Products-Services?sc_lang=en" target="_blank" rel="noopener noreferrer">集團商品市場 ↗</a></article>
  </div>
  <details class="finance-note"><summary>港交所、聯交所同證監會有咩分工？</summary><p>香港交易所係市場營運集團；旗下聯交所負責上市事宜嘅前線監管，證監會監察交易所履行相關職能。唔應把港交所當成香港所有金融活動嘅唯一監管機構。</p><p><a href="https://www.sfc.hk/TC/About-the-SFC/Our-role/Who-we-regulate" target="_blank" rel="noopener noreferrer">證監會：監管對象與職責 ↗</a> · <a href="https://www.hkex.com.hk/Services/Clearing/Listed-Derivatives/Risk-Management?sc_lang=en" target="_blank" rel="noopener noreferrer">港交所：衍生產品結算風險管理 ↗</a></p></details>
  <p class="finance-source">導讀及入口核對：2026-09-09。來源：香港交易所、證券及期貨事務監察委員會。外部原頁需連線閱讀。</p>
</section>

<section id="global-gold" class="finance-section" aria-labelledby="global-gold-heading">
  <div class="finance-heading"><span class="monitor-kicker">GOLD / 世界市場連繫</span><h2 id="global-gold-heading">同樣講黃金，交易緊嘅可以係唔同嘢。</h2><span class="monitor-tag">市場角色示意 · 無即時金價</span></div>
  <p class="finance-note">由倫敦、美國、上海再返香港，睇場外交易、期貨、交割同倉儲點樣配合。以下係代表節點，次序及卡片大小唔代表交易量或世界排名。</p>
  <div class="finance-market-grid finance-gold-grid">
    <article><span class="money-code">LONDON / 倫敦</span><h3>場外交易與倫敦庫存</h3><p>Loco London 市場由交易雙方直接議定條件，相關黃金以倫敦庫存支持。LBMA 制定市場標準，唔係集中撮合所有買賣嘅交易所。</p><a href="https://www.lbma.org.uk/market-standards/about-loco-london" target="_blank" rel="noopener noreferrer">LBMA：認識 Loco London ↗</a></article>
    <article><span class="money-code">US / 美國</span><h3>COMEX 黃金期貨</h3><p>CME Group 旗下 COMEX 提供標準化黃金期貨。買賣合約、持有未平倉合約同最後交付金條，係唔同量度。</p><a href="https://www.cmegroup.com/markets/metals/precious/gold-futures.html" target="_blank" rel="noopener noreferrer">CME：黃金期貨概覽 ↗</a></article>
    <article><span class="money-code">SHANGHAI / 上海</span><h3>上金所與國際板</h3><p>上海黃金交易所及其國際業務，連接貴金屬交易、清算、交割同倉儲，讓境內外參與者接觸相關市場。</p><a href="https://en.sge.com.cn/eng_about_Overview" target="_blank" rel="noopener noreferrer">上海黃金交易所：機構介紹 ↗</a></article>
    <article><span class="money-code">HK / 香港</span><h3>本地交易與實物服務</h3><p>香港黃金交易所（HKGX）承接金銀業貿易場，提供黃金白銀交易及相關服務。金條存放、運送同保險，亦連到本地產業。</p><a href="https://hkgx.com.hk/en/about/whatis" target="_blank" rel="noopener noreferrer">HKGX：認識香港黃金交易所 ↗</a></article>
  </div>
  <div class="finance-takeaway"><strong>香港黃金交易所 HKGX，同港交所 HKEX 係唔同機構。</strong><p>港交所另有美元黃金期貨，產品條款包括實物交收安排。黃金期貨、場外黃金及金條零售，唔可以只因為都有「黃金」兩字就當成同一個市場。</p></div>
  <div class="finance-market-links">
    <a href="https://www.hkex.com.hk/Products/Listed-Derivatives/Commodities/USD-Gold?sc_lang=en" target="_blank" rel="noopener noreferrer"><strong>港交所：美元黃金產品原頁 ↗</strong><span>查產品規格、交易及交收安排；報價如有顯示，以官方原頁嘅時間及狀態為準。</span></a>
    <a href="https://hkgx.com.hk/hk" target="_blank" rel="noopener noreferrer"><strong>香港黃金交易所：官方入口 ↗</strong><span>查機構、產品及市場資訊；唔係港交所旗下股票市場。</span></a>
  </div>
  <details class="finance-note"><summary>黃金發展，點樣寫入青年預算備忘？</summary><p>可以研究清算系統、保險、倉儲及物流帶來咩工作，再評估公共投入、受惠群組同成效。政府文件入面嘅擴容目標或試營運計劃，唔應寫成已經完成嘅成果。</p><p><a href="https://www.info.gov.hk/gia/general/202605/27/P2026052600501.htm" target="_blank" rel="noopener noreferrer">財經事務及庫務局：2026-05-27 立法會答覆 ↗</a> · <a href="./industries">連到金融、保險及物流行業</a> · <a href="../learn/budget-memo">寫青年預算備忘</a></p><p>比較黃金資料時，先分清價格、成交量、未平倉量、實際交割量及庫存。亦要核對貨幣、金衡盎司／克／公斤等單位，唔把唔同市場嘅數字直接相加。</p></details>
  <p class="finance-source">導讀及入口核對：2026-09-09。來源：LBMA、CME Group、上海黃金交易所、香港黃金交易所、香港交易所及財經事務及庫務局。外部原頁需連線閱讀。</p>
</section>
  </div>

<section class="finance-section" aria-labelledby="connections"><div class="finance-heading"><span class="monitor-kicker">03 / 將金融連到生活</span><h2 id="connections">數字一齊變，未必就係因果。</h2></div><div class="finance-market-grid"><article><h3>貨幣與物價</h3><p>除貨幣供應，仲要查需求、供應、進口價格同政策；唔用兩條線同升就落結論。</p><a href="./living-cost">住屋與生活成本 ↗</a></article><article><h3>市場與工作</h3><p>市場估值唔係金融業產出或就業人數；要分清行業實際提供咩服務。</p><a href="./industries">金融與保險行業 ↗</a></article><article><h3>公共資源</h3><p>提出支援措施時，要有政府收入、公共開支及受惠群組嘅證據。</p><a href="../learn/budget-memo">寫青年預算備忘 ↗</a></article></div></section>
<p class="site-assurances">定期官方快照 · 完成快取後離線閱讀 · 不提供買賣建議 · 外部官方入口需要連線</p>
</div>
