// 對外抓數嘅統一入口:逾時、重試、禮貌延遲、清楚嘅錯誤。
//
// 取態:寧願大聲失敗,都唔好靜靜哋回半份資料。
// 上層(snapshot.js)會接住錯誤,改用上一版 —— 即係 SPEC 第 7 節嘅 fail-soft。
// 呢個分工好重要:**呢一層唔准 fail-soft**,一 fail-soft 就會分唔清
// 「真係抓到」同「抓到一半」。

import { setTimeout as sleep } from "node:timers/promises";

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
  await sleep(ms);
}

export class FetchFailed extends Error {
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

      return { text: await response.text(), response };
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

  assertShape?.(body, response);
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
