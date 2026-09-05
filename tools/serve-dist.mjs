#!/usr/bin/env node
// 本機模擬 GitHub Pages,用嚟驗離線同子路徑。
//
//   node tools/serve-dist.mjs                 -> http://localhost:8787/hk-data-monitor/
//   node tools/serve-dist.mjs --port 9000 --base /
//
// 點解要有呢個:`observable preview` 服務嘅係 src/ 而唔係 dist/,而且行喺根路徑,
// 兩樣都同真實部署唔同。Service worker 嘅 scope 同 precache 清單啱唔啱,
// 一定要喺「子路徑 + 真 dist」嘅條件下先驗得準 —— 佢哋正正係喺呢度出事。
//
// 刻意模仿 GitHub Pages 嘅幾個行為:
//   · 無副檔名 -> 試 .html(Framework 嘅 preserveExtension 預設 false)
//   · /hk-data-monitor(冇尾斜線)-> 301 去有尾斜線嗰個
//   · 搵唔到 -> 回 404.html
//   · 所有檔案一律 cache-control: max-age=600 —— GitHub Pages 焗死嘅,改唔到,
//     所以「network-first」有時會俾瀏覽器自己個 HTTP 快取答咗
//
// 冇任何依賴,純 node:http。

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "..", "dist");

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const port = Number(readArg("--port", 8787));
let base = readArg("--base", "/hk-data-monitor/");
if (!base.startsWith("/")) base = `/${base}`;
if (!base.endsWith("/")) base += "/";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function resolve(pathname) {
  // 防路徑穿越
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidates = clean.endsWith("/")
    ? [join(DIST, clean, "index.html")]
    : [join(DIST, clean), join(DIST, `${clean}.html`), join(DIST, clean, "index.html")];
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // 試下一個
    }
  }
  return null;
}

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url, `http://localhost:${port}`);

  if (base !== "/" && pathname === base.slice(0, -1)) {
    // GitHub Pages 會 301 /repo -> /repo/。service worker 要識處理呢個 redirect。
    response.writeHead(301, { location: base });
    response.end();
    return;
  }
  if (!pathname.startsWith(base)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(`唔喺 base ${base} 下面`);
    return;
  }

  const relativePath = `/${pathname.slice(base.length)}`;
  const file = await resolve(relativePath);

  if (!file) {
    const notFound = await resolve("/404.html");
    const body = notFound ? await readFile(notFound) : Buffer.from("404");
    response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    response.end(body);
    return;
  }

  response.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    // GitHub Pages 對所有檔案都送呢個,包括帶雜湊嘅資源。改唔到。
    "cache-control": "max-age=600",
  });
  response.end(await readFile(file));
});

server.listen(port, () => {
  console.log(`模擬 GitHub Pages:http://localhost:${port}${base}`);
  console.log(`服務緊 ${DIST}`);
  console.log(`(Ctrl+C 停)`);
});
