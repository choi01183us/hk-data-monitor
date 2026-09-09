import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import {JSDOM} from "jsdom";
import * as locale from "../src/components/locale.js";
import config from "../observablehq.config.js";

const root = "https://example.org/hk-data-monitor/";
const page = `${root}explore/city`;
const throws = (fn) => {try {fn(); return false;} catch {return true;}};
function replaceOnce(source, from, to) {
  if (source.split(from).length !== 2) throw new Error(`Language mutation must match once: ${from}`);
  return source.replace(from, to);
}

export async function testLanguage(check) {
  console.log("\n[語言] 英式英文選擇、原始鍵值及離線導航自證");
  const helperSource = await readFile(new URL("../src/components/locale.js", import.meta.url), "utf8");
  const switchSource = await readFile(new URL("../public/language-switch.js", import.meta.url), "utf8");
  const swSource = await readFile(new URL("../public/sw-template.js", import.meta.url), "utf8");
  const bannerSource = await readFile(new URL("../public/offline-banner.js", import.meta.url), "utf8");
  const oracles = {
    locale: (m) => m.canonicalLocale() === "zh-HK" && m.canonicalLocale("en-GB") === "en-GB" && m.canonicalLocale("zh-HK") === "zh-HK",
    reject: (m) => ["en", "en-US", "zh-CN", "fr", 3, {}].every((x) => throws(() => m.canonicalLocale(x))),
    missing: (m) => [undefined, null, "", "   ", {}].every((en) => throws(() => m.t("已編寫中文", en))),
    links: (m) => m.languageHref(`${page}?view=history#city-map`, "en-GB") === `${page}?view=history&lang=en-GB#city-map` && m.languageHref(`${page}?lang=en-GB&view=history#city-map`, "zh-HK") === `${page}?view=history#city-map`,
    local: (m) => m.localHref("../indicators/gdp#source", {locale: "en-GB", baseUrl: page, siteRoot: root}) === `${root}indicators/gdp?lang=en-GB#source`,
    external: (m) => ["https://other.org/report", "https://other.org/hk-data-monitor/explore/city", "/other-project/page", "/hk-data-monitor-extra/page", "mailto:hello@example.org", "javascript:alert(1)", "../data/gdp.json", "#source"].every((href) => m.localHref(href, {locale: "en-GB", baseUrl: page, siteRoot: root}) === href),
    unknown: (m) => ["./city?lang=fr", "./city?lang=en-GB&lang=zh-HK"].every((href) => m.localHref(href, {locale: "en-GB", baseUrl: page, siteRoot: root}) === href),
  };
  for (const [key, name] of Object.entries({locale: "預設繁中，只選 zh-HK／en-GB", reject: "拒絕未支援語言及錯型別", missing: "缺少已編寫英文時 hard fail", links: "轉語言保留其餘 query 及 hash", local: "站內頁面加語言並保留錨點", external: "外站、鄰近專案、下載及錨點不改", unknown: "不覆蓋未知或重複語言 query"})) check(name, oracles[key](locale));
  check("Node 端不靠瀏覽器語言，預設仍是中文", !locale.isEnglish() && locale.t("中文", "English") === "中文");
  const priorDocument = globalThis.document;
  try {
    globalThis.document = {documentElement: {lang: "en-GB"}};
    check("明文選英式英文後選已編寫英文", locale.isEnglish() && locale.t("中文", "English") === "English");
    globalThis.document.documentElement.lang = "en-US";
    check("其他英文 locale 不冒充 en-GB", !locale.isEnglish());
  } finally {if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument;}

  for (const [label, from, to, oracle] of [
    ["刪除英文必填守衛", 'typeof zh !== "string" || typeof en !== "string" || (zh.trim() && !en.trim())', "false", "missing"],
    ["任意語言均接受", 'throw new Error(`Unsupported language: ${String(value)}`);', "return value;", "reject"],
    ["清空所有 query", 'target.searchParams.delete("lang");', 'target.search = "";', "links"],
    ["讓外站連結帶語言", 'target.origin !== root.origin || ', "", "external"],
    ["讓鄰近專案連結帶語言", '!target.pathname.startsWith(rootPath)', "false", "external"],
    ["讓下載檔案帶語言", 'leaf.includes(".") && !leaf.endsWith(".html")', "false", "external"],
  ]) {
    const module = await import(`data:text/javascript;base64,${Buffer.from(replaceOnce(helperSource, from, to)).toString("base64")}`);
    let detected; try {detected = !oracles[oracle](module);} catch {detected = true;}
    check(`源碼突變：${label}會被捉到`, detected);
  }

  const headSource = config.head({path: "/explore/city"});
  const earlyScript = headSource.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  function earlyLocale(search, script = earlyScript) {
    const document = {documentElement: {}};
    runInNewContext(script, {document, URLSearchParams, location: {search}});
    return document.documentElement.lang;
  }
  check("真正 config 在元件執行前設定已選語言", earlyLocale("?lang=en-GB") === "en-GB" && earlyLocale("") === "zh-HK");
  check("真正 config 對未知及重複語言保持繁中", ["?lang=en-US", "?lang=en-GB&lang=zh-HK", "?lang=fr"].every((query) => earlyLocale(query) === "zh-HK"));
  check("源碼突變：early script 接受重複語言會被捉到", earlyLocale("?lang=en-GB&lang=zh-HK", replaceOnce(earlyScript, "values.length===1", "values.length>=1")) !== "zh-HK");
  check("源碼突變：early script 接受美式英文會被捉到", earlyLocale("?lang=en-US", replaceOnce(earlyScript, 'values[0]==="en-GB"', 'values[0].startsWith("en")')) !== "zh-HK");

  function initialise(source = switchSource, chosen = "en-GB") {
    const dom = new JSDOM('<!doctype html><html><head><title>中文標題</title><meta name="hkdm:title-en-GB" content="City explorer | Hong Kong Data Monitor"></head><body><nav id="observablehq-sidebar"><summary>主題探索</summary><a href="./city">香港城市觀察</a></nav><div id="observablehq-search"><input></div><input id="observablehq-sidebar-toggle"><img alt="中文" data-en-alt="English description"><p title="中文原文">保留原文</p><a id="local" href="../indicators/gdp#source">本地</a><a id="external" href="https://other.org/page">外站</a><a id="download" download href="../data/file.json">JSON</a></body></html>', {url: `${page}?lang=${chosen}#city-map`});
    dom.window.document.documentElement.lang = chosen;
    const context = {document: dom.window.document, location: dom.window.location, URL, isEnglish: () => chosen === "en-GB", languageHref: locale.languageHref, localHref: locale.localHref};
    runInNewContext(source.replace('import {isEnglish, languageHref, localHref} from "./locale.js";', "").replace("import.meta.url", JSON.stringify(`${root}language-switch.js`)), context);
    context.initialiseLanguage();
    return {dom, context};
  }
  const {dom, context} = initialise();
  const doc = dom.window.document;
  check("真正初始化器建立兩個可鍵盤操作的語言連結", doc.querySelectorAll(".hkdm-language-switch a").length === 2 && doc.querySelector('[data-language-choice="en-GB"]').getAttribute("aria-current") === "true");
  check("切換器保留同頁及錨點", doc.querySelector('[data-language-choice="zh-HK"]').href === `${page}#city-map`);
  check("只處理明文標記的屬性及 Framework 導覽", doc.querySelector("img").alt === "English description" && doc.querySelector("p").title === "中文原文" && doc.querySelector("#observablehq-sidebar summary").textContent === "Explore by topic");
  check("英文標題及搜尋名稱已套用", doc.title === "City explorer | Hong Kong Data Monitor" && doc.querySelector("#observablehq-search input").getAttribute("aria-label") === "Search Hong Kong data");
  check("外站及下載原始 URL 不改", doc.querySelector("#external").getAttribute("href") === "https://other.org/page" && doc.querySelector("#download").getAttribute("href") === "../data/file.json");
  context.initialiseLanguage();
  check("重入初始化器不重複切換器", doc.querySelectorAll(".hkdm-language-switch").length === 1);
  const dynamic = doc.createElement("a"); dynamic.href = "../indicators/cpi#source"; doc.body.appendChild(dynamic);
  dynamic.dispatchEvent(new dom.window.Event("pointerdown", {bubbles: true}));
  check("動態卡片靠委派事件保留英文，無 DOM observer", dynamic.href === `${root}indicators/cpi?lang=en-GB#source`);
  dom.window.history.replaceState(null, "", "#new-section");
  const chinese = doc.querySelector('[data-language-choice="zh-HK"]');
  chinese.dispatchEvent(new dom.window.Event("pointerdown", {bubbles: true}));
  check("切換時讀取最新 hash", chinese.href === `${page}#new-section`);
  dom.window.close();
  const repeated = initialise(replaceOnce(switchSource, 'if (document.documentElement.dataset.hkdmLanguageReady === "true") return;', ""));
  repeated.context.initialiseLanguage();
  check("源碼突變：刪除初始化冪等守衛會被捉到", repeated.dom.window.document.querySelectorAll(".hkdm-language-switch").length !== 1);
  repeated.dom.window.close();

  function worker(source = swSource, online = false) {
    const entries = new Map([[page, new Response("CITY", {status: 200})], [`${root}404`, new Response("NOT FOUND", {status: 404})]]);
    const writes = [];
    const context = {URL, Response, Date, Map, self: {location: new URL(`${root}sw.js`), addEventListener() {}}, caches: {match: async (request) => entries.get(typeof request === "string" ? request : request.url)?.clone(), open: async () => ({put: async (key, response) => {writes.push(key); entries.set(key, response);}})}, fetch: async (request, options) => {if (!online) throw new Error("offline"); if (options.cache !== "reload") throw new Error("network cache bypass missing"); return new Response("NETWORK");}};
    runInNewContext(source.replace("__CRITICAL__", "[]").replace("__OPTIONAL__", "[]"), context);
    return {context, writes, navigate: (url) => context.handleNavigation({request: {url}, resultingClientId: "fixture"})};
  }
  const sw = worker();
  const key = sw.context.navigationCacheKey;
  check("同一 HTML 的兩種語言共用精確快取鍵", key(`${page}?lang=en-GB`) === page && key(`${page}?lang=zh-HK`) === page);
  check("未知 query 不變成首頁或無 query 快取", key(`${page}?lang=en-GB&view=1`) === `${page}?view=1` && key(`${page}?lang=fr`) === `${page}?lang=fr` && key(`${page}?lang=en-GB&lang=zh-HK`) === `${page}?lang=en-GB&lang=zh-HK`);
  check("SW 不改外站及站點範圍外的 query", key("https://other.org/hk-data-monitor/explore/city?lang=en-GB").endsWith("?lang=en-GB") && key("https://example.org/other/page?lang=en-GB").endsWith("?lang=en-GB"));
  check("真正 handleNavigation：首次離線英文頁使用已快取中文 URL 的同一 HTML", (await sw.navigate(`${page}?lang=en-GB`)).status === 200);
  check("真正 handleNavigation：未知 query 及不存在路徑仍然 404", (await sw.navigate(`${page}?lang=fr`)).status === 404 && (await sw.navigate(`${page}?lang=en-GB&view=1`)).status === 404 && (await sw.navigate(`${root}missing?lang=en-GB`)).status === 404);
  const live = worker(swSource, true); await live.navigate(`${page}?lang=en-GB`);
  check("真正網絡導航以同一 canonical key 更新快取", live.writes.join() === page);
  const badWrite = worker(replaceOnce(swSource, "await cache.put(navigationCacheKey(request.url), response.clone());", "await cache.put(request.url, response.clone());"), true);
  await badWrite.navigate(`${page}?lang=en-GB`);
  check("源碼突變：刪除網絡快取 canonical key 掛勾會被捉到", badWrite.writes.join() !== page);
  check("源碼突變：SW 外站 URL 被改會被捉到", worker(replaceOnce(swSource, "target.origin === root.origin && ", "")).context.navigationCacheKey("https://other.org/hk-data-monitor/explore/city?lang=en-GB").endsWith("?lang=en-GB") === false);
  check("源碼突變：SW 站外路徑被改會被捉到", worker(replaceOnce(swSource, "target.pathname.startsWith(root.pathname) &&", "true &&")).context.navigationCacheKey("https://example.org/other/page?lang=en-GB").endsWith("?lang=en-GB") === false);
  for (const [label, from, to, probe] of [
    ["刪除真正導航查找掛勾", "const cached = await caches.match(navigationCacheKey(request.url));", "const cached = await caches.match(request);", async (m) => (await m.navigate(`${page}?lang=en-GB`)).status !== 200],
    ["未知語言亦移除 query", '["zh-HK", "en-GB"].includes(languages[0])', "true", async (m) => (await m.navigate(`${page}?lang=fr`)).status !== 404],
    ["重複語言亦移除 query", 'languages.length === 1 && ["zh-HK", "en-GB"]', 'languages.length >= 1 && ["zh-HK", "en-GB"]', async (m) => m.context.navigationCacheKey(`${page}?lang=en-GB&lang=zh-HK`) === page],
    ["誤清其餘 query", 'target.searchParams.delete("lang");', 'target.search = "";', async (m) => (await m.navigate(`${page}?lang=en-GB&view=1`)).status !== 404],
  ]) check(`源碼突變：${label}會被捉到`, await probe(worker(replaceOnce(swSource, from, to))));

  const banner = new JSDOM("<!doctype html><html lang=en-GB><body></body></html>", {url: page});
  runInNewContext(bannerSource, {document: banner.window.document, window: banner.window, location: banner.window.location, navigator: {onLine: false}, Intl, Date});
  check("真正離線橫額及關閉名稱支援英文", banner.window.document.querySelector(".hkdm-offline-banner__text").textContent === "Showing the offline cache." && banner.window.document.querySelector("button").getAttribute("aria-label") === "Dismiss offline message");
  banner.window.close();
}
