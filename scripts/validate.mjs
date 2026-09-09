#!/usr/bin/env node
// 驗證 src/data/_snapshots/ 入面每一份 JSON 都符合 SPEC 第 5 節 schema。
//
// 三個地方會跑:
//   · **每次 `npm run build` 開頭** —— 呢個係 6 日新鮮期嘅其中一道補鑊閘:
//     快照未過期嘅時候 loader 根本唔會跑,所以「改咗 schema 但舊快照唔合規」
//     呢種情況淨靠 loader 係捉唔到嘅。呢度零網絡、秒跑,所以擺喺 build 前面唔嘥時間。
//   · GitHub Actions 抓完數之後 —— 唔合規就唔准 commit
//   · 本機 `npm run validate`
//
// 同時驗 manual/:嗰啲檔係人手改嘅,改壞咗 loader 一樣唔會即刻知。
// 驗法係真係行一次 loadManualIndicator()(離線),所以連「十組相加對唔上總額」
// 呢類抄錯都會喺呢度捉到。
//
// 注意:loader 本身已經喺 finaliseIndicator() 度驗過一次,build 會 fail。
// 呢個 script 係第二道閘,查嘅係「已經入咗 repo 嘅檔案」——
// 因為快照係人手改得嘅(manual/ 嗰批就係人手填),改壞咗 loader 唔會知。
//
// 刻意唔用 ANSI 顏色 —— 呢啲輸出主要喺 GitHub Actions log 度睇。

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { SNAPSHOT_DIR } from "../src/data/_lib/snapshot.js";
import { validateIndicator, REQUIRED_FIELDS } from "../src/data/_lib/schema.js";
import { loadManualIndicator, MANUAL_DIR } from "../src/data/_lib/manual.js";
import { assertSeparatedExpenditureSources } from "./expenditure-scope-gate.mjs";
import { readCitySnapshot, CITY_KINDS } from "../src/data/_lib/city-feeds.js";
import { validateMacauGeography } from "../src/data/_lib/macau-geography-check.js";
import { macauPlaces } from "../src/components/macau-places.js";
import { fileURLToPath } from "node:url";

/**
 * SPEC 第 5 節之外,本專案自己加嘅底線。
 *
 * licence_url / source_note_zh:SPEC 第 2 節硬規則第 3 條要學生喺同一頁
 * 見到出處。淨係一個授權名撳唔到,見唔到條款原文。
 * category / question_zh:SPEC 第 9 節嘅教學層,冇就出唔到指標卡。
 */
const EXTRA_REQUIRED = ["licence_url", "category", "question_zh", "fetched_at", "content_hash"];

async function main() {
  let files;
  try {
    files = (await readdir(SNAPSHOT_DIR)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    console.error(`FAIL 搵唔到 ${SNAPSHOT_DIR}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error("FAIL src/data/_snapshots/ 係空的。行一次 `npm run build` 先。");
    process.exit(1);
  }

  let failures = 0;

  // 呢度接真實 src,唔依賴 loader 有冇因快照新鮮期而跳過。
  try {
    await assertSeparatedExpenditureSources(fileURLToPath(new URL("../src/", import.meta.url)));
    console.log("ok   expenditure scopes     政府／公共開支分開顯示");
  } catch (error) {
    failures += 1;
    console.error(`FAIL expenditure scopes — ${error.message}`);
  }

  try {
    const geography = JSON.parse(await readFile(new URL("../src/data/macau-geography.json", import.meta.url), "utf8"));
    const result = validateMacauGeography(geography, macauPlaces);
    if (!result.ok) throw new Error(result.errors.join("；"));
    console.log("ok   Macau geography       離線輪廓、定位及來源");
  } catch (error) {
    failures += 1;
    console.error(`FAIL Macau geography — ${error.message}`);
  }

  for (const file of files) {
    const label = file.replace(/\.json$/, "");
    const problems = [];

    let doc;
    try {
      doc = JSON.parse(await readFile(join(SNAPSHOT_DIR, file), "utf8"));
    } catch (error) {
      console.error(`FAIL ${label} — JSON 讀唔到:${error.message}`);
      failures += 1;
      continue;
    }

    const { ok, errors } = validateIndicator(doc);
    if (!ok) problems.push(...errors);

    if (doc.indicator_id !== label) {
      problems.push(`檔名 ${label}.json 同 indicator_id "${doc.indicator_id}" 對唔上`);
    }
    for (const field of EXTRA_REQUIRED) {
      if (doc[field] === undefined || doc[field] === null || doc[field] === "") {
        problems.push(`缺少 ${field}`);
      }
    }

    // SPEC 第 2 節硬規則第 2 條:零個人資料。
    // 統計處嘅 tb_src 原文係帶查詢電郵嘅,censtatd.js 會剝走 —— 呢度做最後把關。
    const email = JSON.stringify(doc).match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);
    if (email) {
      problems.push(`資料入面有電郵地址 ${email[0]} —— 應該喺 tableInfo() 剝走`);
    }

    if (problems.length > 0) {
      failures += 1;
      console.error(`FAIL ${label}`);
      for (const problem of problems) console.error(`       ${problem}`);
    } else {
      const span = `${doc.coverage?.start ?? "?"}-${doc.coverage?.end ?? "?"}`;
      console.log(
        `ok   ${label.padEnd(22)} ${String(doc.series.length).padStart(4)} 點  ` +
          `${span.padEnd(14)} v${doc.data_version}  ${doc.acquisition}`
      );
    }
  }

  // 城市快照使用獨立 schema；唔混入統計 series。讀取即驗 schema/hash。
  for (const kind of CITY_KINDS) {
    try {
      const doc = await readCitySnapshot(kind);
      if (!doc) throw new Error("缺少城市快照");
      console.log(`ok   city/${kind} ${doc.records.length} 筆 ${doc.fetched_at}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL city/${kind} — ${error.message}`);
    }
  }

  // ── manual/ ──────────────────────────────────────────────────
  // 真係行一次 loader(離線),咁「十組相加對唔上總額」呢類抄錯都會喺呢度爆。
  let manualFiles = [];
  try {
    manualFiles = (await readdir(MANUAL_DIR)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    manualFiles = [];
  }

  for (const file of manualFiles) {
    const id = file.replace(/\.json$/, "");
    try {
      const doc = await loadManualIndicator(id);
      // manual 檔本身冇 data_version(佢係輸入,唔係輸出),補一個先驗。
      const { ok, errors } = validateIndicator({ ...doc, data_version: "2026.01.1" });
      if (!ok) {
        failures += 1;
        console.error(`FAIL manual/${file}`);
        for (const problem of errors) console.error(`       ${problem}`);
      } else {
        console.log(
          `ok   manual/${id.padEnd(20)} ${String(doc.series.length).padStart(4)} 點  ` +
            `${doc.manual_status === "todo" ? "未填數" : doc.manual_filled}`
        );
      }
    } catch (error) {
      failures += 1;
      console.error(`FAIL manual/${file}`);
      console.error(`       ${error.message.split("\n")[0]}`);
    }
  }

  console.log(
    `\n${files.length} 份指標快照 + ${CITY_KINDS.length} 份城市快照 + ${manualFiles.length} 份人手數據,${failures} 個唔合格。` +
      `\nSPEC 第 5 節必要欄位:${REQUIRED_FIELDS.join("、")}`
  );

  if (failures > 0) process.exit(1);
}

await main();
