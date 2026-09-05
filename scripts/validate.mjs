#!/usr/bin/env node
// 驗證 src/data/_snapshots/ 入面每一份 JSON 都符合 SPEC 第 5 節 schema。
//
// 兩個地方會跑:
//   · GitHub Actions 抓完數之後 —— 唔合規就唔准 commit
//   · 本機 `npm run validate`
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

  console.log(
    `\n${files.length} 份快照,${failures} 個唔合格。` +
      `\nSPEC 第 5 節必要欄位:${REQUIRED_FIELDS.join("、")}`
  );

  if (failures > 0) process.exit(1);
}

await main();
