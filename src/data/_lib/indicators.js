// 指標登記冊 —— 全站唯一嘅事實來源。
//
// 8 個統計處指標共用同一支 API 同一套陷阱,所以唔好寫 8 份九成相同嘅 loader。
// 每個指標喺呢度得一段設定,src/data/<id>.json.js 得三行。
//
// 加新指標之前:先跑 `node scripts/explore-table.mjs <表號>` 攞返真正嘅
// sv / stat_pres / cv 代碼。唔好靠估 —— cv 打錯唔會報錯,會靜靜哋回 Total 冒充。

import {
  queryCenstatd,
  pickFrequency,
  formatPeriod,
  toSpecFrequency,
  toValue,
  statPresLabel,
  tableInfo,
  CENSTATD_LICENCE,
} from "./censtatd.js";
import { buildIndicator } from "./schema.js";
import {
  anchorPerDay,
  anchorVersusYear,
  anchorPerClassroom,
  anchorMultipleOf,
  anchorAverageChange,
  collectAnchors,
} from "../../components/anchor.js";

/**
 * 統計處指標嘅設定形狀:
 *
 *   table         表號(唔係 scode/pcode)
 *   sv            統計變項代碼
 *   stat_pres     呈現方式代碼。單位由佢決定,唔使自己寫。
 *   cv            送去 API 嘅維度。必填嘅唔可以漏,漏咗會靜靜哋出錯數。
 *   freq          "Y" | "Q" | "M" | "M3M" | "H" —— 一個 query 會回多過一種,要明文揀
 *   period_start  YYYYMM,必填
 *   pin           唔做分類嘅維度要釘死喺邊個 code(通常係 "" 即 Total)
 *   category_dim  邊個維度做 series 嘅 category(冇就係單一條線)
 *   categories    [{code, label_zh}] —— 明文列出要邊幾個,連 Total("")都要寫
 */
export const CENSTATD_INDICATORS = {
  gdp: {
    table: "310-31001",
    sv: "CURPGDP",
    stat_pres: "Raw_hkd_d",
    cv: {},
    freq: "Y",
    period_start: "196101",

    name_zh: "人均本地生產總值",
    name_en: "GDP per capita (at current market prices)",
    unit_en: "HK$",
    unit_short_zh: "元",
    category: "經濟",
    question_zh: "香港平均每個人,一年創造幾多經濟價值?",
    notes_zh:
      "「以當時市價計算」即係冇扣除通脹。所以呢條線升,唔一定代表大家真係富裕咗 —— " +
      "有一部分升幅淨係因為物價升咗。想睇撇除通脹之後嘅變化,要睇「以環比物量計算」嗰個系列。",
    chart: { type: "line", y_zero: false },
    anchors: (series) =>
      collectAnchors(
        anchorPerDay(latestValue(series), { currency: "HKD", label: "每人每日" }),
        anchorVersusYear(series, "1997"),
        anchorVersusYear(series, String(Number(latestPeriod(series)) - 10))
      ),
  },

  population: {
    table: "110-01001",
    sv: "POP",
    stat_pres: "Raw_K_1dp_per_n",
    // SEX 同 AGE 兩個都係必填。要總人口就要照送齊,再喺下面 pin 返 Total。
    // (show_total=1,所以 Total 行係統計處自己出,唔係我哋加埋。)
    cv: {
      SEX: ["M", "F"],
      AGE: ["0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34", "35-39", "40-44",
            "45-49", "50-54", "55-59", "60-64", "65-69", "70-74", "75-79", "80-84", "85_and_over"],
    },
    // 半年一次:年中(06)同年底(12)。呢個表嘅 default_series_period 唔係 Y,
    // 所以 period_start 一定要明文寫,否則攞唔到成條歷史。
    freq: "H",
    period_start: "196106",
    pin: { SEX: "", AGE: "" },

    name_zh: "香港人口",
    name_en: "Population of Hong Kong",
    unit_en: "persons",
    unit_short_zh: "人",
    category: "人口",
    question_zh: "香港而家有幾多人?",
    notes_zh:
      "統計處原本用「千人」做單位,呢度已經乘返 1000 換算成「人」,方便同其他數字相除。" +
      "數字包括外籍家庭傭工。標住「臨時數字」嘅期數之後會修訂。" +
      "呢個指標同時係全站「相當於每名市民幾多錢」嗰類換算嘅分母。",
    chart: { type: "line", y_zero: false },
    // 統計處出「千人」,我哋要「人」。SPEC 授權條款要求指出任何修改,
    // 所以 notes_zh 寫明咗換算過。
    transform: (value) => (value === null ? null : Math.round(value * 1000)),
    unit_override_zh: "人",
    // 不變式:抽出嚟嘅每一點,都要等於嗰期「男 + 女」相加。
    //
    // 注意呢個檢查係驗**最終 series**,唔係驗來源資料自己一致唔一致。
    // 第一版寫成後者,結果做突變測試(把 pin 由 Total 改成 SEX:"M")嗰陣
    // 完全捉唔到 —— 男性人口照樣當成「香港人口」出咗街。
    // 驗來源等於乜都冇驗;要驗嘅係「我揀咗嘅行係咪真係我以為嗰行」。
    verify: (rows, series) => {
      const sexSum = new Map();
      for (const row of rows) {
        if ((row.AGE ?? "") !== "" || (row.SEX ?? "") === "") continue;
        // ⚠️ 一定要用 toValue(),唔可以 Number(row.figure):
        // 冇數嘅格 API 回空字串,而 Number("") 係 0(仲要係 finite),
        // 結果整條期數會被當成「男+女 = 0」,啱嘅資料都報錯。撞過。
        const value = toValue(row);
        if (value === null) continue;
        sexSum.set(row.period, (sexSum.get(row.period) ?? 0) + value * 1000);
      }
      let checked = 0;
      for (const point of series) {
        if (point.value === null) continue;
        // series 嘅 period 係 "YYYY-MM",API 嘅係 "YYYYMM"
        const expected = sexSum.get(point.period.replace("-", ""));
        if (expected === undefined) continue;
        checked += 1;
        const drift = Math.abs(expected - point.value) / point.value;
        if (drift > 0.005) {
          throw new Error(
            `110-01001 ${point.period}:抽出嚟嘅 ${point.value} 對唔上「男+女」相加 ` +
              `${Math.round(expected)}(差 ${(drift * 100).toFixed(2)}%)。` +
              `多數係 pin 揀錯行 —— 呢種錯 API 唔會報,會靜靜哋出一個貌似合理嘅數。`
          );
        }
      }
      if (checked < 50) {
        throw new Error(`110-01001:得 ${checked} 點對到「男+女」,太少,檢查本身可能已經失效`);
      }
    },
    anchors: (series) =>
      collectAnchors(
        anchorVersusYear(series, "1997-06", { label: "回歸嗰年年中" }),
        anchorVersusYear(series, "1961-06", { label: "有紀錄最早" }),
        // 刻意唔用「相當於幾多個體育館」呢類錨點 —— 要引入一個我驗證唔到嘅
        // 場館容量常數。呢個換成由同一條 series 計出嚟,學生驗得返。
        anchorAverageChange(series, { years: 10, noun: "人" })
      ),
  },
};

function latestValue(series) {
  return [...series].reverse().find((point) => Number.isFinite(point.value))?.value ?? null;
}

function latestPeriod(series) {
  return [...series].reverse().find((point) => Number.isFinite(point.value))?.period ?? null;
}

/**
 * 一個 row 屬唔屬於我哋要嘅切片?
 *
 * 關鍵:冇喺 cv 明文要求嘅維度唔會出標籤欄,而**有**要求嘅維度,
 * Total 行嘅值係空字串。所以「釘死喺 Total」= 對比 ""。
 */
function matchesPins(row, pin) {
  return Object.entries(pin).every(([dim, code]) => (row[dim] ?? "") === code);
}

/** 把統計處嘅 dataSet 砌成 SPEC 第 5 節嘅 series。 */
function toSeries(rows, spec) {
  const pin = spec.pin ?? {};
  const transform = spec.transform ?? ((value) => value);

  if (!spec.category_dim) {
    const kept = rows.filter((row) => matchesPins(row, pin));
    if (kept.length === 0) {
      throw new Error(
        `${spec.table}:按 pin ${JSON.stringify(pin)} 篩完之後一行都冇。` +
          `多數係 pin 錯咗代碼 —— 記住 Total 行嘅維度值係空字串 ""。`
      );
    }
    return kept
      .map((row) => ({ period: formatPeriod(spec.freq, row.period), value: transform(toValue(row)) }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  const series = [];
  for (const { code, label_zh } of spec.categories) {
    const kept = rows.filter(
      (row) => (row[spec.category_dim] ?? "") === code && matchesPins(row, pin)
    );
    if (kept.length === 0) {
      throw new Error(
        `${spec.table}:分類 ${spec.category_dim}="${code}"(${label_zh})一行都冇。` +
          `API 對唔存在嘅 cv code 唔會報錯,所以呢個一定要當錯處理。`
      );
    }
    for (const row of kept) {
      series.push({
        period: formatPeriod(spec.freq, row.period),
        category: label_zh,
        value: transform(toValue(row)),
      });
    }
  }
  return series.sort((a, b) => a.period.localeCompare(b.period) || a.category.localeCompare(b.category));
}

/** 剪走尾段全部係 null 嘅期數(未出嘅數),中間嘅 null 要留低。 */
function trimTrailingGaps(series) {
  const periods = [...new Set(series.map((point) => point.period))].sort();
  let last = -1;
  for (let i = periods.length - 1; i >= 0; i--) {
    if (series.some((point) => point.period === periods[i] && point.value !== null)) {
      last = i;
      break;
    }
  }
  if (last === -1) return [];
  const keep = new Set(periods.slice(0, last + 1));
  return series.filter((point) => keep.has(point.period));
}

/** 由設定砌一份符合 SPEC 第 5 節嘅指標文件。 */
export async function loadCenstatdIndicator(id) {
  const spec = CENSTATD_INDICATORS[id];
  if (!spec) throw new Error(`指標 "${id}" 唔喺登記冊入面`);

  const { dataSet, meta } = await queryCenstatd({
    id: spec.table,
    sv: { [spec.sv]: [spec.stat_pres] },
    cv: spec.cv ?? {},
    period: { start: spec.period_start },
  });

  const rows = pickFrequency(dataSet, spec.freq);

  // 指標自己嘅健康檢查。統計處個 API 大部分錯法都唔會報錯,
  // 所以邊個指標有得驗嘅不變式,就一定要驗。
  const series = trimTrailingGaps(toSeries(rows, spec));
  if (series.length === 0) {
    throw new Error(`${id}:篩完之後冇任何有數嘅期數,唔應該出街`);
  }

  // 指標自己嘅健康檢查,驗嘅係**最終 series**。
  // 統計處個 API 大部分錯法都唔會報錯,所以邊個指標有得驗嘅不變式就一定要驗。
  spec.verify?.(rows, series);

  const info = tableInfo(meta);

  return buildIndicator({
    indicator_id: id,
    name_zh: spec.name_zh,
    name_en: spec.name_en,

    unit_zh: spec.unit_override_zh ?? statPresLabel(meta, spec.sv, spec.stat_pres),
    unit_en: spec.unit_en,
    unit_short_zh: spec.unit_short_zh,

    source_zh: CENSTATD_LICENCE.source_zh,
    source_en: CENSTATD_LICENCE.source_en,
    // 畀學生撳去核對嘅係人睇嘅版面,唔係 API endpoint。
    source_url: `https://www.censtatd.gov.hk/tc/web_table.html?id=${spec.table}`,
    source_note_zh: `${info.source}(統計處表 ${spec.table}:${info.title})`,
    licence: CENSTATD_LICENCE.licence,
    licence_url: CENSTATD_LICENCE.licence_url,

    // SPEC 第 5 節:updated_at 係數據截至日期,唔係 build 日期。
    updated_at: info.lastModified,
    fetched_at: new Date().toISOString(),
    frequency: toSpecFrequency(spec.freq),
    acquisition: "api",

    category: spec.category,
    question_zh: spec.question_zh,
    notes_zh: spec.notes_zh ?? null,
    chart: spec.chart ?? { type: "line", y_zero: false },
    anchors: spec.anchors ? spec.anchors(series) : [],

    series,
  });
}

/** 首頁指標卡嘅排序同分組用。 */
export const INDICATOR_ORDER = ["gdp", "population"];
