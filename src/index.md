---
title: 香港數據監測站
keywords: 香港 數據 統計 開放數據 中學 公民 經濟 社會 分餅 預算 備忘
toc: false
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

<h1 id="home">香港數據監測站</h1>

<p class="lede">
由生活問題出發，用香港公開數據建立論點，再討論公共資源應該點分。
</p>

<h2 id="learning-routes">揀一條學習路線</h2>

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

<p class="site-assurances">每頁有官方來源同數據日期 · 唔收集個人資料 · 完成離線快取後可離線閱讀</p>

<h2 id="indicators">直接揀指標</h2>

已經有研究問題？揀相關指標，先睇日期、單位同「未能證明甚麼」，再引用數字。

```js
display(html`<div class="card-grid">${indicators.map((indicator) => indicatorCard(indicator))}</div>`);
```

<h2 id="how-to-use">由睇數到講理由</h2>

先用一句話講清楚你想研究嘅問題。記低數字講緊邊類人、邊個時期同邊種口徑，
再分開寫「數據顯示咩」同「我建議點做」。同學可以用相同證據提出唔同建議，重點係交代理由同取捨。

<div class="callout">

**寫功課引用嘅時候**,唔好淨係寫「網上資料顯示」。每一頁下面都有「資料來源」一欄,
入面有機構全名、原文連結同數據截至日期 —— 三樣加埋先算一個站得住嘅出處。

</div>

<h2 id="status">待填數據點處理</h2>

公屋輪候時間同公共經常開支十個政策組別要人手核對官方文件。
標示「數據未填」嘅頁面仍待抄數，未填唔代表零，亦唔會喺上面顯示指標卡。
如果你嘅論點需要嗰部分數據，先記低證據缺口，等核對完成再落結論。
