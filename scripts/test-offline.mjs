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

  const browser = await chromium.launch({ channel: "chromium" });
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const page = await context.newPage();

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

  await browser.close();
} finally {
  server.kill();
}

console.log(`\n${passed} 個通過,${failed} 個失敗`);
if (failed > 0) process.exit(1);
