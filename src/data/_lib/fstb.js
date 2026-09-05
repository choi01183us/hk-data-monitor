// 財經事務及庫務局(FSTB)經 data.gov.hk 出嘅財政統計 CSV 轉接器。
//
// 實測形狀(findings.md 第 1 節,2026-09-05 再抓過):
//   財政年度,教育 (百萬元),社會福利 (百萬元),衞生 (百萬元),其他 (百萬元),經常開支 (百萬元)
//   2026-27 (原來預算),102308,135865,118881,242623,599677
//   2025-26 (修訂預算),101991,123614,114347,232417,572369
//   2024-25,105281,...
//   ...
//   1999-2000,43627,...      <- 唯一一個尾段係四位數嘅年度
//   1997-98,37325,...
//
// UTF-8 with BOM,由新到舊排。SPEC 第 6 節原本以為呢批數喺預算案 ZIP 入面,
// 實測 ZIP 84 個 CSV 一個「政策組別」都冇,真正嘅來源係呢度。

import { fetchText } from "./http.js";
import { parseCsv, toNumber } from "./csv.js";
import { buildIndicator } from "./schema.js";
import { readPopulationSeries } from "./population-ref.js";

const BASE = "https://www.fstb.gov.hk/datagovhk/tsyb/financial-statistics/tc";

export const DATA_GOV_HK_LICENCE = {
  licence: "data.gov.hk 使用條款",
  licence_url: "https://data.gov.hk/tc/terms-and-conditions",
  source_zh: "財經事務及庫務局(經資料一線通 DATA.GOV.HK 提供)",
  source_en: "Financial Services and the Treasury Bureau, via DATA.GOV.HK",
};

/** 分類相加同總額最多差幾多(百萬元)。實測係零,所以呢個純粹係防浮點。 */
const TOTAL_TOLERANCE_MILLIONS = 1;

/** 單位一定要係「百萬元」。來源改咗單位嘅話要即刻死,唔好靜靜哋出一批細咗一千倍嘅數。 */
const UNIT_SUFFIX = /\s*[(（]百萬元[)）]\s*$/u;

/**
 * 「2026-27 (原來預算)」-> { period: "2026-27", note: "原來預算" }
 * 「1999-2000」          -> { period: "1999-00", note: null }
 *
 * SPEC 第 5 節:財政年度寫 "2025-26"。
 */
export function parseFiscalYear(text) {
  const match = /^(\d{4})-(\d{2,4})(?:\s*[(（](.+?)[)）])?$/u.exec(String(text).trim());
  if (!match) throw new Error(`認唔到財政年度「${text}」`);
  const [, first, second, note] = match;
  return { period: `${first}-${second.slice(-2)}`, note: note?.trim() ?? null };
}

/**
 * @param {object} spec
 * @param {string} spec.file               例如 "fin-stats_recurrent-exp_a_tc.csv"
 * @param {Array<{column:string,label_zh:string}>} spec.categories  要邊幾欄做分類
 * @param {string} spec.total_column       總額嗰欄(唔入 series,但會另外保留)
 * @param {(series: object[], extras: object) => object[]} [spec.anchors]
 */
export async function loadFstbCsvIndicator(id, spec) {
  const url = `${BASE}/${spec.file}`;
  const { text, response, fetchedAt } = await fetchText(url);
  const { headers, rows } = parseCsv(text);

  // 標題行:第一欄係「財政年度」,其餘全部要帶「(百萬元)」。
  if (headers[0] !== "財政年度") {
    throw new Error(`${spec.file}:第一欄應該係「財政年度」,而家係「${headers[0]}」—— 來源格式變咗`);
  }
  const columnByName = new Map();
  for (const header of headers.slice(1)) {
    if (!UNIT_SUFFIX.test(header)) {
      throw new Error(`${spec.file}:欄「${header}」冇「(百萬元)」單位標記 —— 來源可能改咗單位,唔好猜`);
    }
    columnByName.set(header.replace(UNIT_SUFFIX, "").trim(), header);
  }

  const resolve = (name) => {
    const header = columnByName.get(name);
    if (!header) {
      throw new Error(`${spec.file}:搵唔到欄「${name}」。有嘅係:${[...columnByName.keys()].join("、")}`);
    }
    return header;
  };

  const series = [];
  const totals = [];
  const periodNotes = {};

  for (const row of rows) {
    const { period, note } = parseFiscalYear(row["財政年度"]);
    if (note) periodNotes[period] = note;
    for (const { column, label_zh } of spec.categories) {
      const millions = toNumber(row[resolve(column)]);
      // 百萬元 -> 港元。SPEC 授權條款要求指出任何修改,notes_zh 度會寫明。
      series.push({ period, category: label_zh, value: millions === null ? null : millions * 1_000_000 });
    }
    if (spec.total_column) {
      const millions = toNumber(row[resolve(spec.total_column)]);
      totals.push({ period, value: millions === null ? null : millions * 1_000_000 });
    }
  }

  series.sort((a, b) => a.period.localeCompare(b.period) || a.category.localeCompare(b.category));
  totals.sort((a, b) => a.period.localeCompare(b.period));

  if (series.length === 0) throw new Error(`${spec.file}:解析完一行數都冇`);

  // 分類加埋應該等於總額 —— 呢個係唯一驗得到「我讀啱咗欄」嘅方法。
  //
  // 容忍度用**絕對值**唔用百分比:實測兩份檔 30 個年度全部完全相等(零誤差),
  // 所以來源根本冇四捨五入。用「0.2% 相對誤差」嗰陣,一個 1,000 百萬元嘅
  // 抄錯／讀錯欄只係 0.167% 偏差,靜靜哋過關 —— 突變測試撞到先發現。
  // 留 1 百萬元只係防浮點,唔係防真錯。
  if (spec.total_column) {
    for (const total of totals) {
      if (total.value === null) continue;
      const parts = series.filter((p) => p.period === total.period && p.value !== null);
      if (parts.length !== spec.categories.length) continue;
      const sum = parts.reduce((acc, p) => acc + p.value, 0);
      const diffMillions = Math.abs(sum - total.value) / 1_000_000;
      if (diffMillions > TOTAL_TOLERANCE_MILLIONS) {
        throw new Error(
          `${spec.file} ${total.period}:分類相加 ${sum} 對唔上總額 ${total.value}` +
            `(差 ${diffMillions.toFixed(0)} 百萬元)。唔係讀錯欄就係來源加咗新分類,兩樣都唔可以靜靜哋出街。`
        );
      }
    }
  }

  // updated_at:data.gov.hk 冇喺 CSV 入面寫更新日期,用 HTTP Last-Modified,
  // 冇嘅話就用最新期數(對年度數據嚟講係合理嘅「數據截至」)。
  const lastModified = response.headers.get("last-modified");
  const updatedAt = lastModified && !Number.isNaN(Date.parse(lastModified))
    ? new Date(lastModified).toISOString().slice(0, 10)
    : `${series.at(-1).period.slice(0, 4)}-04-01`;

  const extras = { totals, periodNotes, population: await readPopulationSeries() };

  return buildIndicator({
    indicator_id: id,
    name_zh: spec.name_zh,
    name_en: spec.name_en,
    unit_zh: "港元",
    unit_en: "HK$",
    unit_short_zh: "元",
    unit_source_zh: "百萬元",
    value_digits: 0,

    source_zh: DATA_GOV_HK_LICENCE.source_zh,
    source_en: DATA_GOV_HK_LICENCE.source_en,
    source_url: spec.dataset_url,
    source_note_zh: `檔案 ${spec.file}(${url})`,
    licence: DATA_GOV_HK_LICENCE.licence,
    licence_url: DATA_GOV_HK_LICENCE.licence_url,

    updated_at: updatedAt,
    fetched_at: fetchedAt,
    frequency: "annual",
    acquisition: "api",

    category: spec.category,
    question_zh: spec.question_zh,
    notes_zh:
      "原始檔用「百萬元」做單位,呢度已經乘返一百萬換算成「港元」,方便同人口相除。" +
      (Object.keys(periodNotes).length
        ? `最新期數係預算數字,唔係實際數:${Object.entries(periodNotes).map(([p, n]) => `${p}(${n})`).join("、")}。`
        : "") +
      (spec.notes_zh ?? ""),
    chart: spec.chart ?? { type: "line", y_zero: true },
    anchors: spec.anchors ? spec.anchors(series, extras) : [],
    category_order: spec.categories.map((c) => c.label_zh),
    totals,
    period_notes: periodNotes,

    series,
  });
}
