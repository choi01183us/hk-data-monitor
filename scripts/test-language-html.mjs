import {mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {parse} from "parse5";
import MiniSearch from "minisearch";
import * as language from "./lib/language-html.mjs";
import {createMarkdownIt, parseMarkdown} from "../node_modules/@observablehq/framework/dist/markdown.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const throws = (fn) => {try {fn(); return false;} catch {return true;}};
const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const fixtureCatalogue = {
  texts: {"政府收入": "Government revenue", "同": "and", "財政儲備": "Fiscal reserves", "公共開支": 'Public spending <script>unsafe</script> & "quoted"'},
  attributes: {"資料圖": 'Data chart & "units"', "讀數": "Read the figure"},
  titles: {"政府收入 | 香港": "Government revenue | Hong Kong"},
  pages: {"/one": {title: "政府收入", title_en: "Government revenue", keywords_en: "budget income"}},
};
const frame = (body, title = "政府收入 | 香港") => `<!doctype html><html><head><title>${title}</title><script>const original = "唔改程式";</script></head><body><main id="observablehq-main">${body}</main></body></html>`;
const fixture = frame('<h1 id="revenue">政府收入</h1><p>政府收入<strong>同</strong><a href="./reserves#source">財政儲備</a></p><strong id="figure">625,033</strong><img src="map.svg" alt="資料圖" title="讀數"><code>不翻譯鍵值</code><pre>不翻譯原始程式</pre><p lang="zh-HK">不翻譯來源標題</p>');
const localise = (module, input = fixture, translations = fixtureCatalogue) => module.localiseHtml(input, {path: "/one", translations});
function elements(html) {
  const result = [];
  function visit(node) {result.push(node); for (const child of node.childNodes ?? []) visit(child);}
  visit(parse(html));
  return result;
}
const attrs = (node) => Object.fromEntries((node.attrs ?? []).map(({name, value}) => [name, value]));

export async function testLanguageHtml(check) {
  console.log("\n[雙語靜態頁] 完整已編寫文案、HTML 保留及搜尋自證");
  const output = localise(language);
  const nodes = elements(output);
  const oracle = {
    paired: (m) => {const out = localise(m); return out.includes('data-language="en-GB"') && out.includes("Government revenue") && out.includes('data-language="zh-HK"');},
    missing: (m) => throws(() => localise(m, frame("未編寫新句子"))),
    unchanged: (m) => {const out = localise(m); return out.includes('<script>const original = "唔改程式";</script>') && out.includes('<code>不翻譯鍵值</code>') && out.includes('<pre>不翻譯原始程式</pre>') && out.includes('<p lang="zh-HK">不翻譯來源標題</p>');},
    fixture: (m) => {const html = '<html><head><title>其他測試文件</title></head><body>未編寫內容</body></html>'; return m.localiseHtml(html) === html;},
    attribute: (m) => {const nodes = elements(localise(m));const image = nodes.find((n) => n.tagName === "img"); return attrs(image).alt === "資料圖" && attrs(image)["data-en-alt"] === 'Data chart & "units"';},
    escape: (m) => {const out = localise(m, frame("公共開支")); return out.includes("&lt;script&gt;unsafe&lt;/script&gt;") && !out.includes("<script>unsafe</script>");},
  };
  for (const [key, label] of Object.entries({paired: "已編寫正文產生中英配對", missing: "新句子缺翻譯 hard fail", unchanged: "保留真正 script、code、pre 及原始來源文字", fixture: "非 Framework 測試 HTML 一字不改", attribute: "原始屬性保留，英文安全寫入明文標記", escape: "英文文案內 HTML 字元不會變可執行 markup"})) check(label, oracle[key](language));
  check("中文標題保留，加入一個英文標題 meta", nodes.filter((n) => n.tagName === "meta" && attrs(n).name === "hkdm:title-en-GB").length === 1 && nodes.some((n) => attrs(n).content === "Government revenue | Hong Kong") && output.includes("<title>政府收入 | 香港</title>"));
  check("原有 ID、連結、圖片及數字不複製或改動", nodes.filter((n) => attrs(n).id === "revenue").length === 1 && output.includes('href="./reserves#source"') && output.includes('id="figure">625,033</strong>') && output.includes('src="map.svg"'));
  check("預設 HTML 語言為繁中", attrs(nodes.find((n) => n.tagName === "html")).lang === "zh-HK");
  check("重跑同一雙語 HTML 完全不變", localise(language, output) === output);
  check("已配對 markup 不重複翻譯", !throws(() => localise(language, frame('<span data-language="zh-HK">額外已配對中文</span><span data-language="en-GB">Authored English</span>'))));
  check("缺少英文標題與屬性也 hard fail", throws(() => localise(language, frame("政府收入", "未編寫標題"))) && throws(() => localise(language, frame('<img alt="未編寫屬性">'))));
  check("過期英文標題被捉到", throws(() => localise(language, output.replace('content="Government revenue | Hong Kong"', 'content="Wrong page"'))));
  check("空白英文及錯型別不當作有效翻譯", ["", "  ", null, false].every((value) => throws(() => localise(language, frame("政府收入"), {...fixtureCatalogue, texts: {...fixtureCatalogue.texts, "政府收入": value}}))));
  check("不可插 span 的選項須改成明文雙語元件", throws(() => localise(language, frame('<select><option>政府收入</option></select>'))));

  const source = await readFile(new URL("./lib/language-html.mjs", import.meta.url), "utf8");
  const dir = await mkdtemp(join(tmpdir(), "hkdm-language-html-"));
  await symlink(join(root, "node_modules"), join(dir, "node_modules"), "dir");
  let sequence = 0;
  const replaceOnce = (source, from, to) => {if (source.split(from).length !== 2) throw new Error(`Language HTML mutation must match once: ${from}`); return source.replace(from, to);};
  async function mutated(from, to) {
    const local = replaceOnce(source, from, to).replace('new URL("../../src/lang/pages-en-GB.json", import.meta.url)', `new URL(${JSON.stringify(new URL("../src/lang/pages-en-GB.json", import.meta.url).href)})`);
    const path = join(dir, `mutated-${sequence++}.mjs`); await writeFile(path, local); return import(pathToFileURL(path).href);
  }
  try {
    for (const [label, from, to, key] of [
      ["刪除缺譯檢查", 'typeof translated !== "string" || !translated.trim()', "false", "missing"],
      ["所有 Framework 頁跳過翻譯", '!nodes.some((node) => attr(node, "id") === "observablehq-main")', "true", "paired"],
      ["非 Framework 文件也被處理", '!nodes.some((node) => attr(node, "id") === "observablehq-main")', "false", "fixture"],
      ["script 被當成文案", '["script", "style", "pre", "code", "textarea"]', '["style", "pre", "code", "textarea"]', "unchanged"],
      ["原始來源文字被翻譯", '(node.tagName !== "html" && attr(node, "lang") === "zh-HK")', "false", "unchanged"],
      ["遺漏屬性翻譯", '["aria-label", "title", "alt", "placeholder"]', '["aria-label", "title", "placeholder"]', "attribute"],
      ["英文內容直接變 markup", '${escapeText(separated)}', '${separated}', "escape"],
    ]) {
      const module = await mutated(from, to); let detected; try {detected = !oracle[key](module);} catch {detected = true;}
      check(`源碼突變：${label}會被捉到`, detected);
    }
    const noTitle = await mutated('const english = authored(translations.titles, title, path);', 'const english = "Wrong page";');
    check("源碼突變：英文標題指錯頁會被捉到", !localise(noTitle).includes('content="Government revenue | Hong Kong"'));
  } finally {await rm(dir, {recursive: true, force: true});}

  // Compile the actual current Markdown with the installed, pinned Framework parser.
  // No loader executes and no dist or network is needed, so new prose cannot bypass coverage.
  const md = createMarkdownIt(); let pageCount = 0;
  async function visit(directory) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      if (entry.name.startsWith(".") || ["data", "components", "assets", "lang"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith(".md")) {
        const parsed = parseMarkdown(await readFile(path, "utf8"), {md, path: `/${path.slice(join(root, "src").length + 1).replace(/\.md$/, "")}`});
        if (parsed.data.draft) continue;
        const title = parsed.title === "香港數據監測站" ? parsed.title : `${parsed.title} | 香港數據監測站`;
        let result, error;
        try {result = language.localiseHtml(frame(parsed.body, escape(title)), {path});} catch (e) {error = e;}
        check(`實際 Markdown 文案及標題全有英文：${parsed.path}`, !error && result.includes('name="hkdm:title-en-GB"'), error?.message);
        pageCount++;
      }
    }
  }
  await visit(join(root, "src"));
  check("有實際公開頁面參與翻譯覆蓋檢查", pageCount >= 37);

  const options = {fields: ["title", "text", "keywords"], storeFields: ["title"]};
  const original = new MiniSearch(options);
  original.add({id: "/one", title: "政府收入", text: "原有關鍵詞 保留", keywords: "財政"});
  const serialised = JSON.stringify({options, ...original.toJSON()});
  const translated = language.localiseSearchIndex(serialised, {translations: fixtureCatalogue});
  const rebuilt = MiniSearch.loadJSON(translated, options);
  check("搜尋保留一個 URL，同一結果含中英標題", rebuilt.documentCount === 1 && rebuilt.search("revenue")[0]?.id === "/one" && rebuilt.search("revenue")[0]?.title === "政府收入 · Government revenue");
  check("原有中文關鍵詞仍然可搜", rebuilt.search("原有關鍵詞")[0]?.id === "/one" && rebuilt.search("財政")[0]?.id === "/one");
  check("新增已編寫英文別名可搜", rebuilt.search("budget")[0]?.id === "/one" && language.englishSearchKeywords("/one", fixtureCatalogue).includes("budget"));
  check("搜尋格式變更、缺標題或原頁改名 hard fail", throws(() => language.localiseSearchIndex({...JSON.parse(serialised), serializationVersion: 9}, {translations: fixtureCatalogue})) && throws(() => language.localiseSearchIndex(serialised, {translations: {...fixtureCatalogue, pages: {}}})) && throws(() => language.localiseSearchIndex(serialised, {translations: {...fixtureCatalogue, pages: {"/one": {...fixtureCatalogue.pages["/one"], title: "另一頁"}}}})));
  check("搜尋重跑不增加關鍵詞或改變序列化內容", language.localiseSearchIndex(translated, {translations: fixtureCatalogue}) === translated);
  const duplicate = JSON.parse(serialised);
  duplicate.documentIds["9"] = "/one"; duplicate.storedFields["9"] = {title: "政府收入"};
  check("搜尋重複 URL hard fail", throws(() => language.localiseSearchIndex(duplicate, {translations: fixtureCatalogue})));

  const searchDir = await mkdtemp(join(tmpdir(), "hkdm-language-search-"));
  await symlink(join(root, "node_modules"), join(searchDir, "node_modules"), "dir");
  let searchSequence = 0;
  async function searchMutation(from, to) {
    const local = replaceOnce(source, from, to).replace('new URL("../../src/lang/pages-en-GB.json", import.meta.url)', `new URL(${JSON.stringify(new URL("../src/lang/pages-en-GB.json", import.meta.url).href)})`);
    const path = join(searchDir, `source-${searchSequence++}.mjs`); await writeFile(path, local); return import(pathToFileURL(path).href);
  }
  async function assetFixture(module = language, extra = {}) {
    const dist = join(searchDir, `fixture-${searchSequence++}`);
    await mkdir(join(dist, "_observablehq"), {recursive: true});
    const files = {
      "_observablehq/minisearch.11111111.json": serialised,
      "_observablehq/search.22222222.js": 'const data = await fetch(new URL("./minisearch.11111111.json", import.meta.url));',
      "index.html": '<script type="module">import "./_observablehq/search.22222222.js";</script><p>KEEP</p>',
      "style.css": "/* KEEP STYLE */", "unrelated.js": "// KEEP SCRIPT", ...extra,
    };
    for (const [path, content] of Object.entries(files)) await writeFile(join(dist, path), content);
    const result = await module.localiseSearchAssets(dist, {translations: fixtureCatalogue});
    return {dist, result, files: await readdir(join(dist, "_observablehq"))};
  }
  const rejects = async (fn) => {try {await fn(); return false;} catch {return true;}};
  try {
    for (const [label, from, to, predicate] of [
      ["接受未知搜尋格式", "input.serializationVersion !== 2", "false", (m) => !throws(() => m.localiseSearchIndex({...JSON.parse(serialised), serializationVersion: 9}, {translations: fixtureCatalogue}))],
      ["不保留原中文搜尋詞", 'if (field === "title") continue;', 'if (true) continue;', (m) => !MiniSearch.loadJSON(m.localiseSearchIndex(serialised, {translations: fixtureCatalogue}), options).search("原有關鍵詞").length],
      ["英文別名遺漏", 'keywords: `${row.keywords.join(" ")} ${page.title_en} ${page.keywords_en ?? ""}`', 'keywords: row.keywords.join(" ")', (m) => !MiniSearch.loadJSON(m.localiseSearchIndex(serialised, {translations: fixtureCatalogue}), options).search("budget").length],
      ["原頁改名仍通過", 'row.title !== page.title && row.title !== `${page.title} · ${page.title_en}`', "false", (m) => !throws(() => m.localiseSearchIndex(serialised, {translations: {...fixtureCatalogue, pages: {"/one": {...fixtureCatalogue.pages["/one"], title: "另一頁"}}}}))],
    ]) check(`源碼突變：${label}會被捉到`, predicate(await searchMutation(from, to)));
    const built = await assetFixture();
    const newIndex = await readFile(join(built.dist, "_observablehq", built.result.index), "utf8");
    const newModule = await readFile(join(built.dist, "_observablehq", built.result.module), "utf8");
    const newHtml = await readFile(join(built.dist, "index.html"), "utf8");
    check("真正 dist 搜尋 JSON 與 import 模組同時換內容雜湊檔名", built.result.changed && /^minisearch\.[a-f0-9]{8}\.json$/.test(built.result.index) && /^search\.[a-f0-9]{8}\.js$/.test(built.result.module) && newModule.includes(built.result.index));
    check("真正 HTML 指向新搜尋模組，旧雜湊檔被移除", newHtml.includes(built.result.module) && !newHtml.includes("search.22222222.js") && !built.files.includes("minisearch.11111111.json") && !built.files.includes("search.22222222.js"));
    check("其他資源一字不改", await readFile(join(built.dist, "style.css"), "utf8") === "/* KEEP STYLE */" && await readFile(join(built.dist, "unrelated.js"), "utf8") === "// KEEP SCRIPT");
    check("真正新搜尋檔英文可搜且冇重複 URL", MiniSearch.loadJSON(newIndex, options).search("revenue")[0]?.id === "/one" && JSON.parse(newIndex).documentCount === 1);
    check("搜尋資源重跑完全冪等", !(await language.localiseSearchAssets(built.dist, {translations: fixtureCatalogue})).changed && await readFile(join(built.dist, "index.html"), "utf8") === newHtml && await readFile(join(built.dist, "_observablehq", built.result.index), "utf8") === newIndex);
    check("冇搜尋資源的 fixture 不需要新檔案", !(await language.localiseSearchAssets(join(searchDir, "absent"))).changed);
    for (const [name, extra] of [
      ["未知 import 指向", {"_observablehq/search.22222222.js": 'fetch("different.json")'}],
      ["重複 JSON", {"_observablehq/minisearch.33333333.json": serialised}],
      ["新增未支援資源引用", {"unrelated.js": 'import "./_observablehq/search.22222222.js";'}],
      ["沒有 HTML 引用", {"index.html": "<p>No search reference</p>"}],
      ["搜尋 URL 重複", {"_observablehq/minisearch.11111111.json": JSON.stringify(duplicate)}],
    ]) check(`真正搜尋資源守衛：${name} hard fail`, await rejects(() => assetFixture(language, extra)));
    for (const [name, from, to, bad] of [
      ["HTML 未換新 module", "raw.replaceAll(oldModule, moduleName).replaceAll(oldIndex, indexName)", "raw.replaceAll(oldIndex, indexName)", async (m) => {const f = await assetFixture(m); return (await readFile(join(f.dist, "index.html"), "utf8")).includes("search.22222222.js");}],
      ["module 未換新 index", "const module = rawModule.replace(oldIndex, indexName);", "const module = rawModule;", async (m) => {const f = await assetFixture(m); return !(await readFile(join(f.dist, "_observablehq", f.result.module), "utf8")).includes(f.result.index);}],
      ["遺留舊雜湊檔", "if (oldIndex !== indexName) await unlink(join(assetDir, oldIndex));", "", async (m) => (await assetFixture(m)).files.includes("minisearch.11111111.json")],
      ["跳過未知其他引用守衛", 'source.includes(oldModule) || source.includes(oldIndex)', "false", async (m) => !await rejects(() => assetFixture(m, {"unrelated.js": 'import "./_observablehq/search.22222222.js";'}))],
      ["跳過 HTML 引用守衛", 'if (references === 0) throw new Error("Search module has no HTML reference");', "", async (m) => !await rejects(() => assetFixture(m, {"index.html": "<p>No reference</p>"}))],
    ]) check(`源碼突變：${name}會被捉到`, await bad(await searchMutation(from, to)));
  } finally {await rm(searchDir, {recursive: true, force: true});}
}
