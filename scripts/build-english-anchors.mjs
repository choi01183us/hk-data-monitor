// Regenerate authored English comparisons without changing a source snapshot.
// Treasury's exact spending denominator is recovered by the existing loader in
// offline fixture mode, at the saved snapshot's time, rather than from rounded text.
import {readFile, readdir} from "node:fs/promises";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {deriveEnglishAnchors} from "../src/data/_lib/english-anchors.js";
import {FISCAL_INDICATORS} from "../src/data/_lib/indicators.js";
import {loadFiscalReserves} from "../src/data/_lib/treasury.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOTS = join(ROOT, "src/data/_snapshots");
const FIXTURES = join(ROOT, "src/data/_fixtures");

// The loader asks for fiscal-year files using new Date(). Fix that clock to the
// saved snapshot so next April does not make an unchanged offline build different.
async function replayTreasury(snapshot, fixtureDir, population) {
  const NativeDate = globalThis.Date;
  const instant = NativeDate.parse(snapshot.fetched_at);
  if (!Number.isFinite(instant)) throw new Error("Treasury snapshot requires a valid fetched_at for fixture replay");
  const previousMode = process.env.HKDM_FIXTURES;
  const previousDir = process.env.HKDM_FIXTURE_DIR;
  process.env.HKDM_FIXTURES = "replay";
  process.env.HKDM_FIXTURE_DIR = fixtureDir;
  globalThis.Date = class SnapshotDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant; }
  };
  try {
    const spec = FISCAL_INDICATORS.fiscal_reserves;
    const replayed = await loadFiscalReserves({...spec, anchors: (series, extras) => spec.anchors(series, {...extras, population})});
    if (replayed.content_hash !== snapshot.content_hash) throw new Error("Treasury fixture replay differs from the saved snapshot; refresh the source pair before generating English comparisons");
    return replayed.anchors;
  } finally {
    globalThis.Date = NativeDate;
    if (previousMode === undefined) delete process.env.HKDM_FIXTURES;
    else process.env.HKDM_FIXTURES = previousMode;
    if (previousDir === undefined) delete process.env.HKDM_FIXTURE_DIR;
    else process.env.HKDM_FIXTURE_DIR = previousDir;
  }
}

/** Run sequentially: Treasury temporarily pins Date and the fixture environment. */
export async function buildEnglishAnchorMap({snapshotDir = SNAPSHOTS, fixtureDir = FIXTURES} = {}) {
  const files = (await readdir(snapshotDir)).filter((file) => file.endsWith(".json") && !file.startsWith("macau_")).sort();
  const docs = await Promise.all(files.map(async (file) => JSON.parse(await readFile(join(snapshotDir, file), "utf8"))));
  const population = docs.find((doc) => doc.indicator_id === "population")?.series;
  const result = {};
  for (const doc of docs) {
    const anchors = doc.indicator_id === "fiscal_reserves" ? await replayTreasury(doc, fixtureDir, population) : undefined;
    result[doc.indicator_id] = deriveEnglishAnchors(doc, {population, anchors});
  }
  return result;
}

export function serialiseEnglishAnchors(map) {
  return `${JSON.stringify(map, null, 2)}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const map = await buildEnglishAnchorMap();
  process.stdout.write(serialiseEnglishAnchors(map));
}
