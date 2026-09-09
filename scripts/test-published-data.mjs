import {execFile} from "node:child_process";
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {promisify} from "node:util";
import * as siteMeta from "../src/data/_lib/site-meta.js";

const runNode = promisify(execFile);

export async function testPublishedData(check) {
  console.log("\n[發布資料] 草稿快照不影響公開網站離線日期");
  const shown = {indicator_id: "shown", updated_at: "2026-03-23", series: [{period: "2026", value: 4}]};
  const draft = {indicator_id: "another_city", updated_at: "2020-12-31", series: [{period: "2020", value: 8}]};
  const todo = {indicator_id: "todo", updated_at: "2019-01-01", manual_status: "todo", series: [{period: "2019", value: null}]};
  const docs = [shown, draft, todo];
  const attachment = (id, hash = "0123abcd") => `./_file/data/${id}.${hash}.json`;
  const paths = [attachment("shown"), attachment("todo"), "./index.html", "./_file/data/geography.0123abcd.json"];
  const ids = (selected) => selected.map((doc) => doc.indicator_id).join(",");
  const oracles = {
    subset: (m) => ids(m.selectPublishedIndicators(docs, paths)) === "shown,todo",
    empty: (m) => m.selectPublishedIndicators(docs, []).length === 0 && m.selectPublishedIndicators([], paths).length === 0,
    restore: (m) => ids(m.selectPublishedIndicators(docs, [...paths, attachment("another_city")])) === "shown,another_city,todo",
    identity: (m) => {
      const selected = m.selectPublishedIndicators(docs, [attachment("todo"), attachment("shown"), attachment("shown", "fedcba98")]);
      return selected.length === 2 && selected[0] === shown && selected[1] === todo;
    },
    exact: (m) => m.selectPublishedIndicators(docs, [
      "./data/shown.0123abcd.json", "./_file/other/shown.0123abcd.json", "./_file/data/shown.json",
      "./_file/data/shown.0123ZZZZ.json", "./_file/data/shown.0123abc.json", "./_file/data/shown.0123abcde.json",
      "./_file/data/shown.0123abcd.json.js", "./_file/data/shown.0123abcd.json?preview=1",
      "https://example.org/_file/data/shown.0123abcd.json", "../_file/data/shown.0123abcd.json",
      "./_file/data/hidden_shown.0123abcd.json", "./_file/data/shown_extra.0123abcd.json",
    ]).length === 0,
    date: (m) => m.pickDataAsOf(m.selectPublishedIndicators(docs, paths)) === "2026-03-23",
  };
  for (const [key, label] of [
    ["subset", "已知附件只選 shown 與 todo，保留來源順序"],
    ["empty", "冇附件或冇快照，發布名單為空"],
    ["restore", "重新發布另一城市附件，資料自動重新計入"],
    ["identity", "同指標重複附件不複製資料，保留原始物件"],
    ["exact", "相似 id、錯目錄、錯雜湊及非 JSON 附件唔誤認為已發布"],
    ["date", "已知答案：有數但未發布的 2020 快照不拉低 2026 日期"],
  ]) check(label, oracles[key](siteMeta));
  check("已知答案：重新發布舊快照後，日期返回 2020-12-31", siteMeta.pickDataAsOf(siteMeta.selectPublishedIndicators(docs, [...paths, attachment("another_city")])) === "2020-12-31");
  check("已知答案：只有未填快照被發布，日期為 null", siteMeta.pickDataAsOf(siteMeta.selectPublishedIndicators(docs, [attachment("todo")])) === null);

  const helperSource = await readFile(new URL("../src/data/_lib/site-meta.js", import.meta.url), "utf8");
  const postbuildSource = await readFile(new URL("./postbuild.mjs", import.meta.url), "utf8");
  const viewportSource = await readFile(new URL("./lib/viewport.mjs", import.meta.url), "utf8");
  const dir = await mkdtemp(join(tmpdir(), "hkdm-published-data-"));
  let sequence = 0;
  function replaceOnce(source, from, to) {
    if (source.split(from).length !== 2) throw new Error(`源碼突變必須精確命中一次：${from}`);
    return source.replace(from, to);
  }
  async function mutated(from, to) {
    const path = join(dir, `helper-${sequence++}.mjs`);
    await writeFile(path, replaceOnce(helperSource, from, to));
    return import(pathToFileURL(path).href);
  }
  async function runPostbuild(source = postbuildSource, published = ["shown", "todo"]) {
    const root = join(dir, `fixture-${sequence++}`);
    for (const path of ["scripts/lib", "src/components", "src/data/_lib", "src/data/_snapshots", "src/data/_city_snapshots", "public", "dist/_file/data"]) await mkdir(join(root, path), {recursive: true});
    const files = {
      "package.json": '{"type":"module"}',
      "scripts/postbuild.mjs": source.replace('"./lib/language-html.mjs"', JSON.stringify(new URL("./lib/language-html.mjs", import.meta.url).href)).replace('"./lib/anchor-html.mjs"', JSON.stringify(new URL("./lib/anchor-html.mjs", import.meta.url).href)),
      "scripts/lib/viewport.mjs": viewportSource,
      "src/data/_lib/site-meta.js": helperSource,
      "public/sw-template.js": 'const VERSION = "__VERSION__";\nconst DATE = "__DATA_AS_OF__";\nconst CRITICAL = __CRITICAL__;\nconst OPTIONAL = __OPTIONAL__;\n',
      "src/components/locale.js": await readFile(new URL("../src/components/locale.js", import.meta.url), "utf8"),
      "public/language-switch.js": await readFile(new URL("../public/language-switch.js", import.meta.url), "utf8"),
      "public/language.css": await readFile(new URL("../public/language.css", import.meta.url), "utf8"),
      "public/manifest.webmanifest": "{}", "public/icon.svg": "<svg/>", "public/offline-banner.js": "// banner",
      "dist/index.html": '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>公開頁面</body></html>',
    };
    for (const doc of docs) files[`src/data/_snapshots/${doc.indicator_id}.json`] = JSON.stringify(doc);
    for (const id of published) files[`dist/${attachment(id).slice(2)}`] = JSON.stringify(docs.find((doc) => doc.indicator_id === id));
    for (const [path, content] of Object.entries(files)) await writeFile(join(root, path), content);
    const {stdout} = await runNode(process.execPath, [join(root, "scripts/postbuild.mjs")], {cwd: root, timeout: 15000});
    const sw = await readFile(join(root, "dist/sw.js"), "utf8");
    const date = sw.match(/const DATE = "([^"]*)";/)?.[1];
    const critical = JSON.parse(sw.match(/const CRITICAL = (\[[\s\S]*?\]);/)?.[1] ?? "null");
    return {date, critical, stdout};
  }
  const detects = (oracle, module) => {try {return !oracle(module);} catch {return true;}};
  try {
    for (const [label, from, to, key] of [
      ["跳過發布篩選", "return docs.filter((doc) => ids.has(doc.indicator_id));", "return docs;", "subset"],
      ["錯用路徑完整比對 id", "[match[1]]", "[match[0]]", "subset"],
      ["反轉來源順序", "return docs.filter((doc) => ids.has(doc.indicator_id));", "return docs.filter((doc) => ids.has(doc.indicator_id)).reverse();", "identity"],
      ["不接受重新發布的城市", "ids.has(doc.indicator_id)", 'ids.has(doc.indicator_id) && doc.indicator_id !== "another_city"', "restore"],
      ["接受非八位雜湊", "[a-f0-9]{8}", "[a-f0-9]+", "exact"],
      ["接受非十六進位雜湊", "[a-f0-9]{8}", "[a-zA-Z0-9]{8}", "exact"],
      ["接受 JSON 後綴以外內容", "\\.json$/", "\\.json/", "exact"],
      ["錯把指標名稱作部分配對", "ids.has(doc.indicator_id)", "[...ids].some((id) => id.includes(doc.indicator_id))", "exact"],
    ]) check(`源碼突變：${label}會被捉到`, detects(oracles[key], await mutated(from, to)));

    const published = await runPostbuild();
    check("真正 postbuild 用已發布附件計日期", published.date === "2026-03-23");
    check("未發布快照唔會自行加入真正 precache", !published.critical.some((path) => path.includes("another_city")));
    check("已發布附件列入 precache", published.critical.includes(attachment("shown")) && published.critical.includes(attachment("todo")));
    check("真正 postbuild 只報已發布而未填數的指標", /未有數據\s+todo/.test(published.stdout) && !/未有數據[^\n]*another_city/.test(published.stdout));
    check("真正 postbuild 重新發布附件後恢復日期", (await runPostbuild(postbuildSource, ["shown", "another_city", "todo"])).date === "2020-12-31");
    check("真正 postbuild 容許無資料附件的最小網站", (await runPostbuild(postbuildSource, [])).date === "");
    check("真正 postbuild 只有 todo 附件時不產生假日期", (await runPostbuild(postbuildSource, ["todo"])).date === "");
    for (const [label, from, to] of [
      ["刪除真正 postbuild 發布篩選掛勾", "const publishedDocs = selectPublishedIndicators(docs, files.map((file) => file.path));", "const publishedDocs = docs;"],
      ["截至日錯讀全 repo 快照", "const dataAsOf = pickDataAsOf(publishedDocs);", "const dataAsOf = pickDataAsOf(docs);"],
    ]) check(`源碼突變：${label}會被捉到`, (await runPostbuild(replaceOnce(postbuildSource, from, to))).date !== "2026-03-23");
  } finally {await rm(dir, {recursive: true, force: true});}
}
