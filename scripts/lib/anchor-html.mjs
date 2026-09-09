// English comparisons are paired with the actual published attachments after
// Framework has finished refreshing them. parse5 parses markup; no script executes.
import {readFile, readdir} from "node:fs/promises";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {parse} from "parse5";
import {buildEnglishAnchorMap} from "../build-english-anchors.mjs";
import {computeContentHash} from "../../src/data/_lib/schema.js";
import {assertEnglishMetadata} from "../../src/components/display-text.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT_ID = "hkdm-english-anchors";
const CITY_FEEDS = new Set(["city_news", "city_flights", "city_weather"]);
const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;

export function serialiseAnchorPayload(map) {
  return JSON.stringify(map).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

function pageNodes(html) {
  const nodes = [];
  function visit(node) { nodes.push(node); for (const child of node.childNodes ?? []) visit(child); }
  visit(parse(html, {sourceCodeLocationInfo: true}));
  return nodes;
}

/** Lazy so plain non-Framework postbuild fixtures do not require data snapshots. */
export function createEnglishAnchorInjector({distDir = join(ROOT, "dist"), snapshotDir = join(ROOT, "src/data/_snapshots"), fixtureDir = join(ROOT, "src/data/_fixtures")} = {}) {
  let finalData;
  const published = new Map();
  async function finalSources() {
    if (!finalData) finalData = (async () => {
      const names = (await readdir(snapshotDir)).filter((name) => name.endsWith(".json") && !name.startsWith("macau_")).sort();
      const snapshots = new Map();
      for (const name of names) {
        const doc = JSON.parse(await readFile(join(snapshotDir, name), "utf8"));
        if (snapshots.has(doc.indicator_id)) throw new Error(`Duplicate final indicator snapshot: ${doc.indicator_id}`);
        snapshots.set(doc.indicator_id, doc);
      }
      return {snapshots, english: await buildEnglishAnchorMap({snapshotDir, fixtureDir})};
    })();
    return finalData;
  }
  async function attachment(id, path) {
    if (!published.has(path)) published.set(path, (async () => {
      const {snapshots, english} = await finalSources();
      const final = snapshots.get(id);
      if (!final || !Object.hasOwn(english, id)) throw new Error(`No final English comparisons for published attachment: ${id}`);
      const doc = JSON.parse(await readFile(resolve(distDir, path), "utf8"));
      if (doc.indicator_id !== id) throw new Error(`Published attachment identity differs from its filename: ${id}`);
      if (computeContentHash(doc) !== doc.content_hash || doc.content_hash !== final.content_hash) throw new Error(`Published attachment differs from the final snapshot: ${id}`);
      assertEnglishMetadata(doc);
      const entries = english[id];
      const anchors = doc.anchors ?? [];
      if (Object.keys(entries).length !== anchors.length) throw new Error(`Incomplete English comparisons for published attachment: ${id}`);
      for (const anchor of anchors) {
        const saved = entries[anchor.id];
        if (!saved || saved.text_zh !== anchor.text_zh || saved.basis_zh !== anchor.basis_zh) throw new Error(`English comparison does not match published Chinese calculation: ${id}.${anchor.id}`);
      }
      return entries;
    })());
    return published.get(path);
  }
  return async function injectEnglishAnchors(html) {
    if (typeof html !== "string") throw new Error("Anchor HTML input must be a string");
    const nodes = pageNodes(html);
    if (!nodes.some((node) => attr(node, "id") === "observablehq-main")) return html;
    const existing = nodes.filter((node) => attr(node, "id") === SCRIPT_ID);
    if (existing.length > 1) throw new Error("Duplicate English comparison script IDs");
    if (existing.length && (existing[0].tagName !== "script" || attr(existing[0], "type") !== "application/json" || !existing[0].sourceCodeLocation?.endTag)) throw new Error("English comparison element must be a complete JSON script");
    const old = existing[0]?.sourceCodeLocation;
    const clean = old ? html.slice(0, old.startOffset) + html.slice(old.endOffset) : html;
    // Observed Framework attachment references carry this exact path and eight-digit hash.
    // Remove our existing JSON block first, so annotation text cannot invent attachments.
    const paths = new Map();
    for (const match of clean.matchAll(/\b_file\/data\/[a-zA-Z0-9_.-]+\.json\b/g)) {
      const path = match[0];
      const parsed = /^_file\/data\/([a-z][a-z0-9_]*)\.[a-f0-9]{8}\.json$/.exec(path);
      if (!parsed) throw new Error(`Unsupported published data attachment path: ${path}`);
      const id = parsed[1];
      if (CITY_FEEDS.has(id)) continue;
      if (paths.has(id) && paths.get(id) !== path) throw new Error(`Page attaches two different versions of the same indicator: ${id}`);
      paths.set(id, path);
    }
    const page = {};
    for (const [id, path] of [...paths].sort(([left], [right]) => left.localeCompare(right))) page[id] = await attachment(id, path);
    const cleanNodes = pageNodes(clean);
    const head = cleanNodes.find((node) => node.tagName === "head");
    const at = head?.sourceCodeLocation?.endTag?.startOffset;
    if (!Number.isInteger(at)) throw new Error("Framework page has no explicit closing head for English comparisons");
    const block = `<script type="application/json" id="${SCRIPT_ID}">${serialiseAnchorPayload(page)}</script>`;
    return clean.slice(0, at) + block + clean.slice(at);
  };
}
