// 「上一版一定保得住」嘅機制。
//
// data/snapshots/<indicator_id>.json 係入咗 git 嘅靜態快照，亦即係網站真正食嘅資料。
// 抓數成功 → 只有當內容真係變咗先覆蓋（唔會為咗一個新 timestamp 而 commit）。
// 抓數失敗 → 原封不動保留舊檔，畫面標明「呢個係上次成功更新嘅數字」。
//
// 因此 GitHub Actions 就算某個 API 掛咗，網站都仲有數睇，唔會變空白。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { computeDataVersion, validateIndicator } from "./schema.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** 專案根目錄 = lib/ 上面一層。唔靠 process.cwd()，因為 data loader 嘅 cwd 唔係我哋話事。 */
export const PROJECT_ROOT = join(HERE, "..");
export const SNAPSHOT_DIR = join(PROJECT_ROOT, "data", "snapshots");

export function snapshotPath(indicatorId) {
  return join(SNAPSHOT_DIR, `${indicatorId}.json`);
}

/** 讀返上一版。讀唔到／壞咗都回 null，唔會 throw — 呼叫者要自己決定點算。 */
export async function readSnapshot(indicatorId) {
  const path = snapshotPath(indicatorId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * 寫入快照，但只喺 data_version 變咗先寫。
 *
 * 咁做嘅原因：每星期跑 refresh 都會有新 fetched_at，如果照寫，
 * 每次都會多一個「其實乜都冇變」嘅 commit。data_version 唔計 fetched_at，
 * 所以數冇變 = 檔案冇變 = `git diff --quiet` 乾淨。
 */
export async function writeSnapshot(indicatorId, doc) {
  const { ok, errors } = validateIndicator(doc);
  if (!ok) {
    throw new Error(`拒絕寫入 ${indicatorId}：\n  - ${errors.join("\n  - ")}`);
  }

  const previous = await readSnapshot(indicatorId);
  if (previous && previous.data_version === doc.data_version) {
    return { written: false, reason: "unchanged", data_version: doc.data_version };
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

/** 快照舊過幾耐先值得再上網攞？預設 6 日，配合每週一次嘅 cron。 */
const DEFAULT_MAX_AGE_MS = 6 * 24 * 60 * 60 * 1000;

function ageMs(doc) {
  const stamp = Date.parse(doc?.fetched_at ?? "");
  return Number.isNaN(stamp) ? Number.POSITIVE_INFINITY : Date.now() - stamp;
}

/**
 * 攞一個指標嘅最新資料，順序如下：
 *
 *   1. HKDM_OFFLINE=1        → 完全唔上網，直接用快照（本機／飛機上都砌到個站）
 *   2. 快照仲新 && 冇 force  → 用快照（build 快、唔會無謂撼 API）
 *   3. 上網抓                → 成功就寫返落快照
 *   4. 抓唔到                → 退返去快照，標記 stale
 *   5. 連快照都冇            → 到呢步先真係要 throw
 *
 * @param {string} indicatorId
 * @param {() => Promise<object>} fetcher  回傳一份經 buildIndicator() 造好嘅文件
 */
export async function loadIndicator(indicatorId, fetcher, options = {}) {
  const { maxAgeMs = DEFAULT_MAX_AGE_MS } = options;
  const offline = process.env.HKDM_OFFLINE === "1";
  const force = process.env.HKDM_REFRESH === "1";

  const snapshot = await readSnapshot(indicatorId);

  if (offline) {
    if (!snapshot) throw new Error(`HKDM_OFFLINE=1 但 ${indicatorId} 冇快照可用`);
    return annotate(snapshot, { source_of_truth: "snapshot", reason: "offline" });
  }

  if (snapshot && !force && ageMs(snapshot) < maxAgeMs) {
    return annotate(snapshot, { source_of_truth: "snapshot", reason: "fresh" });
  }

  try {
    const fresh = await fetcher();
    await writeSnapshot(indicatorId, fresh);
    return annotate(fresh, { source_of_truth: "live" });
  } catch (error) {
    if (!snapshot) {
      throw new Error(`${indicatorId} 抓唔到，而且冇上一版可以退返去：${error.message}`, { cause: error });
    }
    process.stderr.write(`[hk-data-monitor] ${indicatorId} 抓數失敗，改用上一版快照：${error.message}\n`);
    return annotate(snapshot, {
      source_of_truth: "snapshot",
      reason: "fetch_failed",
      stale_reason: error.message,
    });
  }
}

/**
 * 加返「呢份資料點嚟」嘅註記。
 *
 * 注意：呢啲欄位只加喺送去前端嗰份，唔會寫入 data/snapshots/。
 * 快照檔要保持乾淨，唔可以記住某一次 build 嘅偶發狀態。
 */
function annotate(doc, { source_of_truth, reason, stale_reason }) {
  const stale = source_of_truth === "snapshot" && reason === "fetch_failed";
  return {
    ...doc,
    build: {
      source_of_truth,
      reason: reason ?? "live",
      stale,
      stale_reason: stale_reason ?? null,
      // 唔用 Date.now() 直接入 data_version，所以呢個欄位唔會影響「有冇變」嘅判斷。
      built_at: new Date().toISOString(),
    },
  };
}

export { computeDataVersion };
