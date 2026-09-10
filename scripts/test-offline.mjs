#!/usr/bin/env node
// 離線行為測試 —— 釘死「HTTP 快取答唔到導航請求」。
//
//   npm run test:offline        (要先 npm run build)
//
// 點解要分開一個 script,唔併入 test:checks:
//   呢個要開真瀏覽器。Playwright **唔係**本專案嘅依賴(SPEC 第 3 節:避免引入
//   額外 runtime 依賴),所以 test:checks 保持純 node、離線、秒跑,
//   而呢個係「有得跑就跑,冇就明明白白講聲跳過」。
//
// 釘住嘅真實 bug:
//   GitHub Pages 對每個檔送 cache-control: max-age=600,而且改唔到(冇 _headers 支援)。
//   service worker 個 fetch() 冇 cache: "reload" 就會俾瀏覽器嘅 HTTP 快取答咗 ——
//   斷咗網,fetch 照回 200,worker 以為仲喺線上,離線橫額永遠唔出。
//   同一次實測仲確認咗 navigator.onLine 斷晒網都照回 true,所以佢做唔到後備判斷。
//
// 呢個測試特登**先上線行一轉**(令 HTTP 快取入面有嘢、而且未過 600 秒),
// 然後先斷網 —— 冇呢一步就重現唔到個 bug。

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8791;
const BASE = `http://localhost:${PORT}/hk-data-monitor/`;

if (!existsSync(join(ROOT, "dist", "sw.js"))) {
  console.error("FAIL 搵唔到 dist/sw.js。行 `npm run build` 先。");
  process.exit(1);
}

// Playwright 唔係本專案依賴。搵得到就跑,搵唔到就跳過 —— 唔好扮綠。
const require = createRequire(import.meta.url);
let chromium;
for (const from of [import.meta.url, `${process.env.HOME}/x.js`, `${ROOT}/../beetle-scanner-exhibit/x.js`]) {
  try {
    ({ chromium } = require(createRequire(from).resolve("playwright")));
    break;
  } catch {
    // 試下一個
  }
}
if (!chromium) {
  console.log("SKIP 搵唔到 Playwright,跳過離線行為測試。");
  console.log("     裝法:npm i -D playwright && npx playwright install chromium");
  console.log("     (源碼層守衛喺 `npm run test:checks` 嘅 [R4] 一節,嗰個唔使瀏覽器。)");
  process.exit(0);
}

const gdpSnapshot = JSON.parse(await readFile(join(ROOT, "src/data/_snapshots/gdp.json"), "utf8"));
const unemploymentSnapshot = JSON.parse(await readFile(join(ROOT, "src/data/_snapshots/unemployment.json"), "utf8"));
const gdpLatest = [...gdpSnapshot.series].reverse().find((point) => Number.isFinite(point.value));
const exactGDP = gdpLatest.value.toLocaleString("en-GB", {maximumFractionDigits: 20});
let browser;
let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const server = spawn(process.execPath, [join(ROOT, "tools", "serve-dist.mjs"), "--port", String(PORT)], {
  stdio: "ignore",
});
process.on("exit", () => server.kill());

try {
  // 等伺服器起身
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(BASE);
      break;
    } catch {
      await sleep(150);
    }
  }

  browser = await chromium.launch({ channel: "chromium" });
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const outsideRequests = [];
  context.on("request", (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(BASE)) outsideRequests.push(request.url());
  });
  const page = await context.newPage();
  async function workerStatus() {
    return page.evaluate(() => new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 3000);
      navigator.serviceWorker.addEventListener("message", function handler(event) {
        if (event.data?.type !== "hkdm:status") return;
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("message", handler);
        resolve(event.data);
      });
      navigator.serviceWorker.controller?.postMessage({type: "hkdm:status", url: location.href});
    }));
  }
  async function readRenderedAttachment(id) {
    return page.evaluate(async (id) => {
      const resource = performance.getEntriesByType("resource").find((entry) => entry.name.includes(`/_file/data/${id}.`) && entry.name.endsWith(".json"));
      if (!resource) throw new Error(`Rendered data attachment missing: ${id}`);
      const response = await fetch(resource.name);
      if (!response.ok) throw new Error(`Offline attachment failed: ${id}`);
      return response.json();
    }, id);
  }
  async function languageControlReachable(code) {
    const choice = page.locator(`.hkdm-language-switch [data-language-choice="${code}"]`);
    try {
      await choice.scrollIntoViewIfNeeded();
      await choice.click({trial: true, timeout: 3000});
      return await choice.isVisible();
    } catch {return false;}
  }

  console.log("\n[離線行為] 先上線行一轉,令 HTTP 快取有嘢(唔做呢步就重現唔到個 bug)");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".indicator-card", { timeout: 20_000 });
  await page.waitForTimeout(3500); // 等 service worker install 埋 optional 資源

  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  check("service worker scope 係子路徑,唔係 origin 根", scope.endsWith("/hk-data-monitor/"), scope);

  await page.goto(`${BASE}indicators/gdp`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  console.log("\n[離線行為] 斷網");
  await context.setOffline(true);

  // navigator.onLine 靠唔住 —— 釘死呢個事實,因為佢係「唔可以用佢做判斷」嘅理由
  const onLine = await page.evaluate(() => navigator.onLine);
  console.log(`  (參考)斷網之後 navigator.onLine = ${onLine}${onLine ? "  <- 就係佢靠唔住嘅證據" : ""}`);

  // 撳連結導航去一版之前載過、HTTP 快取仲喺度(600 秒未過)嘅頁
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForSelector(".indicator-card", { timeout: 20_000 });
  await Promise.all([
    page.waitForURL("**/indicators/gdp", { timeout: 20_000 }),
    page.click('a.indicator-card[href$="gdp"]'),
  ]);
  await page.waitForSelector(".headline__item", { timeout: 20_000 });
  await page.waitForTimeout(1800);

  const state = await page.evaluate(async () => {
    const reply = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 3000);
      navigator.serviceWorker.addEventListener("message", function handler(event) {
        if (event.data?.type !== "hkdm:status") return;
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("message", handler);
        resolve(event.data);
      });
      navigator.serviceWorker.controller?.postMessage({ type: "hkdm:status", url: location.href });
    });
    const banner = document.getElementById("hkdm-offline-banner");
    return {
      fromCache: reply?.fromCache ?? null,
      dataAsOf: reply?.dataAsOf ?? null,
      bannerShown: !!banner && !banner.hidden,
      bannerText: banner?.innerText?.replace(/\s+/g, " ").trim() ?? null,
      rendered: document.querySelectorAll(".data-table tbody tr").length,
    };
  });

  // 呢條就係核心:HTTP 快取答到嘅話,fromCache 會係 false,橫額唔會出。
  check("worker 知道呢一版係由快取答(HTTP 快取答唔到導航)", state.fromCache === true, `fromCache=${state.fromCache}`);
  check("離線橫額有出", state.bannerShown, state.bannerText ?? "冇出");
  check("橫額寫住數據截至日期", /數據截至/.test(state.bannerText ?? ""), state.bannerText ?? "");
  check("頁面內容照樣 render(唔係白畫面)", state.rendered > 10, `${state.rendered} 行`);

  console.log("\n[離線行為] 開一個未快取過嘅網址 —— 唔可以出首頁內容(soft-404)");
  const response = await page.goto(`${BASE}indicators/no-such-indicator`, { waitUntil: "load" }).catch(() => null);
  const notFound = await page.evaluate(() => ({
    h1: document.querySelector("h1")?.innerText ?? null,
    cards: document.querySelectorAll(".indicator-card").length,
  }));
  check("回 HTTP 404", response?.status() === 404, String(response?.status()));
  check("出嘅係 404 版,唔係首頁", notFound.h1 === "搵唔到呢一版" && notFound.cards === 0, `h1=${notFound.h1} cards=${notFound.cards}`);

  console.log("\n[雙語離線] 英文 query 未曾載入，直接進入深層指標頁");
  const storageBefore = await page.evaluate(() => ({local: Object.fromEntries(Object.entries(localStorage)), session: Object.fromEntries(Object.entries(sessionStorage)), cookie: document.cookie}));
  const englishResponse = await page.goto(`${BASE}indicators/gdp?lang=en-GB#source`, {waitUntil: "load"});
  await page.waitForSelector(".headline__item", {timeout: 20_000});
  await page.waitForSelector(".hkdm-language-switch", {timeout: 20_000});
  check("首次離線英文深層導航回 200，英文內容確實渲染", englishResponse?.status() === 200 && await page.locator("html").getAttribute("lang") === "en-GB" && (await page.locator(".source-footer__title").innerText()).trim() === "Sources and citation");
  const englishStatus = await workerStatus();
  check("英文 query 由同一份已預先快取頁面回答", englishStatus?.fromCache === true, JSON.stringify(englishStatus));
  await page.waitForFunction(() => {const banner = document.querySelector("#hkdm-offline-banner"); return banner && !banner.hidden;});
  check("英文離線橫額明文顯示快取狀態及資料日期", /Showing the offline cache\./.test(await page.locator("#hkdm-offline-banner").innerText()) && /data-as-of date/.test(await page.locator("#hkdm-offline-banner").innerText()));
  check("語言切換可見且未被頁首遮擋", await languageControlReachable("zh-HK") && await languageControlReachable("en-GB"));

  await page.locator(".citation-picker > summary").click();
  await page.waitForSelector(".citation-preview:visible");
  const citation = await page.locator(".citation-preview").inputValue();
  check("英文引用保留快照原值、期數、單位、來源及版本", citation.includes(exactGDP) && citation.includes(gdpLatest.period) && citation.includes(gdpSnapshot.unit_en) && citation.includes(gdpSnapshot.source_url) && citation.includes(gdpSnapshot.updated_at) && citation.includes(gdpSnapshot.data_version) && citation.includes("Scope:") && citation.includes("Source:"), citation);
  check("英文複製引用按鈕離線可用", await page.getByRole("button", {name: "Copy full citation", exact: true}).isEnabled());
  await page.getByRole("button", {name: "Select citation text", exact: true}).click();
  const selectedCitation = await page.locator(".citation-preview").evaluate((element) => element.selectionStart === 0 && element.selectionEnd === element.value.length);
  check("不依賴剪貼簿權限仍能選取完整英文引用", selectedCitation);
  const englishGDP = await readRenderedAttachment("gdp");
  check("轉英文沒有改資料附件的原始數值或單位", JSON.stringify(englishGDP.series) === JSON.stringify(gdpSnapshot.series) && englishGDP.unit_zh === gdpSnapshot.unit_zh && englishGDP.indicator_id === "gdp");

  await Promise.all([
    page.waitForURL((url) => url.pathname.endsWith("/indicators/gdp") && !url.searchParams.has("lang") && url.hash === "#source"),
    page.locator('[data-language-choice="zh-HK"]').click(),
  ]);
  await page.waitForSelector(".source-footer__title");
  check("切回繁中保留原頁及 hash", await page.locator("html").getAttribute("lang") === "zh-HK" && (await page.locator(".source-footer__title").innerText()).trim() === "資料來源");
  await Promise.all([
    page.waitForURL((url) => url.pathname.endsWith("/indicators/gdp") && url.searchParams.get("lang") === "en-GB" && url.hash === "#source"),
    page.locator('[data-language-choice="en-GB"]').click(),
  ]);
  await page.waitForSelector(".source-footer__title");
  check("再切英文同樣保留原頁及 hash", await page.locator("html").getAttribute("lang") === "en-GB" && (await page.locator(".source-footer__title").innerText()).trim() === "Sources and citation");

  const unemploymentResponse = await page.goto(`${BASE}indicators/unemployment?lang=en-GB#source`, {waitUntil: "load"});
  await page.waitForSelector(".headline__item", {timeout: 20_000});
  const englishUnemployment = await readRenderedAttachment("unemployment");
  check("未曾在線開過的英文分類指標亦能離線渲染", unemploymentResponse?.status() === 200 && await page.locator(".data-table tbody tr").count() > 10);
  check("原始中文 category 及分類數值保持不變", JSON.stringify(englishUnemployment.series) === JSON.stringify(unemploymentSnapshot.series) && englishUnemployment.series.some((point) => /[\u3400-\u9fff]/.test(point.category ?? "")));
  const presentedCategories = await page.locator(".headline__label").allTextContents();
  check("英文頁分類只在顯示時翻譯", presentedCategories.length >= 2 && presentedCategories.every((text) => text.trim() && !/[\u3400-\u9fff]/.test(text)), presentedCategories.join(" | "));
  const storageAfter = await page.evaluate(() => ({local: Object.fromEntries(Object.entries(localStorage)), session: Object.fromEntries(Object.entries(sessionStorage)), cookie: document.cookie}));
  check("語言選擇不新增偏好儲存或 cookie", JSON.stringify(storageAfter) === JSON.stringify(storageBefore) && (await context.cookies()).length === 0);

  for (const [label, suffix] of [
    ["不存在的英文路徑", "indicators/no-such-indicator?lang=en-GB"],
    ["未知額外 query", "indicators/gdp?lang=en-GB&unknown=1"],
    ["未支援語言 query", "indicators/gdp?lang=fr"],
  ]) {
    const unknownResponse = await page.goto(`${BASE}${suffix}`, {waitUntil: "load"});
    await page.waitForSelector("h1");
    const unknown = await page.evaluate(() => ({heading: document.querySelector("h1")?.innerText?.trim(), cards: document.querySelectorAll(".indicator-card").length, values: document.querySelectorAll(".headline__item").length}));
    check(`${label} 保持 404，沒有誤用首頁或指標快取`, unknownResponse?.status() === 404 && unknown.cards === 0 && unknown.values === 0 && ["Page not found", "搵唔到呢一版"].includes(unknown.heading), JSON.stringify(unknown));
  }

  console.log("\n[公共服務離線] 未曾在線開過的三主題及完整引用");
  for (const locale of ["zh-HK", "en-GB"]) {
    const suffix = locale === "en-GB" ? "?lang=en-GB" : "";
    const servicesResponse = await page.goto(`${BASE}explore/public-services${suffix}`, {waitUntil: "load"});
    await page.waitForSelector(".service-table tbody tr", {timeout: 20_000});
    const serviceStatus = await workerStatus();
    check(`${locale} 公共服務新頁由離線預快取回答`, servicesResponse?.status() === 200 && serviceStatus?.fromCache === true && await page.locator(".service-table tbody tr").count() === 8);
    check(`${locale} 主題初始選中狀態明確，唔係空白 ARIA 屬性`, await page.locator(".service-topics button").nth(0).getAttribute("aria-pressed") === "true");
    await page.locator(".service-topics button").nth(1).click();
    check(`${locale} 教育綱領切換保留精確金額`, await page.locator(".service-table tbody tr").count() === 10 && await page.locator(".service-amount strong").innerText() === "31,905.4");
    await page.locator(".service-topics button").nth(2).click();
    check(`${locale} 醫療綱領切換保留精確金額`, await page.locator(".service-table tbody tr").count() === 12 && await page.locator(".service-amount strong").innerText() === "103,059.1");
    await page.locator(".service-table-heading select").selectOption("change");
    check(`${locale} 重新排序後仍標示所選醫管局綱領`, await page.locator('.service-table button[aria-pressed="true"]').count() === 1 && (await page.locator('.service-table button[aria-pressed="true"]').getAttribute("data-programme")).startsWith("140/3 "));
    await page.locator(".service-detail .citation-picker > summary").click();
    const serviceCitation = await page.locator(".service-detail .citation-preview").inputValue();
    check(`${locale} 所選醫管局引用不借其它綱領或期數`, serviceCitation.includes("140/3") && serviceCitation.includes("103,059,100,000") && serviceCitation.includes("2026-27") && serviceCitation.includes("fin_provision.csv"));
    const programmeData = await readRenderedAttachment("service_programme_provision");
    check(`${locale} 離線仍有90點原始綱領數據，沒有跨綱領總額`, programmeData.series.length === 90 && !programmeData.totals && !(await page.locator(".observablehq--error").count()));
  }

  console.log("\n[離線行為] 回復網絡");
  await context.setOffline(false);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const back = await page.evaluate(() => {
    const banner = document.getElementById("hkdm-offline-banner");
    return {
      bannerShown: !!banner && !banner.hidden,
      external: performance.getEntriesByType("resource").map((r) => r.name).filter((u) => !u.startsWith(location.origin)).length,
    };
  });
  check("回復網絡之後橫額收返", !back.bannerShown);
  check("零第三方請求", back.external === 0, `${back.external} 個`);

  await page.goto(`${BASE}indicators/gdp?lang=en-GB#source`, {waitUntil: "networkidle"});
  await page.waitForSelector(".headline__item");
  const onlineEnglishStatus = await workerStatus();
  check("英文頁恢復連線後不錯報由離線快取回答", onlineEnglishStatus?.fromCache === false, JSON.stringify(onlineEnglishStatus));
  check("雙語導航、引用及資料載入全程零站外請求", outsideRequests.length === 0, outsideRequests.join("\n"));
} finally {
  await browser?.close();
  server.kill();
}

console.log(`\n${passed} 個通過,${failed} 個失敗`);
if (failed > 0) process.exit(1);
