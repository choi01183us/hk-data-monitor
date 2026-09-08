// 純函式:只引用傳入指標嘅已知值,唔抓數、唔儲存、唔猜缺少嘅期數或總額。
// 同時供前端同 Node 自證用;唔需要 DOM 或 npm 套件。

/** 保留 Number 原值,只加千位逗號,唔按顯示位數四捨五入。 */
export function exactNumber(value) {
  if (!Number.isFinite(value)) throw new Error("引用數值必須係有效數字,未填值唔係零");
  const [whole, fraction] = String(value).split(".");
  if (/[eE]/.test(String(value))) return String(value);
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction === undefined ? "" : `.${fraction}`);
}

/** 冇提供狀態就只寫期數,唔擅自補「實際」。 */
export function periodWithNote(indicator, period) {
  if (typeof period !== "string" || !period) throw new Error("引用缺少期數");
  const note = indicator.period_notes?.[period];
  if (note !== undefined && (typeof note !== "string" || !note.trim())) {
    throw new Error(`${period}:期數狀態必須係文字`);
  }
  return note ? `${period}（${note}）` : period;
}

function availableRecords(indicator) {
  const series = Array.isArray(indicator.series) ? indicator.series : [];
  const totals = Array.isArray(indicator.totals) ? indicator.totals : [];
  return [
    ...totals.map((row) => ({ ...row, kind: "total", category: null })),
    ...series.map((row) => ({ ...row, kind: "point", category: row.category ?? null })),
  ].filter((row) => Number.isFinite(row.value));
}

function sameMeasure(left, right) {
  return left.kind === right.kind && left.category === right.category;
}

function measureLabel(selection) {
  return selection.kind === "total" ? "總額" : selection.category ?? "數值";
}

/**
 * comparison 只可指定同一份原始指標嘅兩期。例:{from:"2025-26",to:"2026-27"}。
 * 傳增減圖嘅衍生 series 會缺原期數而失敗;唔可以把差額再當成原值引用。
 */
export function citationChoices(indicator, { comparison, period } = {}) {
  const records = availableRecords(indicator);
  if (!comparison) {
    const choices = records.map(({ kind, period, category }) => ({ kind, period, category }))
      .sort((a, b) => b.period.localeCompare(a.period));
    if (period !== undefined && !choices.some((choice) => choice.period === period)) {
      throw new Error("所選期數未有有效數字可供引用,唔會改用其他期數");
    }
    return choices;
  }
  if (indicator.indicator_id !== "public_expenditure_policy_groups" || indicator.unit_zh !== "港元") {
    throw new Error("兩年名義增減引用只適用於同一公共經常開支港元指標");
  }
  const { from, to } = comparison;
  if (typeof from !== "string" || typeof to !== "string" || !from || !to || from >= to) {
    throw new Error("增減引用必須指定由較早至較後嘅兩個不同期數");
  }
  const periods = new Set((indicator.series ?? []).map((row) => row.period));
  if (!periods.has(from) || !periods.has(to)) throw new Error("增減引用指定嘅期數唔喺原始資料內");
  return records.filter((later) => later.period === to && records.some((earlier) =>
    earlier.period === from && sameMeasure(earlier, later)
  )).map(({ kind, category }) => ({ kind, category, from, to }));
}

export function citationChoiceLabel(indicator, selection) {
  const period = selection.from
    ? `${periodWithNote(indicator, selection.to)} 減 ${periodWithNote(indicator, selection.from)}`
    : periodWithNote(indicator, selection.period);
  return { period, measure: measureLabel(selection) };
}

function requireSource(indicator) {
  for (const field of ["name_zh", "unit_zh", "source_zh", "source_url", "updated_at", "data_version"]) {
    if (typeof indicator[field] !== "string" || !indicator[field].trim()) {
      throw new Error(`引用缺少 ${field},唔可以自行補資料`);
    }
  }
  let source;
  try { source = new URL(indicator.source_url); } catch { throw new Error("引用來源網址唔完整"); }
  if (source.protocol !== "https:") throw new Error("引用來源必須係 HTTPS 網址");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(indicator.updated_at)) throw new Error("引用缺少有效數據截至日期");
}

/** 選項只攜帶期數／分類;數值永遠重新由原始指標讀,唔信呼叫者傳入嘅 value。 */
export function createCitation(indicator, selection) {
  requireSource(indicator);
  if (!selection || !["point", "total"].includes(selection.kind)) throw new Error("請選擇引用數字");
  const records = availableRecords(indicator);
  const read = (period) => {
    const matches = records.filter((row) => row.period === period && sameMeasure(row, selection));
    if (matches.length !== 1) throw new Error("所選期數／分類必須有唯一有效數字,唔可以引用未填或重複數值");
    if (matches[0].unit_zh !== undefined && matches[0].unit_zh !== indicator.unit_zh) {
      throw new Error("引用數值單位同指標單位唔一致");
    }
    return matches[0].value;
  };
  const labels = citationChoiceLabel(indicator, selection);
  const description = `${indicator.name_zh}，${labels.measure}`;
  let statement;
  if (selection.from !== undefined || selection.to !== undefined) {
    // 重用選項閘,防同年、倒轉年份及不存在期數。
    citationChoices(indicator, { comparison: { from: selection.from, to: selection.to } });
    const fromValue = read(selection.from), toValue = read(selection.to);
    const change = toValue - fromValue;
    statement = `${description}：${labels.period}，名義增減 ${exactNumber(change)} ${indicator.unit_zh}。\n` +
      `算式：${periodWithNote(indicator, selection.to)} ${exactNumber(toValue)} ${indicator.unit_zh} − ` +
      `${periodWithNote(indicator, selection.from)} ${exactNumber(fromValue)} ${indicator.unit_zh} = ` +
      `${exactNumber(change)} ${indicator.unit_zh}。`;
  } else {
    statement = `${description}：${labels.period}，${exactNumber(read(selection.period))} ${indicator.unit_zh}。`;
  }
  const basis = typeof indicator.basis_zh === "string" && indicator.basis_zh.trim()
    ? indicator.basis_zh : indicator.name_zh;
  return `${statement}\n口徑：${basis}。\n來源：${indicator.source_zh}；${indicator.source_url}\n` +
    `數據截至：${indicator.updated_at}；資料版本：${indicator.data_version}。`;
}
