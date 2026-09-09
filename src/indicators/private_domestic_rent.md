---
title: 私人住宅租金指數
keywords: 房屋 樓價 租金 物價 生活成本 私人住宅 差餉物業估價署 指數 預算
---

```js
import { indicatorHeader, indicatorAnchors, indicatorNote } from "../components/indicator-page.js";
import { indicatorChart } from "../components/indicator-chart.js";
import { dataTable } from "../components/data-table.js";
import { sourceFooter } from "../components/source-footer.js";
import { learningGuidance } from "../components/learning-guidance.js";
const indicator = await FileAttachment("../data/private_domestic_rent.json").json();
```

<h1 id="private-domestic-rent">私人住宅租金指數</h1>

```js
display(indicatorHeader(indicator));
display(indicatorAnchors(indicator));
```

<h2 id="chart">租屋市場，長期點變？</h2>

指數反映全港各類私人住宅租金變化，唔係一個家庭每月要交嘅租金金額。1999 年平均指數設為 100；租金口徑唔包括差餉及管理費，亦唔等同消費物價指數內嘅住屋類別。

```js
display(resize((width) => indicatorChart(indicator, width)));
display(indicatorNote(indicator));
display(learningGuidance(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator));
```

<h2 id="connections">由住屋數據，問到公共需要</h2>

- [住屋與生活成本](../explore/living-cost)：連起樓價、租金、九類物價同收入。
- [各區住戶月入中位數](./district_household_income)：全港指數唔代表個別地區或家庭。
- [公共經常開支](./public_expenditure_policy_groups)：討論住屋支援，要連房委會一齊計。
- [青年預算備忘](../learn/budget-memo)：講清楚想支援租客、置業者定其他群組，仲欠邊啲證據。
