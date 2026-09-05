// 對外抓數的統一入口：逾時、重試、禮貌 User-Agent、清楚的錯誤。
//
// 設計取態：寧願大聲失敗，都唔好靜靜哋回傳半份資料。
// 上層（snapshot.mjs）會接住呢啲錯誤，改用上一版嘅資料。

import { setTimeout as sleep } from "node:timers/promises";

/**
 * 公開 API 都想知邊個喺度打佢。留返一個可以搵到人嘅識別字串，
 * 唔好扮瀏覽器 — 我哋係一星期抓一次嘅教育用途機械人。
 */
export const USER_AGENT =
  "hk-data-monitor/0.1 (+https://github.com/OWNER/hk-data-monitor; 香港中學開放數據教育專案)";

export class FetchFailed extends Error {
  constructor(message, { url, status, cause } = {}) {
    super(message, { cause });
    this.name = "FetchFailed";
    this.url = url;
    this.status = status;
  }
}

/** 5xx 同網絡層錯誤值得重試；4xx 係我哋自己砌錯 URL，重試幾多次都一樣。 */
function worthRetrying(error) {
  if (error instanceof FetchFailed && typeof error.status === "number") {
    return error.status >= 500 || error.status === 429;
  }
  return true; // timeout / DNS / socket reset
}

/**
 * 抓一份 JSON。
 *
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.timeoutMs=20000]  單次嘗試嘅逾時
 * @param {number} [options.retries=3]        總共試幾多次
 * @param {(body: any, response: Response) => void} [options.assertShape]
 *        用嚟確認回應真係我哋預期嗰個形狀。API 有時會 200 但回一段 HTML 錯誤頁。
 */
export async function fetchJson(url, options = {}) {
  const { timeoutMs = 20_000, retries = 3, assertShape, headers = {} } = options;
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": USER_AGENT, accept: "application/json", ...headers },
      });

      if (!response.ok) {
        throw new FetchFailed(`HTTP ${response.status} ${response.statusText}`, {
          url,
          status: response.status,
        });
      }

      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch (cause) {
        // 典型情況：API 掛咗，前面個 CDN 回一版 HTML 錯誤頁，status 仲要係 200。
        throw new FetchFailed(`回應唔係合法 JSON（頭 120 個字元：${text.slice(0, 120)}）`, { url, cause });
      }

      assertShape?.(body, response);

      return { body, response, fetchedAt: new Date().toISOString() };
    } catch (error) {
      lastError = error instanceof FetchFailed ? error : new FetchFailed(error.message, { url, cause: error });
      if (attempt === retries || !worthRetrying(lastError)) break;
      // 遞增退讓：1s、2s、4s…… 唔好連珠炮咁撼人哋個 API。
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}
