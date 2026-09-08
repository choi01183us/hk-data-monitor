// 指標圖表 —— 全部指標頁共用。
//
// SPEC 第 9 節嘅硬性限制,實作喺呢度:
//   · 預設折線或長條
//   · 唔用圓餅圖比較超過 5 類
//   · 唔用 3D
//   · **唔用雙 Y 軸** —— 一個指標一個單位,schema 本身就只有一個 unit_zh
//   · 手機優先(width < 480 就收窄邊距、縮矮)
//
// 呢幾條唔係風格偏好:中學生睇圖表嘅常見誤讀,多數就係由呢幾樣引起。

import * as Plot from "npm:@observablehq/plot";

import { formatNumber, formatChineseMagnitude, toDate, isFiscalPeriodSeries, fiscalTickLabel } from "./format.js";

/**
 * 一個指標最多畫幾多條線。多過呢個數,圖就變咗一舊冷氣機。
 * 6 係為咗政府收入(利得稅／薪俸稅／地價／印花稅／投資／其他)—— 六類都有教學價值,
 * 合併任何兩類都會失去「地價收入大上大落」呢個重點。SPEC 第 9 節嘅「唔超過 5 類」
 * 講嘅係圓餅圖;折線用 observable10 配色,6 條仲分得開。
 */
const MAX_SERIES = 6;

/**
 * @param {object} indicator  符合 SPEC 第 5 節 schema 嘅指標 JSON
 * @param {number} width      由 resize() 傳入
 */
export function indicatorChart(indicator, width) {
  const type = indicator.chart?.type ?? "line";
  if (type === "bar") return barChart(indicator, width);
  return lineChart(indicator, width);
}

function narrow(width) {
  return width < 480;
}

function yAxis(indicator) {
  return {
    label: `${indicator.name_zh}(${indicator.unit_zh})`,
    grid: true,
    zero: indicator.chart?.y_zero ?? false,
    tickFormat: (value) => formatChineseMagnitude(value),
  };
}

function tooltipTitle(indicator) {
  return (row) =>
    row.value === null
      ? `${row.label}\n冇數字`
      : `${row.label}\n${formatNumber(row.value)} ${indicator.unit_zh}`;
}

/**
 * period 字串轉 Date。一個指標得一種 frequency,所以唔會撈亂 ——
 * 但「2000-01」係年月定財政年度,要睇成條 series 先分得到(見 format.js)。
 * 轉唔到嘅期數要大聲死,唔可以靜靜哋掉走:曾經因為咁,30 年數據得 12 年上到圖。
 */
function toRows(indicator) {
  const fiscal = isFiscalPeriodSeries(indicator.series.map((point) => point.period));
  const rows = indicator.series.map((point) => ({
    date: toDate(point.period, { fiscal }),
    period: point.period,
    category: point.category ?? null,
    value: point.value,
    label: point.category ? `${point.period} · ${point.category}` : point.period,
  }));
  const broken = rows.filter((row) => row.date === null).map((row) => row.period);
  if (broken.length > 0) {
    throw new Error(
      `${indicator.indicator_id}:有 ${broken.length} 個期數轉唔到做日期(例如「${broken[0]}」),` +
        `唔可以靜靜哋唔畫佢哋。`
    );
  }
  return { rows, fiscal };
}

function lineChart(indicator, width) {
  const { rows, fiscal } = toRows(indicator);
  const categories = [...new Set(rows.map((row) => row.category).filter(Boolean))];

  if (categories.length > MAX_SERIES) {
    throw new Error(
      `${indicator.indicator_id}:有 ${categories.length} 條線,多過 ${MAX_SERIES} 條。` +
        `SPEC 第 9 節要求圖表要睇得明 —— 拆做幾個指標,或者揀少啲分類。`
    );
  }

  const isMulti = categories.length > 1;
  const latest = rows.filter((row) => row.value !== null).at(-1);

  return Plot.plot({
    width,
    height: narrow(width) ? 260 : 360,
    marginLeft: narrow(width) ? 54 : 66,
    marginBottom: 36,
    marginTop: 16,
    // 財政年度嘅刻度寫「2019–20」,唔好寫「2020」—— 個點喺 2019 年 4 月,寫 2020 會誤導
    x: fiscal
      ? { label: null, type: "utc", tickFormat: fiscalTickLabel, ticks: narrow(width) ? 5 : 8 }
      : { label: null, type: "utc" },
    y: yAxis(indicator),
    // domain 跟登記冊寫嘅次序 —— 否則圖例會字母排序,「其他」可以排喺「教育」前面
    color: isMulti
      ? { legend: true, scheme: "observable10", domain: indicator.category_order ?? categories }
      : undefined,
    marks: [
      // 單條線先填色 —— 多條線疊住填色會互相遮住,睇唔到底下嗰條。
      !isMulti ? Plot.areaY(rows, { x: "date", y: "value", fillOpacity: 0.1 }) : null,
      Plot.ruleY(indicator.chart?.y_zero ? [] : []),
      Plot.lineY(rows, {
        x: "date",
        y: "value",
        stroke: isMulti ? "category" : undefined,
        strokeWidth: 2,
      }),
      // 標住最新一點,學生一眼知條線邊頭係「而家」。
      !isMulti && latest
        ? Plot.dot([latest], { x: "date", y: "value", r: 4, fill: "currentColor" })
        : null,
      Plot.tip(rows, Plot.pointerX({ x: "date", y: "value", title: tooltipTitle(indicator) })),
    ].filter(Boolean),
  });
}

/**
 * 長條圖:用嚟畫「最新一期,按分類拆開」。
 *
 * 刻意用橫向長條(y 做分類):中文分類名長,直向長條嘅標籤會打斜或者疊晒一齊,
 * 喺手機更加睇唔到。
 */
function barChart(indicator, width) {
  const period = indicator.chart?.period ?? indicator.coverage?.end;
  const rows = indicator.series
    .filter((point) => point.period === period && point.value !== null)
    .map((point) => ({ category: point.category ?? indicator.name_zh, value: point.value }));

  if (rows.length === 0) {
    throw new Error(`${indicator.indicator_id}:期數 ${period} 冇任何有數嘅分類,畫唔到長條圖`);
  }

  return Plot.plot({
    width,
    height: Math.max(180, rows.length * (narrow(width) ? 30 : 36) + 60),
    marginLeft: narrow(width) ? 110 : 160,
    marginRight: 86,
    x: {
      label: indicator.chart?.label_zh ?? `${indicator.unit_zh}(${period})`,
      grid: true,
      tickFormat: (value) => formatChineseMagnitude(value),
    },
    y: { label: "" },
    marks: [
      Plot.barX(rows, {
        x: "value",
        y: "category",
        title: (row) => `${row.category}\n${formatNumber(row.value, { digits: 0 })} ${indicator.unit_zh}`,
        sort: { y: "x", reverse: true },
        fillOpacity: 0.85,
      }),
      // 數字直接寫喺條後面 —— 唔使學生對住格線估。
      Plot.text(rows.filter((row) => row.value >= 0), {
        x: "value",
        y: "category",
        text: (row) => formatChineseMagnitude(row.value),
        textAnchor: "start",
        dx: 6,
      }),
      Plot.text(rows.filter((row) => row.value < 0), {
        // 負數嘅值放喺零線右邊,避免同圖左邊嘅中文分類標籤疊住。
        x: 0,
        y: "category",
        text: (row) => formatChineseMagnitude(row.value),
        textAnchor: "start",
        dx: 6,
      }),
      Plot.ruleX([0]),
    ],
  });
}
