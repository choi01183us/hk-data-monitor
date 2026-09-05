// data loader:人均本地生產總值(統計處表 310-31001)
//
// 呢個係第 1 步打通嘅第一條通路。揀佢嘅原因見 findings.md 第 6 節:
// SPEC 第 6 節 12 行入面,只有呢一行嘅表號實測完全冇錯。
//
// ⚠️ 對 SPEC 第 6 節嘅一個偏離,要負責人知:
//    SPEC 第 5 行寫「gdp | GDP 及人均 GDP」,即係想一個指標裝兩樣嘢。
//    做唔到 —— 本地生產總值總額嘅單位係「百萬港元」(2025 年約 3,186,526),
//    人均係「港元」(2025 年 444,044),兩者差 7 個數量級。
//    SPEC 第 9 節明文「唔好用雙 Y 軸」,而 schema 得一個 unit_zh,
//    夾硬擺埋一齊就一定會違反其中一條。
//    所以呢度只做人均,總額之後開一個 gdp_total。
//
// 輸出:符合 SPEC 第 5 節 schema 嘅 JSON,經 stdout 交畀 Observable Framework。

import {
  queryCenstatd,
  pickFrequency,
  formatPeriod,
  toSpecFrequency,
  toValue,
  statPresLabel,
  tableInfo,
  CENSTATD_LICENCE,
} from "./_lib/censtatd.js";
import { buildIndicator } from "./_lib/schema.js";
import { loadIndicator } from "./_lib/snapshot.js";
import { anchorPerDay, anchorVersusYear, collectAnchors } from "../components/anchor.js";

const TABLE_ID = "310-31001";
const STAT_VAR = "CURPGDP"; // 按人口平均計算的本地生產總值,以當時市價計算
const STAT_PRES = "Raw_hkd_d"; // 原始數字,港元

async function fetchGdpPerCapita() {
  const { dataSet, meta } = await queryCenstatd({
    id: TABLE_ID,
    sv: { [STAT_VAR]: [STAT_PRES] },
    // 310-31001 冇非時間維度(comp.json 得 CCYY 同 Q),所以 cv 空係合法嘅。
    // censtatd.js 會自己按 is_time_series 判斷,唔會誤報。
    cv: {},
    // period.start 必填。唔寫嘅話 API 只會回 default_series_period 嗰種頻率。
    period: { start: "196101" },
  });

  const info = tableInfo(meta);

  // 一寫 period 就會年度同季度溝埋同一個 array 回。人均 GDP 只有年度數,
  // 但照樣要明文分流 —— 唔好靠「佢應該只有年度」呢種假設。
  const rows = pickFrequency(dataSet, "Y");

  const series = rows
    .map((row) => ({ period: formatPeriod("Y", row.period), value: toValue(row) }))
    .sort((a, b) => a.period.localeCompare(b.period));

  // 尾段嘅 null 冇資訊價值(未出嘅年份),剪走。
  // 中間嘅 null 要留 —— 「嗰年真係冇數」本身係一件要畀學生見到嘅事。
  const lastWithValue = series.findLastIndex((point) => point.value !== null);
  if (lastWithValue === -1) {
    throw new Error(`${TABLE_ID}:全部年份都冇數,唔應該出街`);
  }
  const trimmed = series.slice(0, lastWithValue + 1);

  const anchors = collectAnchors(
    anchorPerDay(trimmed.at(-1)?.value, { currency: "HKD", label: "每人每日" }),
    anchorVersusYear(trimmed, "1997"),
    anchorVersusYear(trimmed, String(Number(trimmed.at(-1).period) - 10))
  );

  return buildIndicator({
    indicator_id: "gdp",
    name_zh: "人均本地生產總值",
    name_en: "GDP per capita (at current market prices)",

    unit_zh: statPresLabel(meta, STAT_VAR, STAT_PRES), // 實測係「港元」
    unit_en: "HK$",
    unit_short_zh: "元",

    source_zh: CENSTATD_LICENCE.source_zh,
    source_en: CENSTATD_LICENCE.source_en,
    // 學生撳得入去自己核對嘅版面,唔係 API endpoint —— API 個 URL 開唔到嘢睇。
    source_url: `https://www.censtatd.gov.hk/tc/web_table.html?id=${TABLE_ID}`,
    source_note_zh: `${info.source}(統計處表 ${TABLE_ID}:${info.title})`,
    licence: CENSTATD_LICENCE.licence,
    licence_url: CENSTATD_LICENCE.licence_url,

    // SPEC 第 5 節特別叮囑:updated_at 係數據本身嘅截至日期,唔係 build 日期。
    // 用統計處自己講嘅表最後更新日,唔用 new Date()。
    updated_at: info.lastModified,
    fetched_at: new Date().toISOString(),
    frequency: toSpecFrequency("Y"),
    acquisition: "api",

    category: "經濟",
    question_zh: "香港平均每個人,一年創造幾多經濟價值?",
    notes_zh:
      "「以當時市價計算」即係冇扣除通脹。所以呢條線升,唔一定代表大家真係富裕咗 —— " +
      "有一部分升幅淨係因為物價升咗。想睇撇除通脹之後嘅變化,要睇「以環比物量計算」嗰個系列。",
    chart: { type: "line", y_zero: false },
    anchors,

    series: trimmed,
  });
}

const indicator = await loadIndicator("gdp", fetchGdpPerCapita);
process.stdout.write(JSON.stringify(indicator));
