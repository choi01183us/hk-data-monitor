// 庫務署「政府財務狀況」月度 JSON 轉接器 —— 財政儲備。
//
// 實測形狀(findings.md 第 1 節):
//   https://www.try.gov.hk/cinternet/trymthfinr/press_release_<YYYY-YY>_c.json
//   -> [ { "財政年度": "2026-27", "月份": "2026年4月", "本月底的財政儲備": "648602.2", ... }, ... ]
//
//   · 一個財政年度一份檔,2019-20 起先有(2018-19 回 404)
//   · **所有數值係字串**,唔係 number
//   · 舊年度嘅 3 月行「月份」會帶「(臨時數字)」尾巴,例如「2020年3月(臨時數字)」
//   · 單位係百萬元
//
// SPEC 第 6 節原本以為呢個要人手抄 HTML,實測有齊 JSON,升咗做 api。

import { fetchJson, politePause } from "./http.js";
import { buildIndicator } from "./schema.js";
import { toNumber } from "./csv.js";
import { readPopulationSeries } from "./population-ref.js";

const BASE = "https://www.try.gov.hk/cinternet/trymthfinr";
const FIRST_YEAR = 2019; // 2019-20 係最早一份

export const TREASURY_LICENCE = {
  licence: "data.gov.hk 使用條款",
  licence_url: "https://data.gov.hk/tc/terms-and-conditions",
  source_zh: "庫務署(經資料一線通 DATA.GOV.HK 提供)",
  source_en: "Treasury, HKSAR Government, via DATA.GOV.HK",
};

const FIELD = "本月底的財政儲備";

/** 「2020年3月(臨時數字)」-> { period: "2020-03", provisional: true } */
export function parseMonth(text) {
  const match = /^(\d{4})年(\d{1,2})月\s*(?:[(（](.+?)[)）])?\s*$/u.exec(String(text).trim());
  if (!match) throw new Error(`認唔到月份「${text}」`);
  return {
    period: `${match[1]}-${String(match[2]).padStart(2, "0")}`,
    provisional: /臨時/.test(match[3] ?? ""),
  };
}

/** 而家係邊個財政年度?4 月起計。 */
function currentFiscalYearStart(now = new Date()) {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() + 1 >= 4 ? year : year - 1;
}

function fiscalLabel(start) {
  return `${start}-${String(start + 1).slice(-2)}`;
}

export async function loadFiscalReserves(spec) {
  const series = [];
  const monthlyExpenditure = []; // 「本月的綜合開支」,畀「儲備夠用幾多個月」錨點用
  const provisional = [];
  const files = [];
  let latestFetchedAt = null;

  for (let start = FIRST_YEAR; start <= currentFiscalYearStart(); start++) {
    const label = fiscalLabel(start);
    const url = `${BASE}/press_release_${label}_c.json`;
    let body;
    try {
      ({ body, fetchedAt: latestFetchedAt } = await fetchJson(url, {
        retries: 2,
        assertShape(json) {
          if (!Array.isArray(json)) throw new Error("唔係陣列");
          if (json.length > 0 && !(FIELD in json[0])) {
            throw new Error(`第一行冇「${FIELD}」欄,有嘅係:${Object.keys(json[0]).slice(0, 6).join("、")}…`);
          }
        },
      }));
    } catch (error) {
      // 新財政年度頭一兩個月未出檔係正常嘅;但已知存在嘅年度攞唔到就要大聲講。
      if (start >= currentFiscalYearStart()) {
        process.stderr.write(`[hk-data-monitor] 財政儲備:${label} 未有檔(${error.message}),跳過\n`);
        continue;
      }
      throw new Error(`財政儲備:${label} 攞唔到 —— ${error.message}`, { cause: error });
    }
    await politePause();
    files.push(label);

    for (const row of body) {
      const { period, provisional: isProvisional } = parseMonth(row["月份"]);
      const millions = toNumber(row[FIELD]);
      // 百萬元 -> 港元,notes_zh 會寫明換算過。
      series.push({ period, value: millions === null ? null : millions * 1_000_000 });
      const spent = toNumber(row["本月的綜合開支"]);
      // 開支喺原檔係負數(支出),呢度取絕對值
      if (spent !== null) monthlyExpenditure.push({ period, value: Math.abs(spent) * 1_000_000 });
      if (isProvisional) provisional.push(period);
    }
  }

  if (series.length === 0) throw new Error("財政儲備:一份檔都攞唔到");

  series.sort((a, b) => a.period.localeCompare(b.period));

  // 同一個月唔應該出現兩次(年度檔之間唔應該重疊)
  const seen = new Set();
  for (const point of series) {
    if (seen.has(point.period)) throw new Error(`財政儲備:${point.period} 出現多過一次,年度檔重疊咗`);
    seen.add(point.period);
  }

  const latest = [...series].reverse().find((p) => p.value !== null);
  monthlyExpenditure.sort((a, b) => a.period.localeCompare(b.period));
  const extras = { monthlyExpenditure, population: await readPopulationSeries() };

  return buildIndicator({
    indicator_id: "fiscal_reserves",
    name_zh: spec.name_zh,
    name_en: spec.name_en,
    unit_zh: "港元",
    unit_en: "HK$",
    unit_short_zh: "元",
    unit_source_zh: "百萬元",
    value_digits: 0,

    source_zh: TREASURY_LICENCE.source_zh,
    source_en: TREASURY_LICENCE.source_en,
    source_url: spec.dataset_url,
    source_note_zh: `庫務署「政府財務狀況」新聞稿數據檔,${files[0]} 至 ${files.at(-1)} 共 ${files.length} 個財政年度`,
    licence: TREASURY_LICENCE.licence,
    licence_url: TREASURY_LICENCE.licence_url,

    // 數據截至:最新一個有數嘅月份嘅月底。
    updated_at: latest ? lastDayOfMonth(latest.period) : null,
    fetched_at: latestFetchedAt,
    frequency: "monthly",
    acquisition: "api",

    category: spec.category,
    question_zh: spec.question_zh,
    notes_zh:
      "原始檔用「百萬元」做單位,呢度已經乘返一百萬換算成「港元」。" +
      "「財政儲備」即係政府嘅存款,唔係一年嘅收入;佢每個月都會因為收支而上落。" +
      (provisional.length ? `以下月份係臨時數字,之後會修訂:${provisional.join("、")}。` : "") +
      (spec.notes_zh ?? ""),
    chart: spec.chart ?? { type: "line", y_zero: true },
    anchors: spec.anchors ? spec.anchors(series, extras) : [],
    period_notes: Object.fromEntries(provisional.map((p) => [p, "臨時數字"])),

    series,
  });
}

function lastDayOfMonth(period) {
  const [year, month] = period.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)); // 下個月嘅第 0 日 = 本月最後一日
  return last.toISOString().slice(0, 10);
}
