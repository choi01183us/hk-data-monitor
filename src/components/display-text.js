// Authored display text only: identifiers, category keys and numerical values stay canonical.
import {isEnglish} from "./locale.js";
import {labels} from "../lang/labels-en-GB.js";
import {indicatorEnglish} from "../lang/indicators-en-GB.js";

const english = (options) => options.locale === "en-GB" || (options.locale === undefined && isEnglish());
const validEnglish = (text) => typeof text === "string" && text.trim().length > 0;

export function label(value, options = {}) {
  if (!english(options) || value == null) return value;
  if (validEnglish(labels[value])) return labels[value];
  if (!/\p{Script=Han}/u.test(String(value))) return value;
  throw new Error(`Missing authored English label: ${value}`);
}

export function indicatorText(doc, field, options = {}) {
  const key = field.endsWith("_zh") || field === "category" || field === "licence" ? field : `${field}_zh`;
  const original = doc[key];
  if (!english(options) || !original) return original ?? "";
  if (key === "name_zh" && validEnglish(doc.name_en)) return doc.name_en.replace(/authorized/g, "authorised");
  if (key === "source_zh" && validEnglish(doc.source_en)) return doc.source_en;
  if (key === "unit_zh" && validEnglish(doc.unit_en)) return doc.unit_en;
  if (key === "unit_short_zh") return original === "間" ? (validEnglish(doc.unit_en) ? doc.unit_en : label(original, options)) : label(original, options);
  if (["unit_source_zh", "category", "licence"].includes(key)) return label(original, options);
  if (key === "basis_zh" && validEnglish(doc.basis_en)) return doc.basis_en;
  const entry = indicatorEnglish[doc.indicator_id]?.[key];
  if (entry && entry.zh === original && validEnglish(entry.en)) return entry.en;
  throw new Error(`Missing or outdated English metadata: ${doc.indicator_id}.${key}`);
}

const parsedAnchors = new WeakMap();
function pageAnchors() {
  const node = typeof document !== "undefined" ? document.getElementById?.("hkdm-english-anchors") : null;
  if (!node) return {};
  if (!parsedAnchors.has(node)) {
    const parsed = JSON.parse(node.textContent);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Invalid English comparison data");
    parsedAnchors.set(node, parsed);
  }
  return parsedAnchors.get(node);
}

// Dynamic comparisons use the same calculation; saved ones are paired with this page at postbuild.
export function anchorText(doc, anchor, field) {
  if (!isEnglish()) return anchor[field];
  const en = anchor[field.replace(/_zh$/, "_en")];
  if (typeof en === "string" && en.trim()) return en;
  const saved = pageAnchors()[doc.indicator_id]?.[anchor.id];
  if (saved && saved.text_zh === anchor.text_zh && saved.basis_zh === anchor.basis_zh) {
    const translated = saved[field.replace(/_zh$/, "_en")];
    if (validEnglish(translated)) return translated;
  }
  throw new Error(`Missing English comparison: ${doc.indicator_id}.${anchor.id}.${field}`);
}

/** Used by validate/build as well as the mutation tests; changed definitions require review. */
export function assertEnglishMetadata(doc) {
  for (const field of ["name_zh", "source_zh", "unit_zh", "unit_short_zh", "unit_source_zh", "question_zh", "basis_zh", "notes_zh", "source_note_zh", "category", "licence"]) {
    if (doc[field]) indicatorText(doc, field, {locale:"en-GB"});
  }
  for (const value of [...(doc.series ?? []).map((row) => row.category), ...(doc.category_order ?? []), ...Object.values(doc.period_notes ?? {})].filter(Boolean)) label(value, {locale:"en-GB"});
}
