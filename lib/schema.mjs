// 指標資料的單一事實來源：schema 定義 + 驗證。
//
// 每個指標抓落嚟之後都會變成一個符合呢個 schema 的 JSON 物件，
// 存喺 data/snapshots/<indicator_id>.json，再由 data loader 送去前端。
//
// 呢個檔案冇任何外部依賴，可以獨立 `node --check`。

import { createHash } from "node:crypto";

/** schema 本身的版本。改動 required 欄位時要 bump，順便令所有 snapshot 重新產生。 */
export const SCHEMA_VERSION = 1;

/** 使用者要求的必要欄位，一個都不能少。 */
export const REQUIRED_FIELDS = [
  "indicator_id",
  "name_zh",
  "name_en",
  "unit",
  "source",
  "source_url",
  "licence",
  "updated_at",
  "data_version",
  "frequency",
  "series",
];

/** frequency 只准呢幾個值，前端靠佢決定 x 軸點畫。 */
export const FREQUENCIES = ["annual", "quarterly", "monthly", "daily", "hourly", "irregular"];

/** series 每個點的形狀。value 容許 null（代表嗰年冇數，唔係零）。 */
function validatePoint(point, index, errors) {
  const where = `series[${index}]`;
  if (point === null || typeof point !== "object" || Array.isArray(point)) {
    errors.push(`${where} 應該係物件`);
    return;
  }
  if (typeof point.date !== "string" || point.date.length === 0) {
    errors.push(`${where}.date 應該係非空字串（ISO 8601 或年份）`);
  }
  if (point.value !== null && typeof point.value !== "number") {
    errors.push(`${where}.value 應該係數字或 null，而家係 ${typeof point.value}`);
  }
  if (typeof point.value === "number" && !Number.isFinite(point.value)) {
    errors.push(`${where}.value 係 ${point.value}，唔可以入 JSON`);
  }
}

/**
 * 驗證一個指標物件。回傳 { ok, errors }，唔會 throw。
 * 呢個係「唔准寫壞資料落 repo」嘅最後一道閘。
 */
export function validateIndicator(doc) {
  const errors = [];

  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return { ok: false, errors: ["整份文件應該係物件"] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (doc[field] === undefined || doc[field] === null || doc[field] === "") {
      errors.push(`缺少必要欄位 ${field}`);
    }
  }

  if (typeof doc.indicator_id === "string" && !/^[a-z0-9]+(?:[.\-][a-z0-9]+)*$/.test(doc.indicator_id)) {
    errors.push(`indicator_id "${doc.indicator_id}" 唔合法：只准細楷英數、點同橫線`);
  }

  if (doc.frequency !== undefined && !FREQUENCIES.includes(doc.frequency)) {
    errors.push(`frequency "${doc.frequency}" 唔喺容許清單（${FREQUENCIES.join("、")}）`);
  }

  for (const field of ["updated_at", "fetched_at"]) {
    const value = doc[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
      errors.push(`${field} "${value}" 唔係可解析嘅 ISO 8601 時間`);
    }
  }

  for (const field of ["source_url", "licence_url"]) {
    const value = doc[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || !/^https:\/\//.test(value)) {
      errors.push(`${field} 應該係 https:// 開頭嘅網址`);
    }
  }

  if (!Array.isArray(doc.series)) {
    errors.push("series 應該係陣列");
  } else if (doc.series.length === 0) {
    errors.push("series 係空的 — 寧願保留上一版，都唔好出一個冇數嘅指標");
  } else {
    doc.series.forEach((point, index) => validatePoint(point, index, errors));
    const dates = doc.series.map((point) => point?.date);
    if (new Set(dates).size !== dates.length) {
      errors.push("series 有重複嘅 date");
    }
    const sorted = [...dates].every((date, index) => index === 0 || String(dates[index - 1]) <= String(date));
    if (!sorted) errors.push("series 要由舊到新排好序");
  }

  if (doc.data_version !== undefined && typeof doc.data_version === "string") {
    const expected = computeDataVersion(doc);
    if (doc.data_version !== expected) {
      errors.push(`data_version 對唔上內容（檔案寫住 ${doc.data_version}，實際應該係 ${expected}）`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * data_version = series 內容的 SHA-256 短雜湊。
 *
 * 關鍵：只計「會影響畫面」嘅欄位，唔計 fetched_at。
 * 咁每星期抓完之後，數冇變 = data_version 冇變 = git 見唔到改動 = 唔會有無謂 commit。
 */
export function computeDataVersion(doc) {
  const canonical = JSON.stringify({
    schema_version: SCHEMA_VERSION,
    indicator_id: doc.indicator_id ?? null,
    unit: doc.unit ?? null,
    frequency: doc.frequency ?? null,
    updated_at: doc.updated_at ?? null,
    series: (doc.series ?? []).map((point) => [point?.date ?? null, point?.value ?? null]),
  });
  return `sha256:${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}

/** 砌一份合規嘅指標文件：補齊 coverage、data_version，然後即刻驗一次。 */
export function buildIndicator(fields) {
  const series = [...(fields.series ?? [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const withValues = series.filter((point) => typeof point.value === "number");

  const doc = {
    schema_version: SCHEMA_VERSION,
    ...fields,
    series,
    coverage: {
      start: series.at(0)?.date ?? null,
      end: series.at(-1)?.date ?? null,
      points: series.length,
      points_with_value: withValues.length,
    },
    latest: withValues.at(-1) ?? null,
  };

  doc.data_version = computeDataVersion(doc);

  const { ok, errors } = validateIndicator(doc);
  if (!ok) {
    throw new Error(`指標 ${fields.indicator_id ?? "(冇 id)"} 唔符合 schema：\n  - ${errors.join("\n  - ")}`);
  }
  return doc;
}
