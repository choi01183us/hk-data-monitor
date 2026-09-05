---
title: 香港數據監測站
keywords: 香港 數據 統計 開放數據 中學 通識 公民
toc: false
---

```js
import { indicatorCard } from "./components/indicator-card.js";

const indicators = await Promise.all([
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
]);
```

<h1 id="home">香港數據監測站</h1>

<p class="lede">
用真實嘅香港公開數據,砌你自己嘅論點。每個數字都撳得入去睇返政府原本嗰版。
</p>

<div class="promises">
  <div class="promise">
    <strong>每個數字都有出處</strong>
    <span>來源機構、原文連結、數據截至日期,全部喺同一頁見到。</span>
  </div>
  <div class="promise">
    <strong>唔收集你任何資料</strong>
    <span>冇帳戶、冇 cookie、冇分析工具。你睇過乜,冇人知。</span>
  </div>
  <div class="promise">
    <strong>冇網絡都用到</strong>
    <span>數據喺建置嗰陣已經焗死咗做靜態檔,唔使等載入。</span>
  </div>
</div>

<h2 id="indicators">指標</h2>

```js
display(html`<div class="card-grid">${indicators.map((indicator) => indicatorCard(indicator))}</div>`);
```

<h2 id="how-to-use">點樣用呢個站</h2>

呢個站係配合三個課堂活動整嘅:

- **模擬社會體驗** — 扮角色做理財決策嗰陣,喺度攞真實薪金、物價做背景
- **資源裁定會議(分餅)** — 決定政府啲錢點分之前,先睇下真實嘅開支結構
- **青年預算備忘** — 寫財政建議書要引用官方數字,喺度撳個來源連結就抄得

<div class="callout">

**寫功課引用嘅時候**,唔好淨係寫「網上資料顯示」。每一頁下面都有「資料來源」一欄,
入面有機構全名、原文連結同數據截至日期 —— 三樣加埋先算一個站得住嘅出處。

</div>

<h2 id="status">呢個站砌到邊</h2>

11 個指標已經接通,全部由官方 API 自動抓、每個都有出處同數據截至日期。
仲有兩個要人手抄(公屋輪候時間、十個政策組別嘅開支),詳情見 repo 入面嘅 `findings.md`。
