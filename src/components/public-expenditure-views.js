// 同一公共口徑嘅年度金額／名義增減。唔接其他開支指標,亦唔把唔同年度相加。
export function publicExpenditureViews(indicator) {
  if (indicator.indicator_id !== "public_expenditure_policy_groups") {
    throw new Error("年度比較只接受公共經常開支十個政策組別");
  }
  const order = indicator.category_order;
  const periods = [...new Set(indicator.series.map((p) => p.period))].sort();
  const complete = periods.filter((period) => {
    const rows = indicator.series.filter((p) => p.period === period);
    return rows.length === order.length && order.every((category) =>
      rows.filter((p) => p.category === category && Number.isFinite(p.value)).length === 1);
  });
  const label = (period) => `${period} ${indicator.period_notes?.[period] ?? ""}`.trim();
  const views = [];
  // 預設由最近兩個相鄰年度開始,唔跨過一個未填齊嘅年度。
  for (let i = periods.length - 1; i > 0; i--) {
    const from = periods[i - 1], to = periods[i];
    if (!complete.includes(from) || !complete.includes(to)) continue;
    const earlier = indicator.series.filter((p) => p.period === from);
    const later = indicator.series.filter((p) => p.period === to);
    views.push({
      label: `${label(to)} 相比 ${label(from)}：增減金額`,
      comparison: { from, to },
      indicator: {
        ...indicator,
        chart: { ...indicator.chart, period: to, label_zh: `名義增減(港元)：${to} 減 ${from}` },
        series: order.map((category) => ({
          period: to, category,
          value: later.find((p) => p.category === category).value - earlier.find((p) => p.category === category).value,
        })),
      },
    });
  }
  for (const period of [...complete].reverse()) {
    views.push({
      label: `${label(period)}：開支金額`,
      indicator: { ...indicator, chart: { ...indicator.chart, period, label_zh: `港元(${label(period)})` } },
    });
  }
  return views;
}
