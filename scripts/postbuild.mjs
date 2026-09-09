#!/usr/bin/env node
// build 之後執手尾:
//   1. 由**真實嘅 dist 內容**生成 service worker 嘅 precache 清單
//   2. 抄 manifest / 圖示入 dist
//   3. 報告全部資料 JSON 加埋幾大(SPEC 第 8 節要求,超過 5 MB 要警告)
//
// 點解一定要有呢個 script:
//   Observable Framework **唔會**把冇被靜態引用嘅檔案複製入 dist ——
//   sw.js、manifest.webmanifest、圖示全部唔會自己入到去。
//   而且 `observable build` 開頭會 `rm -rf dist`,所以呢步一定要喺 build 之後行。
//
// 點解 precache 清單要生成唔可以手寫:
//   Framework 出嘅檔名全部帶內容雜湊(client.06035b22.js),手寫清單一改 build 就爛。

import { readdir, readFile, writeFile, copyFile, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { pickDataAsOf, isDisplayed } from "../src/data/_lib/site-meta.js";
import { normalizeBrowserViewport } from "./lib/viewport.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DIST = join(ROOT, "dist");
const PUBLIC = join(ROOT, "public");
const SNAPSHOTS = join(ROOT, "src", "data", "_snapshots");

/** SPEC 第 8 節:全部 JSON 加埋應該遠細於 5 MB。 */
const JSON_BUDGET_BYTES = 5 * 1024 * 1024;

if (!existsSync(DIST)) {
  console.error("FAIL 搵唔到 dist/。行 `npm run build` 先。");
  process.exit(1);
}

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else out.push({ path: `./${relative(base, full).split("\\").join("/")}`, full });
  }
  return out;
}

const files = await walk(DIST);

/**
 * .html 檔名轉返瀏覽器實際會攞嘅 URL。
 *
 * Framework 預設 preserveExtension: false,即係 dist/indicators/gdp.html
 * 實際會用 /indicators/gdp 攞。快取 key 用檔名嘅話,每次導航都 miss。
 */
function toCleanUrl(path) {
  if (!path.endsWith(".html")) return path;
  if (path === "./index.html") return "./";
  const withoutExtension = path.slice(0, -".html".length);
  return withoutExtension.endsWith("/index") ? `${withoutExtension.slice(0, -"index".length)}` : withoutExtension;
}

const htmlPages = files.filter((file) => file.path.endsWith(".html"));

// 先移走框架固定的手機放大限制，再以真正輸出的 HTML 內容計快取版本。
// 唔加第二個 viewport、唔靠載入後的 JS；離線首開亦用同一份修正過的 HTML。
const htmlDigests = [];
for (const file of htmlPages) {
  const raw = await readFile(file.full, "utf8");
  const normalized = normalizeBrowserViewport(raw);
  if (normalized !== raw) await writeFile(file.full, normalized, "utf8");
  htmlDigests.push([file.path, createHash("sha256").update(normalized).digest("hex")]);
}

// 關鍵資源:頁面、樣式、runtime、字型、資料。冇呢啲離線就乜都冇。
// ⚠️ /_npm/ 有兩層:scoped 套件係 /_npm/@observablehq/plot@x/<hash>.js。
//    用單層 regex 會靜靜哋漏咗 Plot —— 上線嗰陣睇落冇事,離線先發現圖畫唔到。
const isNpm = (path) => path.startsWith("./_npm/");
const critical = [
  ...htmlPages.map((file) => toCleanUrl(file.path)),
  ...files
    .filter((file) => !isNpm(file.path) && !file.path.endsWith(".html"))
    .filter((file) => !file.path.startsWith("./sw.js"))
    .map((file) => file.path),
];

// 圖表 library:大,但離線畫圖要用。install 嗰陣逐個試,失敗唔會拖冧成個 install。
const optional = files.filter((file) => isNpm(file.path)).map((file) => file.path);

// 全站有數據的統計快照中最早的截至日（包括香港及澳門專頁）。
// 未填數的 manual 不計入；各卡仍獨立標明真正統計期。
const docs = [];
let jsonBytes = 0;
if (existsSync(SNAPSHOTS)) {
  for (const name of (await readdir(SNAPSHOTS)).filter((n) => n.endsWith(".json"))) {
    const raw = await readFile(join(SNAPSHOTS, name), "utf8");
    jsonBytes += Buffer.byteLength(raw);
    docs.push(JSON.parse(raw));
  }
}
// 城市快照亦計入總 JSON 預算；唔用新聞時間掩蓋統計資料嘅較早日期。
const citySnapshots = join(ROOT, "src", "data", "_city_snapshots");
for (const name of (await readdir(citySnapshots)).filter((n) => n.endsWith(".json"))) {
  jsonBytes += Buffer.byteLength(await readFile(join(citySnapshots, name), "utf8"));
}
const dataAsOf = pickDataAsOf(docs);
const hidden = docs.filter((doc) => !isDisplayed(doc));

// JS／CSS 等資源檔名帶 hash；HTML 路徑唔帶，所以亦加入正規化後的內容雜湊。
// 只改 viewport 或靜態文案而路徑不變，版本亦會變，舊快取先會退役。
const version = createHash("sha256")
  .update(JSON.stringify([critical, optional, htmlDigests]))
  .digest("hex")
  .slice(0, 12);

const template = await readFile(join(PUBLIC, "sw-template.js"), "utf8");
const sw = template
  .replace("__VERSION__", version)
  .replace("__DATA_AS_OF__", dataAsOf ?? "")
  .replace("__CRITICAL__", JSON.stringify(critical, null, 2))
  .replace("__OPTIONAL__", JSON.stringify(optional, null, 2));

if (sw.includes("__CRITICAL__") || sw.includes("__VERSION__")) {
  console.error("FAIL sw-template.js 入面有佔位符換唔到,唔會寫出去");
  process.exit(1);
}
await writeFile(join(DIST, "sw.js"), sw, "utf8");

// manifest 同圖示:一定要放喺 dist 根。
// ⚠️ 唔可以用 head 嘅 <link rel="manifest"> 引用 —— Framework 會把佢加雜湊搬去
//    _file/,而 manifest 嘅 start_url / scope 係相對 manifest 自己個 URL 解析嘅,
//    咁 scope 就會變咗 /_file/,整個 PWA 都錯。所以喺呢度抄,由 head 嘅 script 掛上去。
for (const name of ["manifest.webmanifest", "icon.svg", "offline-banner.js"]) {
  const from = join(PUBLIC, name);
  if (!existsSync(from)) {
    console.error(`FAIL public/${name} 唔見咗`);
    process.exit(1);
  }
  await copyFile(from, join(DIST, name));
}

// ── 報告 ──────────────────────────────────────────────────────
let totalBytes = 0;
for (const file of files) totalBytes += (await stat(file.full)).size;

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
console.log(`\npostbuild — service worker 同 PWA`);
console.log(`  版本            ${version}`);
console.log(`  數據截至(最舊)  ${dataAsOf ?? "(冇快照)"}`);
if (hidden.length > 0) {
  console.log(
    `  未有數據        ${hidden.map((doc) => doc.indicator_id).join("、")}` +
      `(未填數,唔計入上面個日期)`
  );
}
console.log(`  關鍵資源        ${critical.length} 個(頁面 ${htmlPages.length} 版)`);
console.log(`  盡量快取        ${optional.length} 個(圖表 library)`);
console.log(`  資料 JSON       ${mb(jsonBytes)}(SPEC 第 8 節上限 ${mb(JSON_BUDGET_BYTES)})`);
console.log(`  整個 dist       ${mb(totalBytes)}`);

if (jsonBytes > JSON_BUDGET_BYTES) {
  console.error(
    `\nFAIL 資料 JSON 加埋 ${mb(jsonBytes)},超過 SPEC 第 8 節嘅 5 MB 上限。\n` +
      `     SPEC 講明:減指標或者減歷史年份,唔好改用 lazy loading。`
  );
  process.exit(1);
}
console.log(`\n離線快取準備好。`);
