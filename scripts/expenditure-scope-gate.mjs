// 開支口徑嘅 build 前源碼閘。公共開支已包括政府開支,唔可以合圖／相加。
// 保守做法:同一頁及其本地 import 依賴只准讀其中一套開支 JSON。
// 唯一例外係首頁目前嘅「載入 → 隱藏 todo → 逐張卡顯示」程式形狀。
//
// 呢度驗本 repo 使用嘅 literal FileAttachment / static import / literal import()。
// 唔係通用 JavaScript 數據流分析器;計算出嚟嘅檔名、fetch、自行複製數字唔屬於此閘。
// 同頁兩張獨立圖亦會被擋;真有需要先連同例外及突變測試一齊設計。
// 首頁普通文案、空白、// 註解、附件清單可改;程式流程改動要重新審視呢個例外。

import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

const SCOPES = ["govt_expenditure", "public_expenditure_policy_groups"];
const MIXED = "公共開支已包括政府開支:兩套數據唔可以合圖或將總額相加";

function sourceReferences(source) {
  // 只計真正嘅資料附件／import;Markdown 互相連結同口徑說明唔係資料存取。
  return [
    ...source.matchAll(/\bFileAttachment\s*\(\s*["']([^"']+)["']\s*\)/g),
    ...source.matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1]);
}

function scopeOf(reference) {
  const id = basename(reference).replace(/\.json(?:\.js)?$/, "");
  return SCOPES.includes(id) ? id : null;
}

function isCardsOnlyHome(source) {
  const blocks = [...source.matchAll(/^```js[^\n]*\n([\s\S]*?)^```\s*$/gm)];
  const prose = source.replace(/^```js[^\n]*\n[\s\S]*?^```\s*$/gm, "");
  // Observable inline expressions / raw scripts would be extra executable paths.
  if (/\$\{|<script\b|^\s*(?:```|~~~)/im.test(prose)) return false;
  let program = blocks.map((match) => match[1]).join("\n").replace(/\/\/[^\n]*/g, "");
  const attachments = program.match(/FileAttachment\("\.\/data\/[a-z_]+\.json"\)\.json\(\),?/g) ?? [];
  if (attachments.length === 0) return false;
  for (const attachment of attachments) program = program.replace(attachment, "");
  const expected = `
    import { indicatorCard } from "./components/indicator-card.js";
    const loaded = await Promise.all([]);
    const indicators = loaded.filter((indicator) => indicator.manual_status !== "todo");
    display(html\`<div class="card-grid">\${indicators.map((indicator) => indicatorCard(indicator))}</div>\`);
  `;
  // The programme cell reads exactly four image URLs, with no indicator argument or computation.
  // Any change to this executable shape remains a hard failure, as does a data-reading dependency.
  const branding = `
    import {programmeBrand} from "./components/programme-brand.js";
    const programmeLogos = {
      bgca: await FileAttachment("./assets/programme/bgca.png").url(),
      hkex: await FileAttachment("./assets/programme/hkex.png").url(),
      edb: await FileAttachment("./assets/programme/edb.png").url(),
      hkcss: await FileAttachment("./assets/programme/hkcss.png").url()
    };
    display(programmeBrand({logos: programmeLogos}));
  `;
  const compact = program.replace(/\s/g, "");
  return compact.replace(branding.replace(/\s/g, ""), "") === expected.replace(/\s/g, "");
}

/** Same function runs from validate/build and the mutation tests; no network. */
export async function assertSeparatedExpenditureSources(sourceDir) {
  const root = resolve(sourceDir);
  const sources = new Map();
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || ["_fixtures", "_snapshots"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if ([".md", ".js", ".mjs", ".ts"].includes(extname(path))) {
        sources.set(path, await readFile(path, "utf8"));
      }
    }
  }
  await visit(root);

  function reachableScopes(path, visited = new Set()) {
    if (visited.has(path)) return new Set();
    visited.add(path);
    const scopes = new Set();
    for (const reference of sourceReferences(sources.get(path) ?? "")) {
      const scope = scopeOf(reference);
      if (scope) scopes.add(scope);
      if (reference.startsWith(".")) {
        const dependency = resolve(dirname(path), reference);
        for (const nested of reachableScopes(dependency, visited)) scopes.add(nested);
      }
    }
    return scopes;
  }

  for (const [path, source] of sources) {
    if (reachableScopes(path).size < 2) continue;
    if (path === join(root, "index.md") && isCardsOnlyHome(source)) {
      // 首頁可以讀兩份 JSON,但佢嘅共用元件唔可以再偷讀任何開支 JSON。
      for (const reference of sourceReferences(source).filter((ref) => ref.endsWith(".js"))) {
        if (reachableScopes(resolve(dirname(path), reference)).size > 0) {
          throw new Error(`${MIXED} (${path}:首頁卡片依賴額外讀取開支資料)`);
        }
      }
      continue;
    }
    throw new Error(`${MIXED} (${path}:只准各自指標頁或首頁逐張卡顯示)`);
  }
}
