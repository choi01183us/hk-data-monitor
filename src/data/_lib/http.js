// 對外抓數嘅統一入口:逾時、重試、禮貌延遲、清楚嘅錯誤。
//
// 取態:寧願大聲失敗,都唔好靜靜哋回半份資料。
// 上層(snapshot.js)會接住錯誤,改用上一版 —— 即係 SPEC 第 7 節嘅 fail-soft。
// 呢個分工好重要:**呢一層唔准 fail-soft**,一 fail-soft 就會分唔清
// 「真係抓到」同「抓到一半」。

import { setTimeout as sleep } from "node:timers/promises";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 錄影／重播上游回應。
 *
 * 點解要有:快照有 6 日新鮮期,期間 `observable build` 根本唔會跑 loader,
 * 所以「改壞咗 loader 嘅 transform」呢類錯要等到 6 日後先浮現 —— 甚至 CI 用
 * HKDM_OFFLINE=1 就永遠唔會浮現。錄低一次上游回應之後,`npm run test:checks`
 * 就可以零網絡、秒速跑一次完整 transform,改壞即刻嘈。
 *
 *   HKDM_FIXTURES=record   跑 loader 順手錄低每個回應
 *   HKDM_FIXTURES=replay   完全唔上網,由錄影答
 *
 * 錄喺 HTTP 層而唔係逐個 loader 加參數:三個轉接器(統計處 POST、FSTB CSV、
 * 庫務署 JSON)一次過覆蓋,loader 一行都唔使改。
 */
// ⚠️ 每次讀 env,唔用 module 層 const。
//    module 層 const 會喺第一次 import 嗰刻定死,而 snapshot.js 一 import 就會
//    連帶載入呢個檔 —— 測試入面之後先設 HKDM_FIXTURES 就已經太遲,靜靜哋上咗網。
function fixtureMode() {
  return process.env.HKDM_FIXTURES ?? "";
}
const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "_fixtures");

/** 錄影檔名:睇得出係邊個來源,再加內容雜湊防撞。 */
function fixtureName(url, method, body) {
  const hash = createHash("sha256").update(`${method} ${url} ${body ?? ""}`).digest("hex").slice(0, 12);
  const slug = url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 60)
    .replace(/-+$/, "");
  // .gz:未壓縮嘅錄影加埋 4.1 MB,對一個只出 0.14 MB 資料嘅 repo 太重。
  // gzip 之後約 300 KB,而且 Node 嘅 gzip 對同一輸入係 byte 穩定嘅
  // (MTIME 欄位寫 0),所以重錄之後內容冇變就唔會令 git 見到改動。
  return `${slug}-${hash}.json.gz`;
}

async function readFixture(url, method, body) {
  const path = join(FIXTURE_DIR, fixtureName(url, method, body));
  if (!existsSync(path)) {
    throw new Error(
      `HKDM_FIXTURES=replay 但搵唔到錄影:${fixtureName(url, method, body)}\n` +
        `  URL: ${url}\n` +
        `  行 \`npm run fixtures\` 重新錄一次。`
    );
  }
  const fixture = JSON.parse(gunzipSync(await readFile(path)).toString("utf8"));
  return {
    text: fixture.body,
    response: new Response(fixture.body, { status: fixture.status, headers: fixture.headers }),
  };
}

/**
 * 判斷「錄影有冇實質改變」嗰陣要忽略嘅欄位。
 *
 * 統計處每次回應都會帶住呢三個:
 *   header.count.started / finished / durationSeconds
 * 實測同一條 query 打兩次,dataSet 完全一樣,但呢三個一定唔同。
 * 唔剔走嘅話,每週 cron 都會覺得「錄影變咗」而 commit 200 KB 無謂改動 ——
 * 直接違反 SPEC 第 7 節「無變動唔好留空 commit」。
 *
 * 只影響**比較**,唔影響儲存內容:錄影檔照樣係原封不動嘅回應,
 * 只不過入面嗰幾個時間戳係第一次錄嗰陣嘅值。對測試嚟講完全冇分別。
 */
function withoutVolatile(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed?.header?.count) {
      const { started, finished, durationSeconds, ...rest } = parsed.header.count;
      return JSON.stringify({ ...parsed, header: { ...parsed.header, count: rest } });
    }
    return text;
  } catch {
    // 唔係 JSON(例如 FSTB 嘅 CSV)就原文比較
    return text;
  }
}

async function writeFixture(url, method, body, text, response) {
  await mkdir(FIXTURE_DIR, { recursive: true });
  const headers = {};
  // 只留 loader 真係讀嘅 header。全部錄低會令錄影檔隨每次抓數而變(date、etag…),
  // 咁 git 就會日日見到改動。
  for (const name of ["content-type", "last-modified"]) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }
  const path = join(FIXTURE_DIR, fixtureName(url, method, body));
  const next = JSON.stringify({ url, method, status: response.status, headers, body: text });

  // 內容冇變就唔好覆寫。同 writeSnapshot 一樣嘅理由:每週 cron 都重錄一次,
  // 如果次次寫檔,就算上游一個字都冇變,git 都會見到 200 KB 改動 ——
  // 直接違反 SPEC 第 7 節「無變動唔好留空 commit」。
  if (existsSync(path)) {
    try {
      const previous = JSON.parse(gunzipSync(await readFile(path)).toString("utf8"));
      if (
        previous.status === response.status &&
        withoutVolatile(previous.body) === withoutVolatile(text)
      ) {
        return;
      }
    } catch {
      // 舊錄影讀唔到就當佢冇,照覆寫
    }
  }
  await writeFile(path, gzipSync(Buffer.from(next)));
}

/**
 * 公開 API 想知邊個喺度打佢。留一個搵到人嘅識別字串,唔好扮瀏覽器 ——
 * 我哋係一星期抓一次嘅教育用途機械人。
 */
// ⚠️ 只准 ASCII。HTTP header 係 ByteString(Latin-1),
// 寫咗中文會喺 fetch() 度掟 "Cannot convert argument to a ByteString" —— 撞過。
export const USER_AGENT =
  "hk-data-monitor/0.1 (+https://github.com/OWNER/hk-data-monitor; HK secondary-school open-data project)";

/**
 * 每個請求之間停一陣。
 *
 * 探路嗰陣統計處撞過間歇性 Azure WAF 403(8 連發),而金管局連續打 5 條之後
 * 會靜靜哋 hang 到 timeout。兩樣都唔係「條 URL 錯」,係打得太密。
 */
export async function politePause(ms = 1000) {
  // 重播模式冇打過任何人,唔使客氣,亦唔想令 test:checks 慢到冇人肯跑。
  if (fixtureMode() === "replay") return;
  await sleep(ms);
}

/**
 * 上游問題 —— **只有呢一類**先至行得 SPEC 第 7 節嘅 fail-soft。
 *
 * 包括:網絡去唔到、HTTP 狀態唔 ok、回應唔係合法 JSON、上游格式變咗。
 * 呢啲下星期再抓有機會好返,所以保留上一版係啱嘅。
 *
 * **唔包括**:schema 驗證失敗、cv code 寫錯、換算寫錯 —— 嗰啲係我哋自己嘅程式碼錯,
 * 下星期再抓一萬次都係一樣錯。嗰啲一律 hard fail(見 snapshot.js 嘅 loadIndicator)。
 *
 * 用 error **類型**分,唔用 message 分:message 係畀人睇嘅,改咗文案唔應該改變行為。
 */
export class UpstreamError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "UpstreamError";
  }
}

export class FetchFailed extends UpstreamError {
  constructor(message, { url, status, cause } = {}) {
    super(message, { cause });
    this.name = "FetchFailed";
    this.url = url;
    this.status = status;
  }
}

/**
 * 5xx、429、同網絡層錯誤值得重試。
 * 403 都要重試 —— 統計處個 WAF 係間歇性嘅,唔代表條 URL 錯。
 */
function worthRetrying(error) {
  if (error instanceof FetchFailed && typeof error.status === "number") {
    return error.status >= 500 || error.status === 429 || error.status === 403;
  }
  return true; // timeout / DNS / socket reset
}

async function request(url, options) {
  const { timeoutMs = 30_000, retries = 3, method = "GET", body, headers = {} } = options;

  // 重播模式:完全唔掂網絡。搵唔到錄影就大聲死,唔准靜靜哋跌返去上網。
  if (fixtureMode() === "replay") {
    return readFixture(url, method, body?.toString());
  }

  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        body,
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": USER_AGENT, ...headers },
      });

      if (!response.ok) {
        throw new FetchFailed(`HTTP ${response.status} ${response.statusText}`, {
          url,
          status: response.status,
        });
      }

      const text = await response.text();
      if (fixtureMode() === "record") {
        await writeFixture(url, method, body?.toString(), text, response);
      }
      return { text, response };
    } catch (error) {
      lastError = error instanceof FetchFailed ? error : new FetchFailed(error.message, { url, cause: error });
      if (attempt === retries || !worthRetrying(lastError)) break;
      // 遞增退讓:2s、4s、8s。金管局實測要 20 秒先恢復,所以起步唔好太細。
      await sleep(2000 * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

/**
 * 抓一份 JSON。
 *
 * @param {string} url
 * @param {object} [options]
 * @param {(body: any, response: Response) => void} [options.assertShape]
 *        確認回應真係預期嗰個形狀。API 掛咗嗰陣成日會 200 但回一版 HTML 錯誤頁。
 */
export async function fetchJson(url, options = {}) {
  const { assertShape, ...rest } = options;
  const { text, response } = await request(url, { accept: "application/json", ...rest });

  let body;
  try {
    body = JSON.parse(text);
  } catch (cause) {
    // 典型情況:統計處個 Azure WAF 擋咗,回 HTML 403 但外面睇落係 200。
    throw new FetchFailed(`回應唔係合法 JSON(頭 200 個字元:${text.slice(0, 200)})`, { url, cause });
  }

  // assertShape 係用嚟認上游格式嘅。佢掟嘅錯 = 上游變咗形狀,屬 UpstreamError,
  // 唔係我哋寫錯 code —— 所以要包一層,唔可以俾佢變成一個普通 Error 而被當成程式碼錯。
  try {
    assertShape?.(body, response);
  } catch (cause) {
    throw new UpstreamError(`回應形狀唔啱:${cause.message}`, { cause });
  }

  return { body, response, fetchedAt: new Date().toISOString() };
}

/**
 * 抓一份文字檔(CSV 等)。
 *
 * 香港政府嘅 CSV 多數係 UTF-8 with BOM,所以預設剝走 BOM。
 * 見過 Big5 嘅話要另外處理,唔好靜靜哋當 UTF-8 讀 —— 會變亂碼但唔會報錯。
 */
export async function fetchText(url, options = {}) {
  const { text, response } = await request(url, options);
  return {
    text: text.replace(/^﻿/, ""),
    response,
    fetchedAt: new Date().toISOString(),
  };
}
