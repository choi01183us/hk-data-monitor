---
title: 公共服務綱領財政撥款
keywords: 社會福利 教育 醫療 綱領 財政 撥款 開支預算 財政年度 百萬元 預算 修訂 實際
---

```js
import {publicServicesExplorer} from "../components/service-budget-view.js";
import {dataTable} from "../components/data-table.js";
import {sourceFooter} from "../components/source-footer.js";
import {indicatorNote} from "../components/indicator-page.js";
const indicator = await FileAttachment("../data/service_programme_provision.json").json();
```

<h1 id="service-programme-provision">公共服務綱領財政撥款</h1>

[公共服務與預算：連起撥款、服務需要與成效](../explore/public-services)

```js
display(publicServicesExplorer(indicator));
display(indicatorNote(indicator));
display(dataTable(indicator));
display(sourceFooter(indicator, {period: "2026-27"}));
```
