// SPEC 第 7 節嘅 fail-soft 機制。
//
//   「任何一個 loader 抓唔到數,保留 repo 入面上一版 JSON,
//     唔好覆蓋、唔好清空、唔好用空陣列頂替。」
//
// 「上一版 JSON」實際住喺 src/data/_snapshots/<indicator_id>.json,入咗 git。
//
// 點解要另開一個目錄,而唔係用 Framework 自己個 cache?
//   Framework 嘅 loader 輸出去 src/.observablehq/cache/,嗰個係建置快取:
//   `observable build` 會用 useStale 模式,見到快取就**唔會**再跑 loader。
//   如果把「上一版」擺喺快取入面,每次 build 都會靜靜哋出舊數,
//   而且 clean build 之後就乜都冇。所以要有一個明文入 git、由我哋自己管嘅副本。
//
// 抓數成功 -> 只有內容真係變咗先覆寫(唔會為咗一個新 timestamp 而 commit)
// 抓數失敗 -> 原封不動保留舊檔,畫面標明「呢個係上次成功更新嘅數字」
// 連舊檔都冇 -> 先至 throw(見下面 loadIndicator 嘅註解)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateIndicator, nextDataVersion } from "./schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));

// 唔用 process.cwd():data loader 嘅 cwd 係「你喺邊度跑 observable build」,
// 唔一定係專案根目錄,唔可以靠。
export const SNAPSHOT_DIR = join(HERE, "..", "_snapshots");

export function snapshotPath(indicatorId) {
  return join(SNAPSHOT_DIR, `${indicatorId}.json`);
}

/** 讀返上一版。讀唔到或者壞咗都回 null,由呼叫者決定點算。 */
export async function readSnapshot(indicatorId) {
  const path = snapshotPath(indicatorId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    process.stderr.write(`[hk-data-monitor] ${indicatorId} 嘅快照讀唔到(${error.message}),當佢冇。\n`);
    return null;
  }
}

/** 今日,YYYY-MM-DD。data_version 用。 */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 把 buildIndicator() 出嚟嘅文件補上 data_version,然後驗一次。
 *
 * data_version 要知上一版係乜先定得到(SPEC 第 5 節:內容有變就遞增),
 * 所以呢一步唔可以喺 buildIndicator() 入面做。
 */
export function finaliseIndicator(doc, previous) {
  const finalised = {
    ...doc,
    data_version: nextDataVersion(previous, doc.content_hash, today()),
  };

  const { ok, errors } = validateIndicator(finalised);
  if (!ok) {
    // 分階段指令第 2 步驗收:「故意整壞一個 loader 嘅輸出,build 要 fail 並準確指出問題。」
    throw new Error(
      `指標 ${doc.indicator_id ?? "(冇 id)"} 唔符合 SPEC 第 5 節 schema:\n` +
        errors.map((e) => `  - ${e}`).join("\n")
    );
  }
  return finalised;
}

/**
 * 寫入快照,但只喺內容真係變咗先寫。
 *
 * SPEC 第 7 節:「每次數據有實際變動先 commit。無變動唔好留空 commit。」
 * content_hash 唔計 fetched_at,所以數冇變 = 檔案 byte 對 byte 一樣 =
 * `git diff --quiet` 乾淨 = Actions 唔會 commit。
 */
export async function writeSnapshot(indicatorId, doc) {
  const previous = await readSnapshot(indicatorId);
  if (previous && previous.content_hash === doc.content_hash) {
    return { written: false, reason: "unchanged", data_version: previous.data_version };
  }

  await mkdir(SNAPSHOT_DIR, { recursive: true });
  await writeFile(snapshotPath(indicatorId), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return {
    written: true,
    reason: previous ? "changed" : "created",
    data_version: doc.data_version,
    previous_data_version: previous?.data_version ?? null,
  };
}

/** 快照舊過幾耐先值得再上網攞?預設 6 日,配合每週一次嘅 cron。 */
const DEFAULT_MAX_AGE_MS = 6 * 24 * 60 * 60 * 1000;

function ageMs(doc) {
  const stamp = Date.parse(doc?.fetched_at ?? "");
  return Number.isNaN(stamp) ? Number.POSITIVE_INFINITY : Date.now() - stamp;
}

/**
 * 攞一個指標嘅資料,順序如下:
 *
 *   1. HKDM_OFFLINE=1        -> 完全唔上網,直接用快照(飛機上都砌到個站)
 *   2. 快照仲新 && 冇 force  -> 用快照(本機 build 快,亦唔會無謂撼人哋個 API)
 *   3. 上網抓                -> 成功就寫返落快照
 *   4. 抓唔到 + 有快照        -> 退返去快照,標記 stale。**build 照樣成功**(SPEC 第 7 節)
 *   5. 抓唔到 + 冇快照        -> throw,build fail
 *
 * 第 5 種情況睇落同 SPEC 第 7 節「全部失敗 build 仍要成功」有衝突,其實冇:
 * 冇快照即係呢個指標由頭到尾未成功抓過一次,亦即係開發緊新指標嗰陣先會撞到,
 * 唔會喺每週 cron 度發生(cron 跑嗰陣 repo 一定已經有上一版)。
 * 呢種時候應該大聲 fail —— SPEC 第 2 節硬規則第 4 條:
 * 「攞唔到就 fail,並喺 build log 講清楚」,唔准用估算值頂上。
 *
 * @param {string} indicatorId
 * @param {() => Promise<object>} fetcher  回傳一份 buildIndicator() 造好嘅文件
 */
export async function loadIndicator(indicatorId, fetcher, options = {}) {
  const { maxAgeMs = DEFAULT_MAX_AGE_MS } = options;
  const offline = process.env.HKDM_OFFLINE === "1";
  const force = process.env.HKDM_REFRESH === "1";

  const snapshot = await readSnapshot(indicatorId);

  if (offline) {
    if (!snapshot) throw new Error(`HKDM_OFFLINE=1 但 ${indicatorId} 冇快照可用`);
    return annotate(snapshot, { mode: "snapshot", reason: "offline" });
  }

  if (snapshot && !force && ageMs(snapshot) < maxAgeMs) {
    return annotate(snapshot, { mode: "snapshot", reason: "fresh" });
  }

  try {
    const fresh = finaliseIndicator(await fetcher(), snapshot);
    const result = await writeSnapshot(indicatorId, fresh);
    process.stderr.write(
      `[hk-data-monitor] ${indicatorId}: ${result.reason}` +
        `${result.written ? ` -> data_version ${result.data_version}` : ""}\n`
    );
    return annotate(fresh, { mode: "live" });
  } catch (error) {
    if (!snapshot) {
      throw new Error(
        `${indicatorId} 抓唔到,而且冇上一版可以退返去。\n` +
          `  原因:${error.message}\n` +
          `  SPEC 第 2 節硬規則第 4 條:唔准用估算值頂上,所以喺度停低。`,
        { cause: error }
      );
    }
    // SPEC 第 7 節:保留上一版,build 照樣成功,但要喺 log 講清楚邊個失敗、點解。
    process.stderr.write(
      `[hk-data-monitor] FAIL-SOFT ${indicatorId}:抓數失敗,改用上一版快照 ` +
        `(data_version ${snapshot.data_version},截至 ${snapshot.updated_at})\n` +
        `  原因:${error.message}\n`
    );
    return annotate(snapshot, { mode: "snapshot", reason: "fetch_failed", staleReason: error.message });
  }
}

/**
 * 加返「呢份資料點嚟」嘅註記。
 *
 * 呢啲欄位只加喺送去前端嗰份,**唔會**寫入 src/data/_snapshots/。
 * 快照檔要保持乾淨,唔可以記住某一次 build 嘅偶發狀態,
 * 否則每次 build 都會產生 git 改動,就違反「無變動唔好留空 commit」。
 */
function annotate(doc, { mode, reason = "live", staleReason = null }) {
  return {
    ...doc,
    build: {
      mode,
      reason,
      stale: reason === "fetch_failed",
      stale_reason: staleReason,
      built_at: new Date().toISOString(),
    },
  };
}
