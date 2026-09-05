// 世界銀行 Open Data API v2 轉接器。
//
// 端點形狀（實測）：
//   https://api.worldbank.org/v2/country/HKG/indicator/NY.GDP.PCAP.CD?format=json&per_page=200
//   → [ {page,pages,per_page,total,sourceid,lastupdated}, [ {indicator,country,countryiso3code,date,value,...}, … ] ]
//
// 兩個實測到嘅陷阱：
//   1. 資料列係「由新到舊」排，我哋 schema 要求由舊到新，所以一定要反轉。
//   2. 指標 id 打錯嘅時候，API 照回 HTTP 200，但 body 變成 [{message:[…]}]（得一個元素）。
//      所以唔可以淨係睇 status code，一定要驗形狀。

import { fetchJson } from "../http.mjs";
import { buildIndicator } from "../schema.mjs";

const API_BASE = "https://api.worldbank.org/v2";

/** 世界銀行開放數據嘅授權。實際文字喺 registry 度逐個指標記返。 */
export const WORLD_BANK_LICENCE = {
  licence: "CC BY 4.0",
  licence_url: "https://datacatalog.worldbank.org/public-licenses#cc-by",
  source: "世界銀行公開數據（World Bank Open Data）",
  source_en: "World Bank Open Data",
  attribution_zh: "資料來源：世界銀行公開數據，以 CC BY 4.0 授權使用。",
  attribution_en: "Source: World Bank Open Data, licensed under CC BY 4.0.",
};

function buildUrl(indicatorCode, { country, page, perPage }) {
  const params = new URLSearchParams({
    format: "json",
    per_page: String(perPage),
    page: String(page),
  });
  return `${API_BASE}/country/${encodeURIComponent(country)}/indicator/${encodeURIComponent(indicatorCode)}?${params}`;
}

/** API 會 200 但回錯誤物件，所以呢個檢查唔係多餘。 */
function assertWorldBankShape(body) {
  if (!Array.isArray(body) || body.length < 2) {
    const message = Array.isArray(body) ? JSON.stringify(body[0]).slice(0, 200) : typeof body;
    throw new Error(`世界銀行回應唔係預期嘅 [metadata, rows] 陣列：${message}`);
  }
  if (!Array.isArray(body[1])) {
    throw new Error("世界銀行回應第二個元素唔係資料陣列");
  }
}

/**
 * 抓一個世界銀行指標嘅完整時間序列（自動翻頁）。
 * 回傳原始資料 + metadata，唔會直接砌成我哋嘅 schema —— 咁樣方便單獨測試。
 */
export async function fetchWorldBankSeries(indicatorCode, { country = "HKG", perPage = 500 } = {}) {
  const rows = [];
  let metadata = null;
  let page = 1;
  let totalPages = 1;

  do {
    const { body, fetchedAt } = await fetchJson(buildUrl(indicatorCode, { country, page, perPage }), {
      assertShape: assertWorldBankShape,
    });
    const [meta, data] = body;
    metadata ??= { ...meta, fetchedAt };
    totalPages = Number(meta.pages) || 1;
    rows.push(...data);
    page += 1;
  } while (page <= totalPages && page <= 20); // 20 頁 = 10000 個點，任何年度指標都夠有突

  if (rows.length === 0) {
    throw new Error(`世界銀行 ${indicatorCode}（${country}）回咗零列資料`);
  }

  return { rows, metadata };
}

/**
 * 把世界銀行嘅回應砌成一份合規嘅指標文件。
 *
 * @param {object} spec  registry 入面嘅指標定義
 */
export async function loadWorldBankIndicator(spec) {
  const { rows, metadata } = await fetchWorldBankSeries(spec.wb_code, { country: spec.country ?? "HKG" });

  const series = rows
    .map((row) => ({
      date: String(row.date),
      value: row.value === null || row.value === undefined ? null : Number(row.value),
    }))
    .filter((point) => /^\d{4}$/.test(point.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 頭尾嘅 null 冇資訊價值，剪走；中間嘅 null 要留，因為「嗰年真係冇數」本身係一件事。
  const firstWithValue = series.findIndex((point) => point.value !== null);
  const lastWithValue = series.findLastIndex((point) => point.value !== null);
  if (firstWithValue === -1) {
    throw new Error(`世界銀行 ${spec.wb_code}（${spec.country ?? "HKG"}）全部年份都係 null`);
  }
  const trimmed = series.slice(firstWithValue, lastWithValue + 1);

  const countryLabel = rows[0]?.country?.value ?? spec.country ?? "HKG";

  return buildIndicator({
    indicator_id: spec.indicator_id,
    name_zh: spec.name_zh,
    name_en: spec.name_en ?? rows[0]?.indicator?.value ?? spec.wb_code,
    unit: spec.unit,
    unit_en: spec.unit_en ?? null,

    source: WORLD_BANK_LICENCE.source,
    source_en: WORLD_BANK_LICENCE.source_en,
    source_url: buildUrl(spec.wb_code, { country: spec.country ?? "HKG", page: 1, perPage: 500 }),
    source_page_url: `https://data.worldbank.org/indicator/${spec.wb_code}?locations=HK`,
    licence: WORLD_BANK_LICENCE.licence,
    licence_url: WORLD_BANK_LICENCE.licence_url,
    attribution_zh: WORLD_BANK_LICENCE.attribution_zh,
    attribution_en: WORLD_BANK_LICENCE.attribution_en,

    // updated_at 用世界銀行自己講嘅資料庫更新日期，唔係我哋抓數嗰刻。
    // 咁 data_version 先至只會喺「數真係變咗」嘅時候變。
    updated_at: new Date(`${metadata.lastupdated}T00:00:00Z`).toISOString(),
    fetched_at: metadata.fetchedAt,
    frequency: spec.frequency ?? "annual",

    region_zh: spec.region_zh ?? "香港",
    region_label: countryLabel,
    category: spec.category,
    question_zh: spec.question_zh,
    notes_zh: spec.notes_zh ?? null,
    chart: spec.chart ?? { type: "line", y_zero: false },
    series: trimmed,
  });
}
