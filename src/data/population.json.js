// data loader:香港人口(統計處表 110-01001)
//
// 設定喺 src/data/_lib/indicators.js。
//
// 點解排喺 gdp 之後即刻做:SPEC 第 9 節要求嘅對比錨點
// (「相當於每名香港市民 $X」)要用當年人口做分母,所以其他指標等緊佢。

import { loadCenstatdIndicator } from "./_lib/indicators.js";
import { loadIndicator } from "./_lib/snapshot.js";

const indicator = await loadIndicator("population", () => loadCenstatdIndicator("population"));
process.stdout.write(JSON.stringify(indicator));
