#!/usr/bin/env node
// 錄低每個 loader 嘅上游回應,做 test:checks 嘅離線 fixture。
//
//   npm run fixtures
//
// 點解需要:快照有 6 日新鮮期,期間 build 根本唔會跑 loader,
// 所以「改壞咗 transform」要等 6 日先浮現;CI 用 HKDM_OFFLINE=1 就永遠唔浮現。
// 有咗錄影,test:checks 就可以零網絡跑一次完整 transform,改壞即刻嘈。
//
// 錄影同快照係同一次抓取嘅兩面:快照係 transform 之後嘅結果,錄影係 transform 之前嘅輸入。
// 所以錄完之後,快照應該冇變(內容一樣)—— 呢個本身就係一個健康檢查。

import { CENSTATD_INDICATORS, FISCAL_INDICATORS, loadCenstatdIndicator, loadFiscalIndicator } from "../src/data/_lib/indicators.js";
import { PROPERTY_INDICATORS, loadPropertyIndicator } from "../src/data/_lib/property.js";
import { MONEY_INDICATORS, loadMoneyIndicator } from "../src/data/_lib/money.js";
import { withFixtureTransaction, fixturesTouched, fixtureDir } from "../src/data/_lib/http.js";
import { readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resetTableMetaCache } from "../src/data/_lib/censtatd.js";

if (process.env.HKDM_FIXTURES !== "record") {
  console.error("要用 `npm run fixtures` 行(佢會設 HKDM_FIXTURES=record)");
  process.exit(1);
}

const targets = [
  ...Object.keys(CENSTATD_INDICATORS).map((id) => ({ id, load: () => loadCenstatdIndicator(id) })),
  ...Object.keys(FISCAL_INDICATORS).map((id) => ({ id, load: () => loadFiscalIndicator(id) })),
  ...Object.keys(PROPERTY_INDICATORS).map((id) => ({ id, load: () => loadPropertyIndicator(id) })),
  ...Object.keys(MONEY_INDICATORS).map((id) => ({ id, load: () => loadMoneyIndicator(id) })),
];

let failed = 0;
for (const { id, load } of targets) {
  resetTableMetaCache();
  try {
    // 中途死咗就丟棄呢個指標嘅全部錄影 —— 唔可以留低半新半舊。
    const doc = await withFixtureTransaction(load);
    console.log(`  ok   ${id.padEnd(32)} ${doc.series.length} 點`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${id.padEnd(32)} ${error.message.split("\n")[0]}`);
  }
}
console.log(`\n${targets.length} 個指標,${failed} 個錄唔到`);

// 清孤兒 —— **只有全部成功先做**。
// 有指標失敗嘅話佢啲錄影已經回滾(冇被 touch),照清就會連舊錄影都刪埋,
// 之後 test:checks 就會話搵唔到錄影。
const dir = fixtureDir();
if (failed === 0 && existsSync(dir)) {
  const touched = fixturesTouched();
  const orphans = (await readdir(dir)).filter((name) => name.endsWith(".gz") && !touched.has(name));
  for (const name of orphans) await rm(join(dir, name), { force: true });
  if (orphans.length > 0) {
    console.log(`清走 ${orphans.length} 個冇人再讀嘅舊錄影(改咗登記冊之後留低嘅):`);
    for (const name of orphans) console.log(`  - ${name}`);
  }
}

if (failed > 0) process.exit(1);
