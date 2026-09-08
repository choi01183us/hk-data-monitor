---
title: 科技與香港
keywords: 科技 創科 研發 上網 數碼 共融 青年 就業 技能 創新 人工智能 AI 預算
sidebar: false
toc: false
---

```js
import { technologyExplorer } from "../components/technology-explorer.js";

const indicators = await Promise.all([
  FileAttachment("../data/rd_expenditure.json").json(),
  FileAttachment("../data/household_internet.json").json(),
  FileAttachment("../data/unemployment.json").json(),
  FileAttachment("../data/median_wage.json").json(),
  FileAttachment("../data/household_income.json").json(),
  FileAttachment("../data/fiscal_reserves.json").json(),
]);
```

<div class="monitor-home technology-page">

<header class="monitor-header">
  <div class="monitor-brand">
    <span class="monitor-brand__mark" aria-hidden="true">HK</span>
    <div><span class="monitor-kicker">主題探索 · 科技與社會</span><h1 id="technology">科技與香港</h1></div>
  </div>
  <nav class="monitor-nav" aria-label="科技專區導覽">
    <a href="../">香港總覽</a>
    <a class="monitor-nav__primary" href="../learn/budget-memo">寫青年預算備忘 <span aria-hidden="true">↗</span></a>
  </nav>
</header>

<div class="technology-intro">
  <span class="monitor-kicker">由科技投入，問到市民需要</span>
  <h2 id="connected-data">一個議題，連起幾種證據。</h2>
  <p>研究做多咗，點樣令青年受惠？服務搬上網，邊啲人可能跟唔上？揀一個主題，由官方數據出發，再追問需要、成本同成效。</p>
</div>

```js
display(technologyExplorer(indicators));
```

<section class="technology-memo" aria-labelledby="technology-memo">
  <div><span class="monitor-kicker">將探索帶入課堂</span><h2 id="technology-memo">為科技建議加上證據</h2></div>
  <p>喺課堂文件寫低：「我想改善＿＿；呢份資料顯示＿＿；但仲缺＿＿；所以我建議先查＿＿，再決定資源點分。」</p>
  <a href="../learn/budget-memo">打開青年預算備忘工作紙 <span aria-hidden="true">↗</span></a>
</section>

<p class="site-assurances">本站數據及主題切換可於完成快取後離線使用；延伸官方網站需要連線。各指標有自己嘅時期同更新日期。</p>

</div>
