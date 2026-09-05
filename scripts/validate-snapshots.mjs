#!/usr/bin/env node
// 驗證 data/snapshots/ 入面每一份 JSON 都符合 schema。
//
// 兩個地方會跑：
//   · GitHub Actions 抓完數之後 —— 唔合規就唔准 commit
//   · 本機 `npm run validate`
//
// 呢個係「唔准寫壞資料落 repo」嘅最後一道閘，所以佢自己唔可以太寬鬆：
// 除咗 schema，仲會查授權欄位齊唔齊、有冇指標喺登記冊入面搵唔到。
//
// 刻意唔用 ANSI 顏色 —— 呢啲輸出主要係喺 GitHub Actions log 度睇。

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { SNAPSHOT_DIR } from "../lib/snapshot.mjs";
import { validateIndicator, REQUIRED_FIELDS } from "../lib/schema.mjs";
import { INDICATORS } from "../lib/indicators.mjs";

/** 除咗 schema 之外，額外要求嘅欄位 —— 呢啲係「畀學生睇」嘅底線。 */
const EXTRA_REQUIRED = ["licence_url", "attribution_zh", "category", "question_zh", "fetched_at"];

async function main() {
  let files;
  try {
    files = (await readdir(SNAPSHOT_DIR)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    console.error(`FAIL 搵唔到 ${SNAPSHOT_DIR}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error("FAIL data/snapshots/ 係空的。行 `npm run refresh` 先。");
    process.exit(1);
  }

  const registered = new Map(INDICATORS.map((spec) => [spec.indicator_id, spec]));
  const seen = new Set();
  let failures = 0;

  for (const file of files) {
    const path = join(SNAPSHOT_DIR, file);
    const label = file.replace(/\.json$/, "");
    const problems = [];

    let doc;
    try {
      doc = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      console.error(`FAIL ${label} — JSON 讀唔到：${error.message}`);
      failures += 1;
      continue;
    }

    const { ok, errors } = validateIndicator(doc);
    if (!ok) problems.push(...errors);

    if (doc.indicator_id !== label) {
      problems.push(`檔名 ${label}.json 同 indicator_id "${doc.indicator_id}" 對唔上`);
    }
    if (!registered.has(doc.indicator_id)) {
      problems.push(`indicator_id "${doc.indicator_id}" 唔喺 lib/indicators.mjs 登記冊入面`);
    }
    for (const field of EXTRA_REQUIRED) {
      if (doc[field] === undefined || doc[field] === null || doc[field] === "") {
        problems.push(`缺少 ${field}`);
      }
    }
    // 私隱底線：靜態資料入面唔應該出現任何似個人資料嘅嘢。
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(JSON.stringify(doc))) {
      problems.push("資料入面有似電郵地址嘅字串 — 呢個站唔應該有任何個人資料");
    }

    seen.add(doc.indicator_id);

    if (problems.length > 0) {
      failures += 1;
      console.error(`FAIL ${label}`);
      for (const problem of problems) console.error(`       ${problem}`);
    } else {
      const span = `${doc.coverage?.start ?? "?"}-${doc.coverage?.end ?? "?"}`;
      console.log(
        `ok   ${label.padEnd(26)} ${String(doc.series.length).padStart(4)} 點  ${span.padEnd(22)} ${doc.data_version}`
      );
    }
  }

  const missing = INDICATORS.filter((spec) => !seen.has(spec.indicator_id));
  for (const spec of missing) {
    console.warn(`warn ${spec.indicator_id} 已登記但未有快照 — 行 \`npm run refresh\``);
  }

  console.log(
    `\n${files.length} 份快照，${failures} 個唔合格，${missing.length} 個未抓。` +
      `\n必要欄位：${REQUIRED_FIELDS.join("、")}`
  );

  if (failures > 0) process.exit(1);
}

await main();
