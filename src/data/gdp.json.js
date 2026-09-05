// data loader:人均本地生產總值(統計處表 310-31001)
//
// 設定喺 src/data/_lib/indicators.js。呢度淨係負責交貨。
//
// ⚠️ 對 SPEC 第 6 節嘅偏離,已記錄喺 findings.md 第 8 節:
//    SPEC 第 5 行寫「gdp | GDP 及人均 GDP」,但總額單位係「百萬港元」、
//    人均係「港元」,差 7 個數量級,而 schema 得一個 unit_zh。
//    夾硬擺埋一齊就要用雙 Y 軸,直接違反 SPEC 第 9 節。所以呢度只做人均。

import { loadCenstatdIndicator } from "./_lib/indicators.js";
import { loadIndicator } from "./_lib/snapshot.js";

const indicator = await loadIndicator("gdp", () => loadCenstatdIndicator("gdp"));
process.stdout.write(JSON.stringify(indicator));
