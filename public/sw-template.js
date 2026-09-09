// Service Worker —— SPEC 第 8 節嘅離線策略。
//
// ⚠️ 呢個係**模板**,唔係最終檔。`scripts/postbuild.mjs` 會把 __佔位符__ 換成
//    真實嘅 precache 清單再寫入 dist/sw.js。唔好直接引用呢個檔。
//    (Framework 唔會把冇被引用嘅檔案複製入 dist,所以一定要 postbuild 出手。)
//
// 設計取態:
//   · 全部 URL 都用**相對 self.location 解析**,所以部署喺 / 定 /hk-data-monitor/ 都啱。
//     sw.js 擺喺 dist 根,佢個 scope 自然就係站點根。
//   · 快取 key 用 **prefix 命名空間**。user.github.io 上面每個 project page 共用同一個
//     origin —— 用「唔係我嘅就刪」會抹走隔籬專案嘅快取。
//   · 頁面讀唔到自己嗰個 navigation response 嘅 header,所以「你而家睇緊嘅係咪快取版」
//     要靠 worker 記住 resultingClientId,再由頁面 postMessage 問返。

const VERSION = "__VERSION__";
const CACHE_PREFIX = "hkdm-";
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

// 數據截至日期(全站最舊嗰個)。離線 banner 要顯示,由 postbuild 焗死。
const DATA_AS_OF = "__DATA_AS_OF__";

// 一定要快取到,唔係 install 就當失敗:頁面、樣式、runtime、資料 JSON。
const CRITICAL = __CRITICAL__;

// 盡量快取:圖表library 等大檔。錯咗唔會令 install 失敗,頁面照樣睇到字同資料表。
const OPTIONAL = __OPTIONAL__;

/** 相對 sw.js 自己嘅位置解析,咁部署喺子路徑都唔使改。 */
function url(path) {
  return new URL(path, self.location).toString();
}

// 邊個 clientId 係由快取答嘅。頁面 load 完會問返。
//
// ⚠️ 淨係靠 resultingClientId 唔夠可靠:實測 reload 認得到,但撳連結導航就認唔到
//    (event.source 有時對唔上嗰個 id),結果離線橫額喺導航之後唔出。
//    所以再用 URL + 時間戳記做第二重判斷。
const servedFromCache = new Map();
const recentCacheServes = new Map(); // URL -> 時間戳記
const CACHE_SERVE_TTL_MS = 30_000;

function noteCacheServe(clientId, requestUrl) {
  if (clientId) servedFromCache.set(clientId, true);
  recentCacheServes.set(requestUrl, Date.now());
}

function wasServedFromCache(clientId, pageUrl) {
  if (clientId && servedFromCache.get(clientId) === true) return true;
  const at = recentCacheServes.get(pageUrl);
  return typeof at === "number" && Date.now() - at < CACHE_SERVE_TTL_MS;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // cache.addAll() 係全有或全冇:一個 404 就成批失敗。所以關鍵資源先 addAll,
      // 大檔逐個 put,錯咗照去。
      await cache.addAll(CRITICAL.map(url));

      await Promise.all(
        OPTIONAL.map(async (path) => {
          try {
            const response = await fetch(url(path), { cache: "reload" });
            if (response.ok) await cache.put(url(path), response);
          } catch {
            // 靜靜哋算數 —— 呢啲係 nice-to-have
          }
        })
      );
    })()
  );
  // 新版本即刻上位。呢個站係唯讀資料,新舊版本之間冇狀態要遷移。
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          // ⚠️ 只刪自己嘅。user.github.io 每個專案共用一個 origin,
          //    「唔係我嘅就刪」會抹走隔籬專案。
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  // 只管自己站點嘅嘢。呢個站本身冇任何第三方請求,呢句係防守性。
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }
  event.respondWith(handleAsset(request));
});

/** The same static HTML contains both authored languages. Other query parameters remain significant. */
function navigationCacheKey(requestUrl) {
  const target = new URL(requestUrl);
  const root = new URL("./", self.location);
  const languages = target.searchParams.getAll("lang");
  if (target.origin === root.origin && target.pathname.startsWith(root.pathname) &&
      languages.length === 1 && ["zh-HK", "en-GB"].includes(languages[0])) {
    target.searchParams.delete("lang");
  }
  return target.href;
}

/**
 * 頁面:網絡優先,失敗就用快取。
 *
 * 順帶記低呢個 client 係咪由快取答 —— 頁面自己讀唔到 navigation response 嘅 header。
 */
async function handleNavigation(event) {
  const { request, resultingClientId } = event;
  try {
    // ⚠️ cache: "reload" 唔可以慳。
    //
    // GitHub Pages 對每個檔都送 cache-control: max-age=600,而且改唔到(冇 _headers 支援)。
    // 冇呢個 flag 嘅話,worker 自己個 fetch() 會俾瀏覽器嘅 HTTP 快取答咗 ——
    // 即係「network-first」靜靜哋變成「browser-cache-first」:
    // 明明已經斷網,fetch 照樣 200,worker 以為仲喺線上,離線橫額永遠唔出。
    // 實測重現過:斷網撳連結入另一版,fetch 回 200,fromCache 報 false。
    //
    // 順帶一提,navigator.onLine 喺同一次實測入面**照樣回 true**,
    // 所以佢做唔到後備判斷,呢度一定要靠真正嘅網絡結果。
    const response = await fetch(request, { cache: "reload" });
    // GitHub Pages 會 301 /repo -> /repo/。redirect 過嘅 response 直接俾出去會變
    // network error(navigation 嘅 redirect mode 係 manual),所以要重新砌一個。
    if (response.redirected) {
      const body = await response.clone().blob();
      if (resultingClientId) servedFromCache.set(resultingClientId, false);
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(navigationCacheKey(request.url), response.clone());
    }
    if (resultingClientId) servedFromCache.set(resultingClientId, false);
    recentCacheServes.delete(request.url);
    return response;
  } catch {
    const cached = await caches.match(navigationCacheKey(request.url));
    if (cached) {
      noteCacheServe(resultingClientId, request.url);
      return cached;
    }
    // ⚠️ 呢度唔可以退返首頁。退首頁即係喺一個唔存在嘅網址上面出返首頁內容(soft-404),
    //    學生會以為條 URL 啱。有快取嘅 404 版就用佢,冇就出下面段訊息。
    const notFound = await caches.match(url("./404"));
    if (notFound) {
      noteCacheServe(resultingClientId, request.url);
      return new Response(await notFound.blob(), {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    const languages = new URL(request.url).searchParams.getAll("lang");
    const english = languages.length === 1 && languages[0] === "en-GB";
    return new Response(
      english
        ? "<!doctype html><html lang=en-GB><meta charset=utf-8><title>Offline</title><p style='font-family:system-ui;padding:2rem'>You are offline and this page has not been cached. Reconnect and try again, or return to the <a href='" + url("./?lang=en-GB") + "'>home page</a>.</p></html>"
        : "<!doctype html><html lang=zh-HK><meta charset=utf-8><title>離線</title><p style='font-family:system-ui;padding:2rem'>你而家離線,而且呢一版未曾快取過。駁返網絡再試,或者返去<a href='" + url("./") + "'>首頁</a>。</p></html>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
}

/**
 * 資源:快取優先。
 *
 * Framework 出嘅資源檔名全部帶內容雜湊,所以「快取有就用」永遠唔會出舊嘢 ——
 * 內容改咗檔名就會變,自然變成另一個 key。
 */
async function handleAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // 冇快取又冇網絡。回一個 503 好過拋 network error —— 起碼頁面收到嘅係一個 response。
    return new Response("", { status: 503, statusText: "離線,而且呢個資源未快取" });
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "hkdm:status") return;
  const clientId = event.source?.id;
  event.source?.postMessage({
    type: "hkdm:status",
    // navigator.onLine 靠唔住(實測主機完全去唔到都仲係 true),
    // 所以「係咪離線」以「呢一版係咪由快取答」為準。
    fromCache: wasServedFromCache(clientId, event.data.url),
    dataAsOf: DATA_AS_OF,
    version: VERSION,
  });
  if (clientId) servedFromCache.delete(clientId);
});
