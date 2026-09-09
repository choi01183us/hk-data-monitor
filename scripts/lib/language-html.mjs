import {readFileSync} from "node:fs";
import {readFile, readdir, writeFile, unlink} from "node:fs/promises";
import {createHash} from "node:crypto";
import {join} from "node:path";
import {parse} from "parse5";
import MiniSearch from "minisearch";

const catalogue = JSON.parse(readFileSync(new URL("../../src/lang/pages-en-GB.json", import.meta.url), "utf8"));
const CHINESE = /[\u3400-\u9fff]/;
const SKIP = new Set(["script", "style", "pre", "code", "textarea"]);
const ATTRIBUTES = ["aria-label", "title", "alt", "placeholder"];
const escapeText = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const escapeAttribute = (value) => escapeText(value).replaceAll('"', "&quot;");
const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;

function authored(table, value, path) {
  const translated = table[value];
  if (typeof translated !== "string" || !translated.trim()) throw new Error(`Missing authored en-GB translation (${path}): ${value}`);
  return translated;
}

/** Translate only authored Framework page presentation, before hashing HTML for offline use. */
export function localiseHtml(html, {path = "(page)", translations = catalogue} = {}) {
  if (typeof html !== "string") throw new Error("Language HTML input must be a string");
  const tree = parse(html, {sourceCodeLocationInfo: true});
  const nodes = [];
  function collect(node) {nodes.push(node); for (const child of node.childNodes ?? []) collect(child);}
  collect(tree);
  // Other HTML is outside the authored website, including postbuild test fixtures.
  if (!nodes.some((node) => attr(node, "id") === "observablehq-main")) return html;
  const edits = [];
  const head = nodes.find((node) => node.tagName === "head");
  const root = nodes.find((node) => node.tagName === "html");
  const titleNode = nodes.find((node) => node.tagName === "title");
  const title = titleNode?.childNodes?.map((node) => node.value ?? "").join("").trim();
  const existingTitle = nodes.find((node) => node.tagName === "meta" && attr(node, "name") === "hkdm:title-en-GB");
  if (title && CHINESE.test(title)) {
    const english = authored(translations.titles, title, path);
    if (!head?.sourceCodeLocation?.endTag) throw new Error(`Missing page head (${path})`);
    if (existingTitle) {
      if (attr(existingTitle, "content") !== english) throw new Error(`Stale English page title (${path})`);
    } else edits.push({start: head.sourceCodeLocation.endTag.startOffset, end: head.sourceCodeLocation.endTag.startOffset, text: `<meta name="hkdm:title-en-GB" content="${escapeAttribute(english)}">\n`});
  }
  if (root?.sourceCodeLocation?.startTag && attr(root, "lang") === undefined) {
    const at = root.sourceCodeLocation.startTag.endOffset - 1;
    edits.push({start: at, end: at, text: ' lang="zh-HK"'});
  }

  function visit(node, skip = false) {
    skip = skip || SKIP.has(node.tagName) || node.tagName === "title" ||
      attr(node, "data-language") !== undefined || (node.tagName !== "html" && attr(node, "lang") === "zh-HK");
    if (skip) return;
    const additions = [];
    for (const name of ATTRIBUTES) {
      const original = attr(node, name);
      if (original === undefined || !CHINESE.test(original) || attr(node, `data-en-${name}`) !== undefined) continue;
      additions.push(` data-en-${name}="${escapeAttribute(authored(translations.attributes, original, path))}"`);
    }
    if (additions.length) {
      if (!node.sourceCodeLocation?.startTag) throw new Error(`Attribute without source location (${path})`);
      let at = node.sourceCodeLocation.startTag.endOffset - 1;
      if (html[at - 1] === "/") at--;
      edits.push({start: at, end: at, text: additions.join("")});
    }
    if (node.nodeName === "#text" && CHINESE.test(node.value)) {
      const value = node.value.trim();
      const english = authored(translations.texts, value, path);
      if (!node.sourceCodeLocation) throw new Error(`Text without source location (${path})`);
      if (["option", "svg", "text", "tspan"].includes(node.parentNode?.tagName)) throw new Error(`Static text needs an explicit localised component (${path}): ${value}`);
      const leading = node.value.slice(0, node.value.indexOf(value));
      const trailing = node.value.slice(node.value.indexOf(value) + value.length);
      // Chinese often joins inline nodes without spaces. English words need a boundary;
      // punctuation fragments attach directly to the preceding translated phrase.
      const separated = /^[,.;:!?…)]/.test(english) ? english : ` ${english}`;
      const text = `${escapeText(leading)}<span data-language="zh-HK" lang="zh-HK">${escapeText(value)}</span><span data-language="en-GB" lang="en-GB">${escapeText(separated)}</span>${escapeText(trailing)}`;
      edits.push({start: node.sourceCodeLocation.startOffset, end: node.sourceCodeLocation.endOffset, text});
    }
    for (const child of node.childNodes ?? []) visit(child, skip);
  }
  visit(tree);
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let previous = html.length + 1;
  for (const edit of edits) {
    if (edit.end > previous) throw new Error(`Overlapping language edits (${path})`);
    html = html.slice(0, edit.start) + edit.text + html.slice(edit.end);
    previous = edit.start;
  }
  return html;
}

/** English terms to supplement the existing search record, never a second URL/result. */
export function englishSearchKeywords(path, translations = catalogue) {
  const canonical = path === "/" ? "/index" : path.replace(/\.html$/, "");
  const title = translations.pages[canonical]?.title_en;
  if (typeof title !== "string" || !title.trim()) throw new Error(`Missing English search keywords: ${path}`);
  return `${title} ${translations.pages[canonical]?.keywords_en ?? ""}`.trim();
}

/**
 * Rebuild the Framework index with its original term frequencies and one bilingual title per URL.
 * The caller must give the new JSON and its importing search module new content-hashed names.
 */
export function localiseSearchIndex(json, {translations = catalogue} = {}) {
  const input = typeof json === "string" ? JSON.parse(json) : json;
  if (input.options?.fields?.join() !== "title,text,keywords" || input.options?.storeFields?.join() !== "title" || input.serializationVersion !== 2 || !Array.isArray(input.index)) throw new Error("Unknown Framework search-index format");
  const rows = new Map(Object.entries(input.documentIds).map(([internal, id]) => [internal, {id, title: input.storedFields[internal]?.title, text: [], keywords: []}]));
  for (const [term, fields] of input.index) {
    for (const [fieldId, docs] of Object.entries(fields)) {
      const field = Object.entries(input.fieldIds).find(([, id]) => String(id) === fieldId)?.[0];
      if (!["title", "text", "keywords"].includes(field)) throw new Error("Unknown indexed field");
      if (field === "title") continue;
      for (const [internal, count] of Object.entries(docs)) {
        const row = rows.get(internal);
        if (!row || !Number.isSafeInteger(count) || count < 1) throw new Error("Invalid indexed document or term frequency");
        for (let i = 0; i < count; i++) row[field].push(term);
      }
    }
  }
  const options = {fields: ["title", "text", "keywords"], storeFields: ["title"]};
  const index = new MiniSearch({...options, processTerm: (term) => (term.match(/\p{N}/gu)?.length ?? 0) > 6 ? null : term.slice(0, 15).toLowerCase()});
  const languageVersion = createHash("sha256").update(JSON.stringify(translations.pages)).digest("hex");
  const seen = new Set();
  for (const row of rows.values()) {
    if (seen.has(row.id)) throw new Error("Duplicate search URL");
    seen.add(row.id);
    const page = translations.pages[row.id === "/" ? "/index" : row.id];
    if (!page || typeof page.title_en !== "string" || !page.title_en.trim()) throw new Error(`Missing authored English search title: ${row.id}`);
    if (row.title !== page.title && row.title !== `${page.title} · ${page.title_en}`) throw new Error(`Changed source search title: ${row.id}`);
    if (input.hkdmLanguages?.version === languageVersion && row.title !== `${page.title} · ${page.title_en}`) throw new Error(`Missing bilingual search title: ${row.id}`);
    index.add({id: row.id, title: `${page.title} · ${page.title_en}`, text: row.text.join(" "), keywords: `${row.keywords.join(" ")} ${page.title_en} ${page.keywords_en ?? ""}`});
  }
  if (index.documentCount !== input.documentCount) throw new Error("Search document coverage changed");
  if (input.hkdmLanguages?.version === languageVersion) return typeof json === "string" ? json : JSON.stringify(input);
  return JSON.stringify({options, ...index.toJSON(), hkdmLanguages: {version: languageVersion}});
}

/**
 * Rehash both generated search assets before the caller walks dist for its final cache list.
 * Only the known index, its importing module and HTML references are changed. No stale hash
 * is reused for different content, so an HTTP cache cannot silently return the old index.
 */
export async function localiseSearchAssets(dist, {translations = catalogue} = {}) {
  const assetDir = join(dist, "_observablehq");
  let names;
  try {names = await readdir(assetDir);} catch (error) {if (error.code === "ENOENT") return {changed: false, pages: 0}; throw error;}
  const indices = names.filter((name) => name.startsWith("minisearch.") && name.endsWith(".json"));
  const modules = names.filter((name) => name.startsWith("search.") && name.endsWith(".js"));
  if (indices.length === 0 && modules.length === 0) return {changed: false, pages: 0};
  if (indices.length !== 1 || modules.length !== 1 || !/^minisearch\.[a-f0-9]{8}\.json$/.test(indices[0]) || !/^search\.[a-f0-9]{8}\.js$/.test(modules[0])) throw new Error("Unknown or duplicate Framework search assets");
  const [oldIndex, oldModule] = [indices[0], modules[0]];
  const [rawIndex, rawModule] = await Promise.all([readFile(join(assetDir, oldIndex), "utf8"), readFile(join(assetDir, oldModule), "utf8")]);
  if (rawModule.split(oldIndex).length !== 2) throw new Error("Search module must reference its index exactly once");
  const index = localiseSearchIndex(rawIndex, {translations});
  const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 8);
  const indexName = `minisearch.${hash(index)}.json`;
  const module = rawModule.replace(oldIndex, indexName);
  const moduleName = `search.${hash(module)}.js`;
  const pages = [];
  let references = 0;
  async function visit(directory) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith(".html")) {
        const raw = await readFile(path, "utf8");
        if (raw.includes(oldModule)) references++;
        const updated = raw.replaceAll(oldModule, moduleName).replaceAll(oldIndex, indexName);
        if (updated !== raw) pages.push({path, updated});
      } else if (entry.name.endsWith(".js") && path !== join(assetDir, oldModule) && path !== join(dist, "sw.js")) {
        const source = await readFile(path, "utf8");
        if (source.includes(oldModule) || source.includes(oldIndex)) throw new Error(`Unexpected search asset reference: ${path}`);
      }
    }
  }
  await visit(dist);
  if (references === 0) throw new Error("Search module has no HTML reference");
  if (oldIndex === indexName && oldModule === moduleName && pages.length === 0) return {changed: false, pages: 0};
  async function writeHashed(name, content) {
    const path = join(assetDir, name);
    let existing;
    try {existing = await readFile(path, "utf8");} catch (error) {if (error.code !== "ENOENT") throw error;}
    if (existing !== undefined && existing !== content) throw new Error(`Search asset hash collision: ${name}`);
    if (existing === undefined) await writeFile(path, content, "utf8");
  }
  await writeHashed(indexName, index);
  await writeHashed(moduleName, module);
  for (const page of pages) await writeFile(page.path, page.updated, "utf8");
  if (oldIndex !== indexName) await unlink(join(assetDir, oldIndex));
  if (oldModule !== moduleName) await unlink(join(assetDir, oldModule));
  return {changed: true, pages: pages.length, index: indexName, module: moduleName};
}
