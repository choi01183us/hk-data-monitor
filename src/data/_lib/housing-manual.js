// 三個房屋局平均數並非可加總分類；不驗大小關係，亦不複製每季數值作假錨點。
const CATEGORIES = Object.freeze([
  "綜合輪候時間(含簡約公屋)", "平均輪候時間(只計傳統公屋)", "長者一人申請者平均輪候時間",
]);
const sameOrder = (values) => Array.isArray(values) && values.length === CATEGORIES.length &&
  values.every((value, index) => value === CATEGORIES[index]);
function quarterEnd(period) {
  if (typeof period !== "string" || !/^\d{4}-Q[1-4]$/.test(period)) throw new Error("公屋抄數：period 必須是 YYYY-Q1 至 YYYY-Q4");
  return `${period.slice(0, 4)}-${["03-31", "06-30", "09-30", "12-31"][Number(period.at(-1)) - 1]}`;
}

/** 只驗可確定的單位、季度和類別；值的正確性仍須逐段核對官方原頁。 */
export function verifyHousingManual(fields) {
  if (fields?.indicator_id !== "phr_waiting_time" || fields.acquisition !== "manual" || fields.frequency !== "quarterly") throw new Error("公屋抄數：必須是 quarterly manual phr_waiting_time");
  if (fields.source_value_multiplier !== 1 || fields.unit_zh !== "年" || fields.unit_en !== "years" || fields.value_digits !== 1) throw new Error("公屋抄數：單位必須是年，倍率1，原頁一位小數");
  if (!sameOrder(fields.category_order) || !Array.isArray(fields.series) || fields.series.length === 0) throw new Error("公屋抄數：必須保留 CWT、傳統公屋 AWT、長者一人三類");
  const periods = new Map();
  let previous = "";
  for (const point of fields.series) {
    quarterEnd(point?.period);
    if (point.period < previous) throw new Error("公屋抄數：季度必須順序排列");
    previous = point.period;
    if (point.value !== null && (typeof point.value !== "number" || !Number.isFinite(point.value) || point.value < 0 || Math.round(point.value * 10) / 10 !== point.value)) throw new Error("公屋抄數：值必須是非負一位小數或 null，唔接受字串／缺值變零");
    if (!periods.has(point.period)) periods.set(point.period, []);
    periods.get(point.period).push(point.category);
  }
  if ([...periods.values()].some((categories) => !sameOrder(categories))) throw new Error("公屋抄數：每季須有完整三類，包括未填 null，唔重複或交換類別");
  if (fields.updated_at !== quarterEnd(previous)) throw new Error("公屋抄數：updated_at 必須是最後一期季度末，唔係抄數日");
}
