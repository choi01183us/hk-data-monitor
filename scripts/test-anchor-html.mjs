import assert from "node:assert/strict";
import {copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {parse} from "parse5";
import * as production from "./lib/anchor-html.mjs";
import {CENSTATD_INDICATORS} from "../src/data/_lib/indicators.js";
import {computeContentHash} from "../src/data/_lib/schema.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BLOCK_ID = "hkdm-english-anchors";
const FILE_HASH = "1234abcd";
const runFile = promisify(execFile);
const attachment = (id) => `${id}.${FILE_HASH}.json`;
const frame = (ids = ["cpi"], head = "") => `<!doctype html><html><head><title>香港數據</title>${head}</head><body><main id="observablehq-main"><h1>物價</h1></main><script type="module">${ids.map((id) => `registerFile("../data/${id}.json", {"name":"../data/${id}.json","mimeType":"application/json","path":"../_file/data/${attachment(id)}"});`).join("\n")}</script></body></html>`;
function anchorBlock(html) {
  const blocks = [];
  function visit(node) {
    if (node.tagName === "script" && node.attrs?.some(({name, value}) => name === "id" && value === BLOCK_ID)) blocks.push(node);
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(parse(html));
  assert.equal(blocks.length, 1, "Exactly one English anchor data block is required");
  const node = blocks[0];
  assert.equal(node.attrs.find(({name}) => name === "type")?.value, "application/json");
  return JSON.parse(node.childNodes.map((child) => child.value ?? "").join(""));
}
const rejects = async (fn) => {try {await fn(); return false;} catch {return true;}};
const replaceOnce = (source, from, to) => {
  if (source.split(from).length !== 2) throw new Error(`Anchor HTML mutation must match once: ${from}`);
  return source.replace(from, to);
};

export async function testAnchorHtml(check) {
  console.log("\n[英文錨點發布] 最終快照、實際附件及 HTML 注入自證");
  const directory = await mkdtemp(join(tmpdir(), "hkdm-anchor-html-"));
  const cpi = JSON.parse(await readFile(join(ROOT, "src/data/_snapshots/cpi.json"), "utf8"));
  const imports = JSON.parse(await readFile(join(ROOT, "src/data/_snapshots/goods_imports.json"), "utf8"));
  let sequence = 0;
  async function fixture({snapshots = [cpi, imports], published = snapshots} = {}) {
    const path = join(directory, `fixture-${sequence++}`);
    const snapshotDir = join(path, "snapshots");
    const distDir = join(path, "dist");
    await Promise.all([mkdir(snapshotDir, {recursive: true}), mkdir(join(distDir, "_file/data"), {recursive: true})]);
    await Promise.all([
      ...snapshots.map((doc) => writeFile(join(snapshotDir, `${doc.indicator_id}.json`), JSON.stringify(doc))),
      ...published.map((doc) => writeFile(join(distDir, "_file/data", attachment(doc.indicator_id)), JSON.stringify(doc))),
    ]);
    return {snapshotDir, distDir, fixtureDir: join(ROOT, "src/data/_fixtures")};
  }
  const inject = async (module, options, html = frame()) => module.createEnglishAnchorInjector(options)(html);
  try {
    const original = await fixture();
    const output = await inject(production, original);
    const anchors = anchorBlock(output);
    check("實際 CPI 附件產生按 1.7% 計算嘅英文 HK$101.7", anchors.cpi["hundred-dollars"].text_en.includes("HK$101.7"));
    check("頁面只收到實際引用指標嘅英文錨點", Object.keys(anchors).join(",") === "cpi" && !output.includes('"goods_imports"'));
    check("英文資料寫入 head，原始正文及附件連結保留", output.indexOf(`id="${BLOCK_ID}"`) < output.indexOf("</head>") && output.includes('<h1>物價</h1>') && output.includes(`../_file/data/${attachment("cpi")}`));
    check("同一個 injector 重跑既有 HTML 完全不變", await production.createEnglishAnchorInjector(original)(output) === output);
    const replaced = await inject(production, original, frame(["cpi"], `<script type="application/json" id="${BLOCK_ID}">{"obsolete":"_file/data/missing.1234abcd.json"}</script>`));
    check("重跑會取代舊英文資料，唔保留另一輪建置嘅錨點", !replaced.includes('"obsolete"') && anchorBlock(replaced).cpi["hundred-dollars"].text_en.includes("HK$101.7"));
    const multi = anchorBlock(await inject(production, original, frame(["cpi", "goods_imports", "cpi"])));
    check("多指標頁只收齊引用指標一次", Object.keys(multi).sort().join(",") === "cpi,goods_imports" && Object.keys(multi.goods_imports).length > 0);

    const refreshed = structuredClone(cpi);
    refreshed.series.at(-1).value = 5;
    refreshed.latest.value = 5;
    refreshed.anchors = CENSTATD_INDICATORS.cpi.anchors(refreshed.series);
    refreshed.content_hash = computeContentHash(refreshed);
    const freshOptions = await fixture({snapshots: [refreshed, imports]});
    const freshOutput = await inject(production, freshOptions);
    const publishedFresh = JSON.parse(await readFile(join(freshOptions.distDir, "_file/data", attachment("cpi")), "utf8"));
    check("真實生產 generator：最終 CPI 更新至 5%，英文同步變 HK$105", anchorBlock(freshOutput).cpi["hundred-dollars"].text_en.includes("HK$105") && !freshOutput.includes("HK$101.7"));
    check("注入英文保留實際發布 CPI 5% 及相同內容 hash", publishedFresh.series.at(-1).value === 5 && publishedFresh.latest.value === 5 && publishedFresh.content_hash === refreshed.content_hash && computeContentHash(publishedFresh) === refreshed.content_hash);
    const stale = await fixture({snapshots: [refreshed, imports], published: [cpi, imports]});
    check("舊附件配新快照 hard fail，唔會發布半新半舊比較", await rejects(() => inject(production, stale)));
    const historicalRevision = structuredClone(cpi);
    historicalRevision.series[0].value += 0.1;
    historicalRevision.content_hash = computeContentHash(historicalRevision);
    const historical = await fixture({snapshots: [historicalRevision, imports], published: [cpi, imports]});
    check("即使最新比較一樣，漏咗歷史修訂嘅附件亦 hard fail", await rejects(() => inject(production, historical)));

    const tampered = structuredClone(cpi);
    tampered.series.at(-1).value = 99;
    const corrupted = await fixture({published: [tampered, imports]});
    check("附件沿用舊 hash 但實際數據被改 hard fail", await rejects(() => inject(production, corrupted)));
    const missing = await fixture({published: [imports]});
    check("頁面引用嘅附件不存在 hard fail", await rejects(() => inject(production, missing)));
    const wrongId = await fixture();
    await writeFile(join(wrongId.distDir, "_file/data", attachment("cpi")), JSON.stringify(imports));
    check("附件檔名同 indicator_id 不符 hard fail", await rejects(() => inject(production, wrongId)));
    const unknown = await fixture();
    const unknownDoc = {...cpi, indicator_id: "unknown_indicator"};
    unknownDoc.content_hash = computeContentHash(unknownDoc);
    await writeFile(join(unknown.distDir, "_file/data", attachment("unknown_indicator")), JSON.stringify(unknownDoc));
    check("頁面引用無最終快照嘅指標 hard fail", await rejects(() => inject(production, unknown, frame(["unknown_indicator"]))));
    const duplicateSnapshots = await fixture();
    await writeFile(join(duplicateSnapshots.snapshotDir, "duplicate.json"), JSON.stringify(cpi));
    check("兩份最終快照有相同 indicator_id hard fail", await rejects(() => inject(production, duplicateSnapshots)));
    const changedMetadata = structuredClone(cpi);
    changedMetadata.basis_zh += " 新口徑";
    changedMetadata.content_hash = computeContentHash(changedMetadata);
    const metadata = await fixture({snapshots: [changedMetadata, imports]});
    check("附件同快照一致但缺已編寫英文口徑仍然 hard fail", await rejects(() => inject(production, metadata)));
    const changedChinese = structuredClone(cpi);
    changedChinese.anchors[0].basis_zh += " 錯算式";
    changedChinese.content_hash = computeContentHash(changedChinese);
    const chinese = await fixture({snapshots: [changedChinese, imports]});
    check("附件同快照一致但中文錨點偏離生產算式仍然 hard fail", await rejects(() => inject(production, chinese)));

    const noMain = '<html><head><title>測試</title></head><body><script>const marker = "observablehq-main"; const file = "_file/data/cpi.1234abcd.json";</script></body></html>';
    const absent = {snapshotDir: join(directory, "absent-snapshots"), distDir: join(directory, "absent-dist"), fixtureDir: join(directory, "absent-fixtures")};
    check("無實際 Framework main 元素嘅 fixture 一字不改亦唔讀資料", await inject(production, absent, noMain) === noMain);
    const duplicate = frame(["cpi"], `<script type="application/json" id="${BLOCK_ID}">{}</script><script type="application/json" id="${BLOCK_ID}">{}</script>`);
    check("重複英文資料 ID hard fail", await rejects(() => inject(production, original, duplicate)));
    const dangerous = {cpi: {example: {text_en: '</script><script id="unexpected">window.injected = true</script>\u2028\u2029'}}};
    const escaping = (module) => {
      const payload = module.serialiseAnchorPayload(dangerous);
      return !/[<\u2028\u2029]/u.test(payload) && payload.includes("\\u003c") && payload.includes("\\u2028") && payload.includes("\\u2029") && JSON.stringify(anchorBlock(frame([], `<script type="application/json" id="${BLOCK_ID}">${payload}</script>`))) === JSON.stringify(dangerous);
    };
    check("已知 HTML 結束標籤及 Unicode 分隔符安全逸出，JSON 完整還原", escaping(production));

    // Source mutations below exercise the production implementation, with only
    // import locations rewritten so each changed module runs in an isolated path.
    const source = await readFile(new URL("./lib/anchor-html.mjs", import.meta.url), "utf8");
    await symlink(join(ROOT, "node_modules"), join(directory, "node_modules"), "dir");
    async function mutated(from, to, input = source) {
      const altered = replaceOnce(input, from, to).replace(/(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g, (_, prefix, path, suffix) => `${prefix}${new URL(path, new URL("./lib/anchor-html.mjs", import.meta.url)).href}${suffix}`);
      const path = join(directory, `mutation-${sequence++}.mjs`);
      await writeFile(path, altered);
      return import(pathToFileURL(path).href);
    }
    const oracle = {
      payload: async (module) => anchorBlock(await inject(module, freshOptions)).cpi["hundred-dollars"].text_en.includes("HK$105"),
      computedHash: (module) => rejects(() => inject(module, corrupted)),
      finalHash: (module) => rejects(() => inject(module, historical)),
      metadata: (module) => rejects(() => inject(module, metadata)),
      fixture: async (module) => await inject(module, absent, noMain) === noMain,
      duplicate: (module) => rejects(() => inject(module, original, duplicate)),
      duplicateSnapshots: (module) => rejects(() => inject(module, duplicateSnapshots)),
      multi: async (module) => Object.keys(anchorBlock(await inject(module, original, frame(["cpi", "goods_imports"])))).sort().join(",") === "cpi,goods_imports",
      idempotent: async (module) => await inject(module, original, output) === output,
      escaping,
    };
    for (const [name, from, to, key] of [
      ["唔重算附件 hash", "computeContentHash(doc) !== doc.content_hash", "false", "computedHash"],
      ["唔對最終快照 hash", "doc.content_hash !== final.content_hash", "false", "finalHash"],
      ["跳過已編寫英文口徑檢查", "assertEnglishMetadata(doc);", "void doc;", "metadata"],
      ["所有正式頁面跳過注入", '!nodes.some((node) => attr(node, "id") === "observablehq-main")', "true", "payload"],
      ["非 Framework fixture 亦讀快照", '!nodes.some((node) => attr(node, "id") === "observablehq-main")', "false", "fixture"],
      ["刪除重複 ID 檢查", "if (existing.length > 1)", "if (false)", "duplicate"],
      ["容許同一指標重複最終快照", "if (snapshots.has(doc.indicator_id))", "if (false)", "duplicateSnapshots"],
      ["多指標頁靜靜遺漏另一個指標", "paths.set(id, path);", 'if (id === "cpi") paths.set(id, path);', "multi"],
      ["重跑唔取代上一輪英文資料", "const clean = old ? html.slice(0, old.startOffset) + html.slice(old.endOffset) : html;", "const clean = html;", "idempotent"],
      ["唔逸出 HTML 標籤", '.replaceAll("<", "\\\\u003c")', "", "escaping"],
      ["唔逸出 U+2028", '.replaceAll("\\u2028", "\\\\u2028")', "", "escaping"],
      ["唔逸出 U+2029", '.replaceAll("\\u2029", "\\\\u2029")', "", "escaping"],
    ]) {
      const module = await mutated(from, to);
      let detected;
      try {detected = !await oracle[key](module);} catch {detected = true;}
      check(`生產 helper 源碼突變：${name}會被捉到`, detected);
    }
    // Hash checks overlap with anchor checks. Introduce a wrong pairing only
    // after the real source generator has passed, then prove the Chinese pins
    // reject it and that removing those pins makes this exact oracle fail.
    for (const field of ["text_zh", "basis_zh"]) {
      const fault = `const entries = structuredClone(english[id]); Object.values(entries)[0].${field} += " deliberate mismatch";`;
      const faulted = await mutated("const entries = english[id];", fault);
      check(`發布配對故障注入：${field} 錯配會被真正 pin 檢查捉到`, await rejects(() => inject(faulted, original)));
      const unguarded = await mutated("!saved || saved.text_zh !== anchor.text_zh || saved.basis_zh !== anchor.basis_zh", "false", replaceOnce(source, "const entries = english[id];", fault));
      check(`生產 helper 源碼突變：移除 pin 檢查無法識別 ${field} 同一錯配`, !await rejects(() => inject(unguarded, original)));
    }

    // Exercise the real postbuild entry point, including localisation, payload
    // injection, viewport repair, inventory and service-worker generation.
    const postbuildSource = await readFile(new URL("./postbuild.mjs", import.meta.url), "utf8");
    async function postbuildFixture(sourceText) {
      const path = join(directory, `postbuild-${sequence++}`);
      const folders = ["scripts", "public", "src/components", "src/data/_snapshots", "src/data/_city_snapshots", "dist/_file/data"];
      await Promise.all(folders.map((folder) => mkdir(join(path, folder), {recursive: true})));
      await Promise.all([
        ...["manifest.webmanifest", "icon.svg", "offline-banner.js", "language-switch.js", "language.css", "sw-template.js"].map((name) => copyFile(join(ROOT, "public", name), join(path, "public", name))),
        copyFile(join(ROOT, "src/components/locale.js"), join(path, "src/components/locale.js")),
        writeFile(join(path, "src/data/_snapshots/cpi.json"), JSON.stringify(refreshed)),
        writeFile(join(path, "dist/_file/data", attachment("cpi")), JSON.stringify(refreshed)),
      ]);
      const html = frame().replace("香港數據", "CPI fixture").replace("物價", "English fixture").replace("</head>", '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"></head>');
      await writeFile(join(path, "dist/index.html"), html);
      const rewritten = sourceText.replace(/(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g, (_, prefix, relative, suffix) => `${prefix}${new URL(relative, new URL("./postbuild.mjs", import.meta.url)).href}${suffix}`);
      const entry = join(path, "scripts/postbuild.mjs");
      await writeFile(entry, rewritten);
      return {path, entry};
    }
    const built = await postbuildFixture(postbuildSource);
    await runFile(process.execPath, [built.entry], {cwd: built.path});
    const builtHtml = await readFile(join(built.path, "dist/index.html"), "utf8");
    const builtCpi = JSON.parse(await readFile(join(built.path, "dist/_file/data", attachment("cpi")), "utf8"));
    check("真正 postbuild：5% 新 CPI 發布附件同 HK$105 英文同時保留", anchorBlock(builtHtml).cpi["hundred-dollars"].text_en.includes("HK$105") && builtCpi.latest.value === 5 && computeContentHash(builtCpi) === refreshed.content_hash);
    const worker = await readFile(join(built.path, "dist/sw.js"), "utf8");
    check("真正 postbuild：同一輪生成可離線用嘅頁面及 CPI 快取", worker.includes(`./_file/data/${attachment("cpi")}`) && !builtHtml.includes("maximum-scale=1"));
    await runFile(process.execPath, [built.entry], {cwd: built.path});
    check("真正 postbuild 重跑保留相同 HTML 及 service worker", await readFile(join(built.path, "dist/index.html"), "utf8") === builtHtml && await readFile(join(built.path, "dist/sw.js"), "utf8") === worker);
    const skipped = await postbuildFixture(replaceOnce(postbuildSource, "const raw = await injectEnglishAnchors(localised);", "const raw = localised;"));
    await runFile(process.execPath, [skipped.entry], {cwd: skipped.path});
    let skippedDetected = false;
    try {anchorBlock(await readFile(join(skipped.path, "dist/index.html"), "utf8"));} catch {skippedDetected = true;}
    check("真正 postbuild 源碼突變：移除英文注入 hook 會被捉到", skippedDetected);
  } finally {await rm(directory, {recursive: true, force: true});}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let count = 0;
  await testAnchorHtml((name, pass) => {assert.ok(pass, name); count += 1;});
  console.log(`${count} published English anchor checks passed.`);
}
