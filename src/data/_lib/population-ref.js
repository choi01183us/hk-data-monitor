// 畀其他指標做「每名市民」換算用嘅人口序列(SPEC 第 9 節:用當年人口做分母)。
//
// 刻意讀 **已入 git 嘅快照**,唔係即場再抓:
//   1. Framework 嘅 loader 係並行跑嘅,冇保證 population 會先過其他指標抓完
//   2. 人口一年變 1% 唔到,用上一次 commit 嘅快照做分母,誤差可以忽略
//   3. 抓唔到人口唔應該令政府開支個指標死埋 —— 冇分母就唔出嗰個錨點,其他照出
//
// 快照唔存在(例如全新 clone 未跑過 population)就回 null,呼叫者要自己處理。

import { readSnapshot } from "./snapshot.js";

export async function readPopulationSeries() {
  const doc = await readSnapshot("population");
  if (!doc || !Array.isArray(doc.series)) {
    process.stderr.write("[hk-data-monitor] 冇 population 快照,「每名市民」錨點會跳過\n");
    return null;
  }
  return doc.series;
}
