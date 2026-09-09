// 統計處轉載金管局的所有貨幣供應：一次查 M1、M2、M3，保留季度末存量。
// 三者互相包含，絕不可當作分項相加。金管局月度 API 探路未能取得完整回應，
// 本版明文使用可核實的統計處季末序列，唔把季末數字填成月度。
import { CENSTATD_LICENCE, queryCenstatd, pickFrequency, formatPeriod, requiredCvDimensions, tableInfo, toValue } from "./censtatd.js";
import { buildIndicator } from "./schema.js";
import { anchorVersusYear } from "../../components/anchor.js";

export const MONEY_CATEGORIES = ["M1", "M2", "M3"];
export const MONEY_INDICATORS = { money_supply: { table: "340-45011", period_start: "199704" } };
const PRESENTATION = "Raw_M_hkd_d";
const HKMA_TERMS = "https://www.hkma.gov.hk/chi/other-information/terms-and-conditions-of-use/";

export function moneyMillionsToDollars(value) {
  return value === null ? null : value * 1_000_000;
}

function sourceValue(row) {
  if (row.freq !== "Q" || !/^\d{4}(03|06|09|12)$/.test(row.period) || row.period < "199706") throw new Error("貨幣供應：只接受 1997 年第二季起的季末資料");
  if (!MONEY_CATEGORIES.includes(row.sv) || row.svDesc !== "百萬港元" || Object.hasOwn(row, "CURRENCY")) throw new Error("貨幣供應：原表變項、所有貨幣口徑或百萬港元單位改變");
  if (typeof row.sd_value !== "string" || !row.sd_value.split(",").map((flag) => flag.trim()).every((flag) => ["", "r", "p", "-", "N.A.", "n.y.a."].includes(flag))) throw new Error("貨幣供應：未知資料狀態標記");
  const missing = row.figure === "" || row.figure === null;
  const numeric = typeof row.figure === "number" || (typeof row.figure === "string" && /^(?:0|[1-9]\d*)$/.test(row.figure));
  if (!missing && (!numeric || !Number.isSafeInteger(Number(row.figure)) || Number(row.figure) < 0)) throw new Error("貨幣供應：數值必須是非負整數百萬元或缺值");
  const value = toValue(row);
  if (value !== null && !Number.isSafeInteger(value * 1_000_000)) throw new Error("貨幣供應：港元換算超出精確整數範圍");
  return value;
}

function verifyMeta(meta) {
  if (meta?.labels?.tb_title !== "貨幣供應（所有貨幣）" || !meta.labels.tb_src?.includes("香港金融管理局") || !meta.labels.tb_fn?.includes("數字為期末數字")) throw new Error("貨幣供應：來源、所有貨幣表題或期末口徑改變");
  if (requiredCvDimensions(meta).length !== 0 || Object.keys(meta.labels.sv_list ?? {}).length !== 3) throw new Error("貨幣供應：來源新增未處理的維度或變項");
  for (const category of MONEY_CATEGORIES) {
    const variable = meta.labels.sv_list?.[category], unit = variable?.sp_list?.[PRESENTATION];
    if (variable?.def_stat_desc !== `貨幣供應量${category}` || unit?.def_stat_pres_desc !== "百萬港元" || unit?.def_unit !== "HK$" || unit?.def_decimals !== "0" || unit?.def_unit_mult !== "6") throw new Error("貨幣供應：M1／M2／M3 定義、單位、精度或倍率改變");
  }
}

/** 驗來源完整性及最終輸出逐項對返原表，唔單靠 M1 ≤ M2 ≤ M3。 */
export function verifyMoneySupply(rows, series, meta) {
  verifyMeta(meta);
  const periods = new Map();
  for (const row of rows) {
    const value = sourceValue(row);
    if (!periods.has(row.period)) periods.set(row.period, new Map());
    const values = periods.get(row.period);
    if (values.has(row.sv)) throw new Error("貨幣供應：來源季末與變項重複");
    values.set(row.sv, value);
  }
  const ordered = [...periods.keys()].sort();
  if (ordered[0] !== "199706") throw new Error("貨幣供應：1997 年第二季起點遺失");
  const quarter = (period) => Number(period.slice(0, 4)) * 4 + Number(period.slice(4)) / 3;
  for (const [index, period] of ordered.entries()) {
    if (index > 0 && quarter(period) !== quarter(ordered[index - 1]) + 1) throw new Error("貨幣供應：中間季度消失");
    const values = periods.get(period);
    if (MONEY_CATEGORIES.some((category) => !values.has(category))) throw new Error("貨幣供應：每季必須齊 M1、M2、M3，包括缺值");
    const [m1, m2, m3] = MONEY_CATEGORIES.map((category) => values.get(category));
    if ((m1 !== null && m2 !== null && m1 > m2) || (m2 !== null && m3 !== null && m2 > m3) || (m1 !== null && m3 !== null && m1 > m3)) throw new Error("貨幣供應：互相包含的 M1 ≤ M2 ≤ M3 關係不成立");
  }
  if (!Array.isArray(series) || series.length !== ordered.length * 3) throw new Error("貨幣供應：最終數列缺季、缺類或重複");
  const seen = new Set();
  for (const point of series) {
    const matched = /^(\d{4})-Q([1-4])$/.exec(point.period);
    const period = matched ? `${matched[1]}${String(Number(matched[2]) * 3).padStart(2, "0")}` : "";
    const values = periods.get(period), key = `${point.period}|${point.category}`;
    if (!values?.has(point.category) || seen.has(key)) throw new Error("貨幣供應：最終季度或 M1／M2／M3 標籤錯配");
    seen.add(key);
    const source = values.get(point.category);
    // 獨立寫出來源百萬元 → 港元；唔調用被驗的 transform，才能捉錯倍率。
    if (point.value !== (source === null ? null : source * 1_000_000)) throw new Error("貨幣供應：最終值唔等於原表指定 M1／M2／M3，可能錯倍率或缺值填零");
  }
  if (!series.some((point) => point.value !== null)) throw new Error("貨幣供應：整條數列都缺值");
}

export function moneySupplyAnchors(series) {
  const selected = series.filter((point) => point.category === "M3");
  const latest = selected.at(-1);
  if (!latest || latest.value === null) return [];
  const previous = `${Number(latest.period.slice(0, 4)) - 1}${latest.period.slice(4)}`;
  const anchor = anchorVersusYear(selected, previous, { label: "M3，去年同季" });
  return anchor ? [{ ...anchor, id: `m3-${anchor.id}`, text_zh: `M3：${anchor.text_zh}` }] : [];
}

export async function loadMoneyIndicator(id) {
  const spec = MONEY_INDICATORS[id];
  if (!spec) throw new Error(`貨幣指標 ${id} 唔喺登記冊`);
  const { dataSet, meta } = await queryCenstatd({
    id: spec.table, sv: Object.fromEntries(MONEY_CATEGORIES.map((category) => [category, [PRESENTATION]])),
    cv: {}, period: { start: spec.period_start },
  });
  const rows = pickFrequency(dataSet, "Q");
  const series = rows.map((row) => ({ period: formatPeriod("Q", row.period), category: row.sv, value: moneyMillionsToDollars(toValue(row)) }))
    .sort((a, b) => a.period.localeCompare(b.period) || a.category.localeCompare(b.category));
  verifyMoneySupply(rows, series, meta);
  const info = tableInfo(meta), periodNotes = {};
  for (const row of rows) {
    if (row.sd_value.trim()) {
      const period = formatPeriod("Q", row.period);
      periodNotes[period] = [periodNotes[period], `${row.sv} 原表狀態：${row.sd_value}`].filter(Boolean).join("；");
    }
  }
  return buildIndicator({
    indicator_id: id, name_zh: "貨幣供應 M1、M2、M3（所有貨幣）", name_en: "Money supply M1, M2 and M3, all currencies",
    unit_zh: "港元", unit_en: "HKD", unit_short_zh: "港元", unit_source_zh: "百萬港元", value_digits: 0,
    source_zh: "香港金融管理局（經政府統計處網站轉載）", source_en: "Hong Kong Monetary Authority, via Census and Statistics Department",
    source_url: `https://www.censtatd.gov.hk/tc/web_table.html?id=${spec.table}`,
    source_note_zh: `原始統計及知識產權擁有人：香港金融管理局；轉載來源：政府統計處網站表 ${spec.table}。本站只把原值由百萬港元乘 1,000,000 換成港元，並選取季末數據。金管局使用條款：${HKMA_TERMS}`,
    licence: `${CENSTATD_LICENCE.licence}；金管局《使用條款及條件》`, licence_url: HKMA_TERMS,
    updated_at: info.lastModified, fetched_at: new Date().toISOString(), frequency: "quarterly", acquisition: "api",
    category: "貨幣與股市", question_zh: "M1、M2、M3 點樣逐層包含？金融體系的貨幣存量點變？",
    basis_zh: "所有貨幣的 M1、M2、M3，以港元表示，未經季節性調整的季末存量；唔係只有港元貨幣，亦唔係一季累計流量",
    notes_zh: "M1 包括市民持有的法定紙幣及硬幣，以及持牌銀行的客戶活期存款。M2 包括 M1，再加持牌銀行的客戶儲蓄及定期存款，以及持牌銀行發行、由非認可機構持有的可轉讓存款證。M3 包括 M2，再加有限制牌照銀行及接受存款公司的客戶存款，以及這兩類機構發行、由非認可機構持有的可轉讓存款證。三者互相包含，唔可以相加、堆疊或當成三份獨立資金。" +
      "數字係金融體系的貨幣存量，唔等於政府可用財政儲備、居民淨財富或銀行可隨意借出的現金；單憑升跌亦唔能推斷股價或通脹必然點變。" +
      "本頁採用統計處提供的季度末序列，由 1997 年第二季開始，避開金管局註明 1997 年 4 月前後的序列中斷。來源會按認可機構修訂資料更新；最新月份請到金管局官方月度資料入口查閱。",
    chart: { type: "line", y_zero: true }, category_order: [...MONEY_CATEGORIES], anchors: moneySupplyAnchors(series), period_notes: periodNotes, series,
  });
}
