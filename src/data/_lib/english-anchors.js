// Build-time presentation sidecar. Reuse the canonical generators and their exact
// inputs; a changed Chinese result is a failure, never a reason to translate stale text.
import {isDeepStrictEqual} from "node:util";
import {CENSTATD_INDICATORS, FISCAL_INDICATORS} from "./indicators.js";
import {PROPERTY_INDICATORS, propertyAnchors} from "./property.js";
import {MONEY_INDICATORS, moneySupplyAnchors} from "./money.js";
import {computeContentHash} from "./schema.js";

/** `anchors` is reserved for a full fixture replay (Treasury's spending denominator). */
export function deriveEnglishAnchors(doc, {population, monthlyExpenditure, anchors} = {}) {
  const id = doc.indicator_id;
  let generated = anchors;
  if (generated === undefined) {
    if (CENSTATD_INDICATORS[id]) generated = CENSTATD_INDICATORS[id].anchors?.(doc.series) ?? [];
    else if (FISCAL_INDICATORS[id]) generated = FISCAL_INDICATORS[id].anchors?.(doc.series, {population, monthlyExpenditure, totals: doc.totals}) ?? [];
    else if (PROPERTY_INDICATORS[id]) generated = propertyAnchors(doc.series);
    else if (MONEY_INDICATORS[id]) generated = moneySupplyAnchors(doc.series);
    else if (!(doc.anchors ?? []).length) generated = [];
    else throw new Error(`No English anchor generator for ${id}`);
  }
  // Non-enumerable English fields must never alter the snapshot or content hash.
  if (!Array.isArray(generated) || !isDeepStrictEqual(JSON.parse(JSON.stringify(generated)), doc.anchors ?? [])) {
    throw new Error(`English anchor generation changed the canonical Chinese anchors: ${id}`);
  }
  const comparedDoc = "anchors" in doc || generated.length ? {...doc, anchors: generated} : doc;
  if (computeContentHash(comparedDoc) !== doc.content_hash) {
    throw new Error(`English anchor generation changed the canonical content hash: ${id}`);
  }
  const result = {};
  for (const anchor of generated) {
    if (Object.hasOwn(result, anchor.id)) throw new Error(`Duplicate English anchor: ${id}.${anchor.id}`);
    for (const field of ["text_en", "basis_en"]) {
      if (typeof anchor[field] !== "string" || !anchor[field].trim() || /\p{Script=Han}/u.test(anchor[field])) {
        throw new Error(`Missing authored English anchor: ${id}.${anchor.id}.${field}`);
      }
      if (Object.prototype.propertyIsEnumerable.call(anchor, field)) throw new Error(`English anchor must not enter snapshot JSON: ${id}.${anchor.id}.${field}`);
    }
    result[anchor.id] = {text_zh: anchor.text_zh, basis_zh: anchor.basis_zh, text_en: anchor.text_en, basis_en: anchor.basis_en};
  }
  return result;
}
