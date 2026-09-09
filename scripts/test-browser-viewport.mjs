import {execFile} from "node:child_process";
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {promisify} from "node:util";
import * as viewport from "./lib/viewport.mjs";

const runNode = promisify(execFile);

export async function testBrowserViewport(check) {
  console.log("\n[瀏覽器縮放] 建置 HTML 正規化及快取更新自證");
  const restricted = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">';
  const accessible = '<meta name="viewport" content="width=device-width, initial-scale=1">';
  const page = (tag = restricted, title = "香港地圖") => `<!doctype html><html lang="zh-HK"><head><meta charset="utf-8">${tag}<title>${title}</title></head><body><p>原有內容 maximum-scale=1 唔改</p></body></html>`;
  const throws = (fn, pattern = /./) => {try {fn(); return false;} catch (error) {return pattern.test(error.message);}};
  const expected = page(accessible);
  const oracles = {
    rewrite: (m) => m.normalizeBrowserViewport(page()) === expected,
    idempotent: (m) => m.normalizeBrowserViewport(expected) === expected && m.normalizeBrowserViewport(m.normalizeBrowserViewport(page())) === expected,
    missing: (m) => throws(() => m.normalizeBrowserViewport(page("")), /唯一 viewport.*0 個/),
    duplicate: (m) => [restricted + restricted, restricted + accessible, accessible + accessible].every((tags) => throws(() => m.normalizeBrowserViewport(page(tags)), /唯一 viewport.*2 個/)),
    unknown: (m) => [
      restricted.replace("maximum-scale=1", "maximum-scale=2"),
      accessible.replace("initial-scale=1", "initial-scale=2"),
      accessible.replace("initial-scale=1", "initial-scale=1, user-scalable=no"),
      accessible.replace('name="viewport"', "name='viewport'"),
      accessible.replace('name="viewport"', "name=viewport"),
      accessible.replace("<meta", "<META"),
      accessible.replace("width=device-width", "width=980"),
    ].every((tag) => throws(() => m.normalizeBrowserViewport(page(tag)), /已知框架格式不同/)),
    type: (m) => [null, undefined, 2, {}, [], new String(page())].every((html) => throws(() => m.normalizeBrowserViewport(html), /HTML 字串/)),
  };
  for (const [key, label] of [
    ["rewrite", "只移走 viewport 的 maximum-scale=1，保留其餘 HTML"],
    ["idempotent", "已修正 HTML 可重跑，結果完全相同"],
    ["missing", "缺少 viewport 硬失敗"],
    ["duplicate", "重複 viewport 硬失敗"],
    ["unknown", "變更格式、縮放值或 user-scalable 限制硬失敗"],
    ["type", "HTML 只接受字串"],
  ]) check(label, oracles[key](viewport));
  check("唔誤認其他 meta 名稱", viewport.normalizeBrowserViewport(page().replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="viewport-extra" content="保留">')) === expected.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="viewport-extra" content="保留">'));

  const helperSource = await readFile(new URL("./lib/viewport.mjs", import.meta.url), "utf8");
  const postbuildSource = await readFile(new URL("./postbuild.mjs", import.meta.url), "utf8");
  const siteMetaSource = await readFile(new URL("../src/data/_lib/site-meta.js", import.meta.url), "utf8");
  const dir = await mkdtemp(join(tmpdir(), "hkdm-browser-viewport-"));
  let sequence = 0;
  const replaceOnce = (source, from, to) => {
    if (source.split(from).length !== 2) throw new Error(`源碼突變必須精確命中一次：${from}`);
    return source.replace(from, to);
  };
  async function mutatedHelper(from, to) {
    const file = join(dir, `helper-${sequence++}.mjs`);
    await writeFile(file, replaceOnce(helperSource, from, to));
    return import(pathToFileURL(file).href);
  }
  async function fixture(source = postbuildSource, tag = restricted) {
    const root = join(dir, `fixture-${sequence++}`);
    for (const path of ["scripts/lib", "src/data/_lib", "src/data/_snapshots", "src/data/_city_snapshots", "public", "dist/_import", "dist/_npm/@observablehq/plot"]) await mkdir(join(root, path), {recursive: true});
    const files = {
      "package.json": '{"type":"module"}',
      "scripts/postbuild.mjs": source,
      "scripts/lib/viewport.mjs": helperSource,
      "src/data/_lib/site-meta.js": siteMetaSource,
      "public/sw-template.js": 'const VERSION = "__VERSION__";\nconst DATE = "__DATA_AS_OF__";\nconst CRITICAL = __CRITICAL__;\nconst OPTIONAL = __OPTIONAL__;\n',
      "public/manifest.webmanifest": "{}", "public/icon.svg": "<svg/>", "public/offline-banner.js": "// banner",
      "dist/index.html": page(tag), "dist/404.html": page(tag, "搵唔到呢一版"),
      "dist/_import/main.123.js": "// module", "dist/_npm/@observablehq/plot/plot.456.js": "// plot",
      // 提早放好 postbuild 會複製的檔，令第一次與重跑的資源清單一致。
      "dist/manifest.webmanifest": "{}", "dist/icon.svg": "<svg/>", "dist/offline-banner.js": "// banner",
    };
    for (const [path, content] of Object.entries(files)) await writeFile(join(root, path), content);
    return {
      root,
      run: () => runNode(process.execPath, [join(root, "scripts/postbuild.mjs")], {cwd: root, timeout: 15000}),
      read: (path) => readFile(join(root, "dist", path), "utf8"),
      write: (path, content) => writeFile(join(root, "dist", path), content),
    };
  }
  const versionOf = (sw) => sw.match(/const VERSION = "([a-f0-9]{12})";/)?.[1];
  const resourcesOf = (sw) => JSON.stringify([
    JSON.parse(sw.match(/const CRITICAL = (\[[\s\S]*?\]);/)?.[1] ?? "null"),
    JSON.parse(sw.match(/const OPTIONAL = (\[[\s\S]*?\]);/)?.[1] ?? "null"),
  ]);
  async function normalizedByPostbuild(source = postbuildSource) {
    const test = await fixture(source);
    await test.run();
    return await test.read("index.html") === expected && await test.read("404.html") === page(accessible, "搵唔到呢一版");
  }
  async function versionBehavior(source = postbuildSource) {
    const test = await fixture(source);
    await test.run();
    const first = await test.read("sw.js");
    await test.run();
    const second = await test.read("sw.js");
    await test.write("index.html", page(accessible, "只改 HTML 文字，檔名不變"));
    await test.run();
    const changed = await test.read("sw.js");
    await test.write("404.html", page(accessible, "另一頁亦有修改"));
    await test.run();
    const changedOtherPage = await test.read("sw.js");
    return {
      valid: [first, second, changed, changedOtherPage].every((sw) => /^[a-f0-9]{12}$/.test(versionOf(sw) ?? "")),
      stable: versionOf(first) === versionOf(second),
      changed: versionOf(second) !== versionOf(changed),
      otherPage: versionOf(changed) !== versionOf(changedOtherPage),
      resources: [second, changed, changedOtherPage].every((sw) => resourcesOf(first) === resourcesOf(sw)),
      scope: resourcesOf(first) === JSON.stringify([["./404", "./", "./_import/main.123.js", "./icon.svg", "./manifest.webmanifest", "./offline-banner.js"], ["./_npm/@observablehq/plot/plot.456.js"]]),
    };
  }
  const detects = (oracle, module) => {try {return !oracle(module);} catch {return true;}};
  try {
    check("真正 postbuild 修正全部 HTML，包括 404", await normalizedByPostbuild());
    const versions = await versionBehavior();
    check("真正 postbuild 版本維持 12 位雜湊", versions.valid);
    check("相同 HTML 重跑版本不變", versions.stable);
    check("只改 HTML 內容而路徑不變，快取版本亦更新", versions.changed);
    check("首頁以外的 HTML 內容亦影響版本", versions.otherPage);
    check("HTML 雜湊唔改變 precache 資源清單", versions.resources && versions.scope);
    for (const [label, tag] of [["缺少 viewport", ""], ["重複 viewport", restricted + restricted], ["不明 viewport", accessible.replace("initial-scale=1", "user-scalable=no")]]) {
      const test = await fixture(postbuildSource, tag);
      let rejected = false;
      try {await test.run();} catch (error) {rejected = error.code !== 0 && /viewport/.test(error.stderr);}
      check(`真正 postbuild 遇到${label}以非零狀態退出`, rejected);
    }
    for (const [label, from, to, key] of [
      ["移走正規化", "return html.replace(RESTRICTED, ACCESSIBLE);", "return html;", "rewrite"],
      ["刪走整個 viewport", "return html.replace(RESTRICTED, ACCESSIBLE);", 'return html.replace(RESTRICTED, "");', "rewrite"],
      ["唔接受已修正標記", "if (tag === ACCESSIBLE) return html;", "", "idempotent"],
      ["放行重複標記", "if (tags.length !== 1)", "if (tags.length < 1)", "duplicate"],
      ["跳過缺少標記的明示檢查", "if (tags.length !== 1)", "if (tags.length > 1)", "missing"],
      ["放行未知框架格式", "if (tag !== RESTRICTED)", "if (false)", "unknown"],
      ["接受字串包裝物件", 'if (typeof html !== "string")', "if (false)", "type"],
    ]) check(`源碼突變：${label}會被捉到`, detects(oracles[key], await mutatedHelper(from, to)));
    for (const [label, from, to] of [
      ["刪除 postbuild 正規化掛勾", "const normalized = normalizeBrowserViewport(raw);", "const normalized = raw;"],
      ["刪除正規化 HTML 寫入", 'if (normalized !== raw) await writeFile(file.full, normalized, "utf8");', ""],
    ]) check(`源碼突變：${label}會被捉到`, !await normalizedByPostbuild(replaceOnce(postbuildSource, from, to)));
    const pathOnly = await versionBehavior(replaceOnce(postbuildSource, "JSON.stringify([critical, optional, htmlDigests])", "JSON.stringify([critical, optional])"));
    check("源碼突變：版本刪除 HTML 內容雜湊會被捉到", !pathOnly.changed && !pathOnly.otherPage);
    const hashBeforeFix = await versionBehavior(replaceOnce(postbuildSource, '.update(normalized).digest("hex")', '.update(raw).digest("hex")'));
    check("源碼突變：版本錯用正規化前 HTML 會被捉到", !hashBeforeFix.stable);
  } finally {await rm(dir, {recursive: true, force: true});}
}
