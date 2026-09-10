---
title: 公共服務與預算
keywords: 社會福利 綜援 長者 兒童 青年 康復 在職家庭津貼 教育 學校 SEN 特殊教育 學生資助 大學 醫療 醫院 醫管局 醫生 衞生 預算 財政 撥款 輪候 成效
sidebar: false
toc: false
---

```js
import {publicServicesPage} from "../components/service-budget-view.js";
const indicator = await FileAttachment("../data/service_programme_provision.json").json();
display(publicServicesPage(indicator));
```
