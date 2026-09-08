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
import { formatNumber, formatChineseMagnitude, formatPeriodZh } from "../../components/format.js";
import {
  anchorPerDay,
  anchorVersusYear,
  anchorMultipleOf,
  anchorAverageChange,
  anchorPerCapita,
  collectAnchors,
} from "../../components/anchor.js";
import { loadFstbCsvIndicator } from "./fstb.js";
import { loadFiscalReserves } from "./treasury.js";

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
  rd_expenditure: {
    table: "710-86001",
    sv: "GRD_EXP",
    stat_pres: "Raw_M_1dp_hkd_d",
    cv: { SECTOR: ["1", "2", "3"] },
    freq: "Y",
    // 2018 起納入研發設施隱含使用成本，唔將舊口徑接成同一條可比線。
    period_start: "201801",
    pin: { SECTOR: "" },
    unit_zh: "港元",
    value_digits: 0,
    name_zh: "本地研發總開支",
    name_en: "Gross domestic expenditure on research and development",
    unit_en: "HK$",
    unit_short_zh: "元",
    category: "科技",
    question_zh: "香港一年投放幾多資源做研究同開發?",
    basis_zh: "統計年度內在香港進行嘅內部研發活動開支總額，包括工商、高等教育及政府機構；包括境外資助在港研發，唔包括支付境外機構研發嘅開支，唔係政府創科預算",
    notes_zh: "原表以百萬港元列示，本站乘 1,000,000 換成港元。金額未扣除通脹。" +
      "自 2018 年起，統計納入研發設施嘅隱含使用成本，不能同較早數字直接比較，所以此圖由 2018 年起。" +
      "數字包括企業、大學同政府機構在香港進行嘅研發，唔代表全部由政府出資，亦唔可以當政府創科預算或加落公共經常開支總額。",
    chart: { type: "line", y_zero: true },
    transform: (value) => (value === null ? null : Math.round(value * 1_000_000)),
    verify: verifyRdExpenditure,
    anchors: (series) => collectAnchors(anchorVersusYear(series, "2018", { label: "可直接比較嘅起點" })),
  },

  household_internet: {
    table: "720-90001",
    sv: "IT_HH",
    stat_pres: "Prop_1dp_%_n",
    cv: { TYPE_IT_USAGE: ["With_Internet_as"] },
    freq: "Y",
    period_start: "201801",
    pin: { TYPE_IT_USAGE: "With_Internet_as" },
    unit_zh: "%",
    value_digits: 1,
    name_zh: "家中有接駁互聯網嘅住戶比例",
    name_en: "Percentage of households with Internet access at home",
    unit_en: "% of households",
    unit_short_zh: "%",
    category: "科技",
    question_zh: "幾多住戶可以喺屋企上網?數碼服務會唔會漏低一啲家庭?",
    basis_zh: "家中有以任何設備接駁互聯網嘅住戶，佔該統計年份所有住戶嘅百分比；分母係住戶，唔係人數或寬頻用戶數",
    notes_zh: "資料來自主題性住戶統計調查。年份係統計年份，各次實際調查期間請看來源報告註釋。" +
      "家中可以上網，唔等於每位成員都有合適設備、負擔得起服務，或者識得使用網上服務。" +
      "比例嘅升跌以百分點比較；全港平均亦睇唔到個別年齡、收入或地區嘅差距。",
    chart: { type: "line", y_zero: true },
    verify: verifyHouseholdInternet,
    anchors: (series) => {
      const latest = [...series].reverse().find((point) => Number.isFinite(point.value));
      return collectAnchors(latest ? {
        id: "internet-per-hundred-households",
        text_zh: `${formatPeriodZh(latest.period)}每 100 戶，約有 ${formatNumber(latest.value, { digits: 1 })} 戶喺家中可以上網`,
        basis_zh: `${latest.value}% × 100 戶；分母係該統計年份所有住戶，唔係人口`,
      } : null);
    },
  },

  gdp: {
    table: "310-31001",
    sv: "CURPGDP",
    stat_pres: "Raw_hkd_d",
    cv: {},
    freq: "Y",
    period_start: "196101",

    // 統計處出嘅單位描述好長(例如「第五十個百分位數（港元）」),
    // 直接擺上大字會蓋過個數。乾淨單位擺 unit_zh,原文照留喺 unit_source_zh 做出處。
    unit_zh: "港元",
    value_digits: 0,
    name_zh: "人均本地生產總值",
    basis_zh: "以當時市價計算嘅人均本地生產總值，未扣除通脹",
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

    // 統計處出嘅單位描述好長(例如「第五十個百分位數（港元）」),
    // 直接擺上大字會蓋過個數。乾淨單位擺 unit_zh,原文照留喺 unit_source_zh 做出處。
    unit_zh: "人",
    value_digits: 0,
    name_zh: "香港人口",
    basis_zh: "香港總人口（男女、全年齡，包括外籍家庭傭工）；各期為年中或年底人口",
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

  unemployment: {
    table: "210-06401",
    sv: "UR",
    stat_pres: "Rate_1dp_%_n",
    // AGE 同 SEX 都係必填。SEX 釘死喺 Total,AGE 就係我哋想比較嘅兩條線。
    // ⚠️ AGE 有兩個重疊嘅分組(15-24 同 15-19/20-24 同時存在),
    //    唔可以撈埋一齊用,否則會 double count。
    cv: { AGE: ["15-24"], SEX: ["M", "F"] },
    freq: "Y",
    period_start: "198501",
    pin: { SEX: "" },
    category_dim: "AGE",
    categories: [
      { code: "", label_zh: "全港整體" },
      { code: "15-24", label_zh: "15–24 歲青年" },
    ],

    // 統計處出嘅單位描述好長(例如「第五十個百分位數（港元）」),
    // 直接擺上大字會蓋過個數。乾淨單位擺 unit_zh,原文照留喺 unit_source_zh 做出處。
    unit_zh: "%",
    value_digits: 1,
    name_zh: "失業率",
    basis_zh: "各組失業人數佔該組勞動人口嘅百分比；青年組為 15–24 歲青年勞動人口，全港整體組為全港勞動人口，唔係全體青年或學生人口嘅比例",
    name_en: "Unemployment rate",
    unit_en: "%",
    unit_short_zh: "%",
    category: "就業",
    question_zh: "想搵工但搵唔到嘅人,佔幾多?後生仔女又點?",
    notes_zh:
      "SPEC 原本指定嘅表(210-06101)根本冇年齡維度,攞唔到青年失業率,所以換咗 210-06401。" +
      "「失業」一般指冇工開、有搵過工、而且隨時做得。所以讀緊書冇搵工嘅學生唔計入失業。" +
      "失業率嘅分母係勞動人口(就業人士加失業人士),唔係所有青年或全班學生。青年嗰條線只計 15–24 歲嘅勞動人口。",
    chart: { type: "line", y_zero: true },
    anchors: (series) => {
      const youth = series.filter((p) => p.category === "15–24 歲青年" && Number.isFinite(p.value));
      const all = series.filter((p) => p.category === "全港整體" && Number.isFinite(p.value));
      const latestYouth = youth.at(-1);
      const latestAll = all.at(-1);
      const peakAll = all.reduce((best, p) => (best === null || p.value > best.value ? p : best), null);
      return collectAnchors(
        latestYouth
          ? {
              id: "youth-per-hundred",
              text_zh: `${formatPeriodZh(latestYouth.period)}每 100 名 15–24 歲青年勞動人口,約有 ${formatNumber(latestYouth.value, { digits: 1 })} 名失業人士`,
              basis_zh: `${latestYouth.value}% × 100 人;分母係同年 15–24 歲就業人士加失業人士,唔包括冇參與勞動市場嘅學生`,
            }
          : null,
        latestYouth && latestAll && latestYouth.period === latestAll.period && latestAll.value > 0
          ? {
              id: "youth-vs-all",
              text_zh: `${formatPeriodZh(latestYouth.period)}青年失業率係全港整體嘅 ${formatNumber(latestYouth.value / latestAll.value, { digits: 1 })} 倍`,
              basis_zh: `同年青年失業率 ${latestYouth.value}% ÷ 全港整體失業率 ${latestAll.value}%`,
            }
          : null,
        peakAll && latestAll && peakAll.period !== latestAll.period
          ? {
              id: "vs-peak",
              text_zh: `有紀錄以嚟最高係 ${peakAll.period} 年嘅 ${peakAll.value}%,而家係嗰陣嘅 ${formatNumber((latestAll.value / peakAll.value) * 100, { digits: 0 })}%`,
              basis_zh: `${latestAll.value}% ÷ ${peakAll.value}% × 100`,
            }
          : null
      );
    },
  },

  median_wage: {
    table: "220-23011",
    sv: "MW",
    stat_pres: "50%tile_hkd_d",
    cv: { SEX: ["M", "F"], EMP_NATURE: ["1"] },
    freq: "Y",
    period_start: "200901",
    pin: { SEX: "" },
    // 「所有僱員」定「全職僱員」—— 呢個口徑本身就係要拍板嘅嘢。
    // 兩個單位一樣(港元),所以索性兩條線都出,喺畫面講清楚分別,
    // 好過我哋幫學生揀咗一個然後唔講。
    category_dim: "EMP_NATURE",
    categories: [
      { code: "", label_zh: "所有僱員" },
      { code: "1", label_zh: "全職僱員" },
    ],

    // 統計處出嘅單位描述好長(例如「第五十個百分位數（港元）」),
    // 直接擺上大字會蓋過個數。乾淨單位擺 unit_zh,原文照留喺 unit_source_zh 做出處。
    unit_zh: "港元",
    value_digits: 0,
    name_zh: "每月工資中位數",
    basis_zh: "每月工資中位數，按所有僱員／全職僱員分類；2009–2010 年為第二季，2011 年起為 5 至 6 月",
    name_en: "Median monthly wage",
    unit_en: "HK$",
    unit_short_zh: "元",
    category: "就業",
    question_zh: "香港打工仔一個月賺幾多?",
    notes_zh:
      "「中位數」唔係「平均數」:把所有人由低到高排,企喺正中間嗰個就係中位數。" +
      "用中位數係因為少數極高收入會把平均數扯高,中位數就唔會。" +
      "「所有僱員」包埋兼職,所以低過「全職僱員」。2009–2010 年係該年第二季嘅數,2011 年起係 5 至 6 月。",
    chart: { type: "line", y_zero: false },
    anchors: (series) => {
      const all = series.filter((p) => p.category === "所有僱員" && p.value !== null);
      const latest = all.at(-1);
      const first = all[0];
      return collectAnchors(
        latest
          ? {
              id: "per-year",
              text_zh: `一年計就係 ${formatChineseMagnitude(latest.value * 12)} 元(未扣稅同強積金)`,
              basis_zh: `${formatNumber(latest.value)} 元 × 12 個月`,
            }
          : null,
        anchorVersusYear(all, first?.period, { label: "有紀錄最早" }),
        latest && first
          ? {
              id: "vs-first-per-year",
              text_zh: `即係比 ${first.period} 年每個月多 ${formatNumber(latest.value - first.value)} 元`,
              basis_zh: `${formatNumber(latest.value)} − ${formatNumber(first.value)}`,
            }
          : null
      );
    },
  },

  household_income: {
    table: "130-06102",
    sv: "MED_DH_INC",
    stat_pres: "Raw_hkd_d",
    // 呢個表冇任何非時間維度,所以 cv:{} 係合法嘅。
    cv: {},
    freq: "Y",
    period_start: "198501",

    // 統計處出嘅單位描述好長(例如「第五十個百分位數（港元）」),
    // 直接擺上大字會蓋過個數。乾淨單位擺 unit_zh,原文照留喺 unit_source_zh 做出處。
    unit_zh: "港元",
    value_digits: 0,
    name_zh: "住戶每月入息中位數",
    basis_zh: "整個住戶嘅每月入息中位數，唔係個人月薪",
    name_en: "Median monthly domestic household income",
    unit_en: "HK$",
    unit_short_zh: "元",
    category: "就業",
    question_zh: "一頭家一個月總共收入幾多?",
    notes_zh:
      "呢個係成個住戶加埋嘅收入,唔係一個人。所以佢同「每月工資中位數」唔可以直接比 —— " +
      "一個三人家庭可能有兩個人返緊工。" +
      "統計處另有「不包括外籍家庭傭工」嘅版本(MED_DH_INC_XFDH),數字會高啲。",
    chart: { type: "line", y_zero: false },
    anchors: (series) =>
      collectAnchors(
        (() => {
          const latest = [...series].reverse().find((p) => p.value !== null);
          return latest
            ? {
                id: "per-year",
                text_zh: `一年計就係 ${formatChineseMagnitude(latest.value * 12)} 元(成個住戶加埋)`,
                basis_zh: `${formatNumber(latest.value)} 元 × 12 個月`,
              }
            : null;
        })(),
        anchorVersusYear(series, "1997"),
        anchorVersusYear(series, series[0]?.period, { label: "有紀錄最早" })
      ),
  },

  cpi: {
    table: "510-60001",
    sv: "CC_CM_1920",
    stat_pres: "YoY_1dp_%_s",
    cv: {},
    freq: "M",
    period_start: "198101",

    // 統計處出嘅單位描述好長(例如「第五十個百分位數（港元）」),
    // 直接擺上大字會蓋過個數。乾淨單位擺 unit_zh,原文照留喺 unit_source_zh 做出處。
    unit_zh: "%",
    value_digits: 1,
    name_zh: "通脹率(綜合消費物價指數按年變動)",
    basis_zh: "綜合消費物價指數按年變動百分率，唔係按月變動率或物價指數水平",
    name_en: "Composite CPI, year-on-year change",
    unit_en: "%",
    unit_short_zh: "%",
    category: "物價",
    question_zh: "同一籃嘢,今年比舊年貴咗幾多?",
    notes_zh:
      "呢條線係「按年變動百分率」,唔係物價本身。線跌落嚟唔代表嘢平咗 —— " +
      "只要仲喺零以上,價錢就仲係升緊,只係升得慢咗。跌穿零先叫通縮。" +
      "統計處另有甲／乙／丙三類指數,分別對應唔同開支水平嘅住戶,感受到嘅通脹可以好唔同。",
    chart: { type: "line", y_zero: true },
    anchors: (series) => {
      const withValues = series.filter((p) => Number.isFinite(p.value));
      const latest = withValues.at(-1);
      // 輸入係按年率,唔係相接嘅按月升幅。唔可以把十二個重疊按年率當複利相乘。
      return collectAnchors(
        latest
          ? {
              id: "hundred-dollars",
              text_zh: `舊年 100 蚊買到嘅嘢,今年要 ${formatNumber(100 * (1 + latest.value / 100), { digits: 2 })} 蚊`,
              basis_zh: `${formatPeriodZh(latest.period)}按年變動 ${latest.value}%:100 × (1 + ${latest.value} ÷ 100)`,
            }
          : null,
        latest
          ? {
              id: "direction",
              text_zh:
                latest.value > 0
                  ? "按年通脹:整體物價比一年前同月高"
                  : latest.value < 0
                    ? "按年通縮:整體物價比一年前同月低"
                    : "按年變動為零:按公布數字,整體物價同一年前同月相若",
              basis_zh: `${formatPeriodZh(latest.period)}按年變動 ${latest.value}%;正數係上升,負數係下降,零係按公布精度不變`,
            }
          : null
      );
    },
  },

  four_key_industries: {
    table: "655-82101",
    sv: "VA_KEY_AND_SELECTED_IND",
    stat_pres: "Prop_1dp_%_n",
    cv: {
      IND: ["ind_KEY_IND_1", "ind_KEY_IND_2", "ind_KEY_IND_3", "ind_KEY_IND_4"],
    },
    freq: "Y",
    period_start: "200001",
    category_dim: "IND",
    // ⚠️ 呢度一定要明文列齊。cv 唔填嘅話 API 照回 Success,
    //    但幾個分類組會溝埋 —— 實測「貿易及物流」會由 18.9 變成 18.8。
    categories: [
      { code: "ind_KEY_IND_1", label_zh: "金融服務" },
      { code: "ind_KEY_IND_2", label_zh: "旅遊" },
      { code: "ind_KEY_IND_3", label_zh: "貿易及物流" },
      { code: "ind_KEY_IND_4", label_zh: "專業服務及其他工商業支援服務" },
    ],

    // 統計處出嘅單位描述好長(例如「第五十個百分位數（港元）」),
    // 直接擺上大字會蓋過個數。乾淨單位擺 unit_zh,原文照留喺 unit_source_zh 做出處。
    unit_zh: "%",
    value_digits: 1,
    name_zh: "四大行業佔本地生產總值比重",
    basis_zh: "四大行業嘅增加價值佔本地生產總值（GDP）嘅比重",
    name_en: "Share of the four key industries in GDP",
    unit_en: "% of GDP",
    unit_short_zh: "%",
    category: "經濟",
    question_zh: "香港靠邊幾行搵食?比重有冇變過?",
    notes_zh:
      "四條線加埋唔等於 100% —— 四大行業以外仲有製造業、建造業、公營部門等等。" +
      "睇呢個圖嘅重點唔係邊條線最高,而係邊條線嘅走勢喺變。",
    chart: { type: "line", y_zero: true },
    anchors: (series) => {
      const latestPeriod = series.filter((p) => p.value !== null).at(-1)?.period;
      const latest = series.filter((p) => p.period === latestPeriod && p.value !== null);
      const sum = latest.reduce((acc, p) => acc + p.value, 0);
      const top = latest.reduce((best, p) => (best === null || p.value > best.value ? p : best), null);
      const finance = series.filter((p) => p.category === "金融服務" && p.value !== null);
      const trade = series.filter((p) => p.category === "貿易及物流" && p.value !== null);
      return collectAnchors(
        latestPeriod
          ? {
              id: "sum",
              text_zh: `四大行業加埋佔 ${formatNumber(sum, { digits: 1 })}% —— 即係每 100 蚊經濟產值,有 ${formatNumber(100 - sum, { digits: 1 })} 蚊嚟自其他行業`,
              basis_zh: `${latest.map((p) => p.value).join(" + ")} = ${formatNumber(sum, { digits: 1 })}`,
            }
          : null,
        top ? { id: "top", text_zh: `最大嗰個係${top.category},佔 ${top.value}%`, basis_zh: `${latestPeriod} 年四個數入面最大` } : null,
        finance.length > 1 && trade.length > 1
          ? {
              id: "swap",
              text_zh: `${finance[0].period} 年貿易及物流(${trade[0].value}%)大過金融服務(${finance[0].value}%);${finance.at(-1).period} 年已經調轉`,
              basis_zh: `貿易及物流 ${trade[0].value}% → ${trade.at(-1).value}%,金融服務 ${finance[0].value}% → ${finance.at(-1).value}%`,
            }
          : null
      );
    },
  },

  hkex_listings: {
    table: "340-95003",
    sv: "LC",
    stat_pres: "Raw_num_n",
    cv: { SECURITIES_MARKET: ["MB", "GEM"] },
    freq: "Y",
    period_start: "201001",
    category_dim: "SECURITIES_MARKET",
    categories: [
      { code: "MB", label_zh: "主板" },
      { code: "GEM", label_zh: "GEM" },
    ],

    // 統計處出嘅單位描述好長(例如「第五十個百分位數（港元）」),
    // 直接擺上大字會蓋過個數。乾淨單位擺 unit_zh,原文照留喺 unit_source_zh 做出處。
    unit_zh: "間",
    value_digits: 0,
    name_zh: "香港交易所上市公司數目",
    basis_zh: "香港交易所主板及 GEM 上市公司數目，按市場分類",
    name_en: "Number of companies listed on HKEX",
    unit_en: "companies",
    unit_short_zh: "間",
    category: "經濟",
    question_zh: "有幾多間公司喺香港上市?",
    // 原始數據擁有人係港交所,統計處只係編製／轉載平台。標註要兩層都寫。
    source_override_zh: "香港交易及結算所有限公司(經政府統計處發布)",
    source_override_en: "Hong Kong Exchanges and Clearing Limited (published via C&SD)",
    notes_zh:
      "呢個表冇「總計」行,所以主板同 GEM 分開兩條線,想要總數就自己加埋。" +
      "上市公司數目多唔一定代表市場好 —— 仲要睇市值同成交額。",
    chart: { type: "line", y_zero: false },
    anchors: (series) => {
      const latestPeriod = series.filter((p) => p.value !== null).at(-1)?.period;
      const latest = series.filter((p) => p.period === latestPeriod && p.value !== null);
      const total = latest.reduce((acc, p) => acc + p.value, 0);
      const main = series.filter((p) => p.category === "主板" && p.value !== null);
      return collectAnchors(
        latestPeriod
          ? {
              id: "total",
              text_zh: `主板加 GEM 一共 ${formatNumber(total)} 間公司`,
              basis_zh: `${latest.map((p) => `${p.category} ${p.value}`).join(" + ")}`,
            }
          : null,
        anchorVersusYear(main, main[0]?.period, { label: "主板,有紀錄最早" }),
        main.length > 1
          ? {
              id: "per-year",
              text_zh: `主板平均每年多 ${formatNumber((main.at(-1).value - main[0].value) / (Number(main.at(-1).period) - Number(main[0].period)), { digits: 0 })} 間`,
              basis_zh: `(${main.at(-1).value} − ${main[0].value}) ÷ ${Number(main.at(-1).period) - Number(main[0].period)} 年`,
            }
          : null
      );
    },
  },
};

/** 新科技指標驗最終切片，唔只驗來源自己一致。 */
export function verifyRdExpenditure(rows, series) {
  for (const point of series) {
    if (!/^\d{4}$/.test(point.period) || point.period < "2018") {
      throw new Error("710-86001:只接受 2018 起可比年度");
    }
    const year = rows.filter((row) => row.period === point.period);
    const sectors = ["", "1", "2", "3"].map((sector) => {
      const selected = year.filter((row) => row.SECTOR === sector);
      if (selected.length !== 1) throw new Error(`710-86001 ${point.period}:機構 ${sector || "Total"} 缺少或重複`);
      const row = selected[0];
      if (row.freq !== "Y" || row.sv !== "GRD_EXP" || row.svDesc !== "百萬港元") {
        throw new Error(`710-86001 ${point.period}:研發變項、頻率或來源單位改變`);
      }
      const value = toValue(row);
      if (value !== null && value < 0) throw new Error(`710-86001 ${point.period}:研發開支不可為負數`);
      return value;
    });
    const [total, ...parts] = sectors;
    const expected = total === null ? null : Math.round(total * 1_000_000);
    if (point.value !== expected) throw new Error(`710-86001 ${point.period}:最終數列唔等於原表 Total 乘一百萬，檢查 pin 同換算`);
    // 來源三分項及總數各四捨五入至 0.1 百萬；用整數十分位處理浮點誤差。
    // 最大捨入差為 0.2 百萬。呢個獨立來源檢查唔會改動財政開支嘅 1 百萬門檻。
    if (sectors.every((value) => value !== null)) {
      const difference = Math.abs(Math.round(total * 10) - parts.reduce((sum, value) => sum + Math.round(value * 10), 0));
      if (difference > 2) throw new Error(`710-86001 ${point.period}:三類機構之和對唔上原表 Total`);
    }
  }
}

export function verifyHouseholdInternet(rows, series) {
  for (const point of series) {
    const selected = rows.filter((row) => row.period === point.period && row.TYPE_IT_USAGE === "With_Internet_as");
    if (selected.length !== 1) throw new Error(`720-90001 ${point.period}:家中上網分類缺少或重複`);
    const row = selected[0];
    if (row.freq !== "Y" || row.sv !== "IT_HH" || row.svDesc !== "比率（%）") {
      throw new Error(`720-90001 ${point.period}:住戶變項、頻率或來源單位改變`);
    }
    const expected = toValue(row);
    if (expected !== null && (expected < 0 || expected > 100)) throw new Error(`720-90001 ${point.period}:住戶比例必須在 0 至 100% 之間`);
    if (point.value !== expected) throw new Error(`720-90001 ${point.period}:最終數列唔等於原表住戶比例，檢查分類及換算`);
  }
}

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

/**
 * 剪走頭尾全部係 null 嘅期數。中間嘅 null 一定要留低 ——
 * 「嗰期真係冇數」本身係一件要畀學生見到嘅事,唔可以當冇發生。
 *
 * 頭段都要剪:例如按年變動率,有紀錄嘅第一年冇得同上一年比,一定係 null。
 */
function trimGaps(series) {
  const periods = [...new Set(series.map((point) => point.period))].sort();
  const hasValue = (period) => series.some((point) => point.period === period && point.value !== null);
  let first = periods.findIndex(hasValue);
  if (first === -1) return [];
  let last = periods.length - 1;
  while (last > first && !hasValue(periods[last])) last -= 1;
  const keep = new Set(periods.slice(first, last + 1));
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
  const series = trimGaps(toSeries(rows, spec));
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

    unit_zh: spec.unit_zh,
    // 統計處自己點叫呢個數 —— 保留返做出處,喺來源欄顯示。
    unit_source_zh: statPresLabel(meta, spec.sv, spec.stat_pres),
    value_digits: spec.value_digits ?? 0,
    unit_en: spec.unit_en,
    unit_short_zh: spec.unit_short_zh,

    source_zh: spec.source_override_zh ?? CENSTATD_LICENCE.source_zh,
    source_en: spec.source_override_en ?? CENSTATD_LICENCE.source_en,
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
    basis_zh: spec.basis_zh ?? null,
    notes_zh: spec.notes_zh ?? null,
    chart: spec.chart ?? { type: "line", y_zero: false },
    anchors: spec.anchors ? spec.anchors(series) : [],
    category_order: spec.categories?.map((c) => c.label_zh) ?? null,

    series,
  });
}


// ── 財政數據(財經事務及庫務局 CSV、庫務署 JSON)──────────────────
//
// SPEC 第 1 節三個活動入面,「資源裁定會議(分餅)」同「青年預算備忘」最靠呢三個。
// 來源同 SPEC 第 6 節寫嘅唔同,實測結果見 findings.md 第 1 節。

const DATA_GOV_HK_FIN_STATS = "https://data.gov.hk/tc-data/dataset/hk-fstb-tsyb-financial-statistics";

function latestTotal(extras) {
  return [...(extras.totals ?? [])].reverse().find((t) => t.value !== null) ?? null;
}

export const FISCAL_INDICATORS = {
  govt_expenditure: {
    kind: "fstb",
    file: "fin-stats_recurrent-exp_a_tc.csv",
    dataset_url: DATA_GOV_HK_FIN_STATS,
    categories: [
      { column: "教育", label_zh: "教育" },
      { column: "社會福利", label_zh: "社會福利" },
      { column: "衞生", label_zh: "衞生" },
      { column: "其他", label_zh: "其他" },
    ],
    total_column: "經常開支",

    name_zh: "政府經常開支",
    basis_zh: "政府經常開支，只計政府帳目，唔包括營運基金及房屋委員會，亦唔係全年開支總額",
    name_en: "Government recurrent expenditure by policy area",
    category: "公共財政",
    question_zh: "政府經常開支每年有幾多?使喺邊度?",
    notes_zh:
      "呢頁係政府經常開支,只計政府帳目,唔包括營運基金及房屋委員會,亦唔係全年開支總額。" +
      "附錄 B 第 I 部嘅結構係:公共開支 = 政府開支 + 營運基金 + 房屋委員會。" +
      "呢份 CSV 只拆教育、社會福利、衞生及其他四類;另一頁十個政策組別用公共經常開支口徑。" +
      "兩頁口徑不同,唔可以放埋同一張圖或將總額相加。",
    chart: { type: "line", y_zero: true },
    anchors: (series, extras) => {
      const total = latestTotal(extras);
      const edu = series.filter((p) => p.category === "教育");
      const eduLatest = [...edu].reverse().find((p) => p.value !== null);
      return collectAnchors(
        total ? anchorPerCapita(total.value, total.period, extras.population, { noun: "每名香港市民一年", fiscal: true }) : null,
        total && eduLatest && eduLatest.period === total.period
          ? {
              id: "edu-share",
              text_zh: `每 100 元經常開支,有 ${formatNumber((eduLatest.value / total.value) * 100, { digits: 1 })} 元使喺教育`,
              basis_zh: `教育 ${formatChineseMagnitude(eduLatest.value)} ÷ 經常開支總額 ${formatChineseMagnitude(total.value)} × 100`,
            }
          : null,
        anchorVersusYear(
          (extras.totals ?? []).map((t) => ({ period: t.period, value: t.value })),
          "1997-98",
          { label: "回歸嗰年,總額" }
        )
      );
    },
  },

  govt_revenue: {
    kind: "fstb",
    file: "fin-stats_govt-revenue_c_tc.csv",
    dataset_url: DATA_GOV_HK_FIN_STATS,
    categories: [
      { column: "利得稅", label_zh: "利得稅" },
      { column: "薪俸稅", label_zh: "薪俸稅" },
      { column: "地價收入", label_zh: "地價收入" },
      { column: "印花稅", label_zh: "印花稅" },
      { column: "投資收入", label_zh: "投資收入" },
      { column: "其他收入", label_zh: "其他收入" },
    ],
    total_column: "政府收入總額",

    name_zh: "政府收入",
    basis_zh: "各財政年度嘅政府收入，按收入來源分類，唔係財政儲備結餘",
    name_en: "Government revenue by source",
    category: "公共財政",
    question_zh: "政府啲錢由邊度嚟?邊條線最唔穩陣?",
    notes_zh:
      "「利得稅」係公司交嘅,「薪俸稅」係打工仔交嘅。「地價收入」係賣地同補地價,唔係稅 —— " +
      "佢係六條線入面上落最大嗰條,樓市一淡就跌一大截。SPEC 原本以為呢批數只有立法會 PDF,實測上游有齊 CSV。",
    chart: { type: "line", y_zero: true },
    anchors: (series, extras) => {
      const total = latestTotal(extras);
      const land = series.filter((p) => p.category === "地價收入" && p.value !== null);
      const peak = land.reduce((best, p) => (best === null || p.value > best.value ? p : best), null);
      const landLatest = land.at(-1);
      return collectAnchors(
        total ? anchorPerCapita(total.value, total.period, extras.population, { noun: "每名香港市民一年貢獻", fiscal: true }) : null,
        peak && landLatest && peak.period !== landLatest.period
          ? {
              id: "land-vs-peak",
              text_zh: `地價收入最高係 ${peak.period} 年度,最新(${landLatest.period})只係嗰陣嘅 ${formatNumber((landLatest.value / peak.value) * 100, { digits: 0 })}%`,
              basis_zh: `${formatChineseMagnitude(landLatest.value)} ÷ ${formatChineseMagnitude(peak.value)} × 100`,
            }
          : null
      );
    },
  },

  fiscal_reserves: {
    kind: "treasury",
    dataset_url: "https://data.gov.hk/tc-data/dataset/hk-try-trymthfinr-press-release-financial-results",

    name_zh: "財政儲備",
    basis_zh: "政府財政儲備嘅月末結餘，唔係全年收入",
    name_en: "Fiscal reserves",
    category: "公共財政",
    question_zh: "政府銀行戶口有幾多錢?夠用幾耐?",
    notes_zh: "SPEC 原本以為呢個要人手抄庫務署網頁,實測有 JSON,由 2019 年 4 月起每月一點。",
    chart: { type: "line", y_zero: true },
    anchors: (series, extras) => {
      const latest = [...series].reverse().find((p) => p.value !== null);
      const spend = extras.monthlyExpenditure ?? [];
      const last12 = spend.slice(-12);
      const avgMonthly = last12.length === 12 ? last12.reduce((a, p) => a + p.value, 0) / 12 : null;
      return collectAnchors(
        latest ? anchorPerCapita(latest.value, latest.period, extras.population, { noun: "每名香港市民", fiscal: false }) : null,
        latest && avgMonthly
          ? {
              id: "months-of-spending",
              text_zh: `如果政府一蚊收入都冇,呢筆儲備夠使大約 ${formatNumber(latest.value / avgMonthly, { digits: 1 })} 個月`,
              basis_zh: `儲備 ${formatChineseMagnitude(latest.value)} ÷ 最近 12 個月平均每月開支 ${formatChineseMagnitude(avgMonthly)}`,
            }
          : null,
        anchorVersusYear(series, series[0]?.period, { label: "有紀錄最早" })
      );
    },
  },
};

export async function loadFiscalIndicator(id) {
  const spec = FISCAL_INDICATORS[id];
  if (!spec) throw new Error(`指標 "${id}" 唔喺財政登記冊入面`);
  if (spec.kind === "fstb") return loadFstbCsvIndicator(id, spec);
  if (spec.kind === "treasury") return loadFiscalReserves(spec);
  throw new Error(`指標 "${id}" 嘅 kind "${spec.kind}" 唔識`);
}

/** 首頁指標卡嘅排序同分組用。 */
export const INDICATOR_ORDER = [
  "govt_expenditure",
  "govt_revenue",
  "fiscal_reserves",
  "gdp",
  "population",
  "unemployment",
  "median_wage",
  "household_income",
  "cpi",
  "four_key_industries",
  "hkex_listings",
];
