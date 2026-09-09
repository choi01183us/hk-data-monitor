// 地區比較只用兩份原始統計嘅共同年度，唔跨年借值或把中位數相加。
export function districtPeriods(population, income) {
  const years = (doc) => new Set(doc.series.map((r) => r.period));
  const other = years(income);
  return [...years(population)].filter((year) => other.has(year)).sort().reverse();
}

export function districtFrame(population, income, districts, period) {
  if (!districtPeriods(population, income).includes(period)) throw new Error("兩份資料冇呢個共同年度");
  if (districts.length !== 18 || new Set(districts.map((d) => d.id)).size !== 18 || new Set(districts.map((d) => d.label)).size !== 18) throw new Error("地圖必須有十八個唯一分區");
  const read = (doc, category) => {
    const rows = doc.series.filter((r) => r.period === period && r.category === category);
    if (rows.length !== 1) throw new Error(`地區資料缺少或重複：${category} ${period}`);
    const value = rows[0].value;
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error("地區數值無效");
    return value;
  };
  if (population.indicator_id !== "district_population" || population.unit_zh !== "人" || income.indicator_id !== "district_household_income" || income.unit_zh !== "港元") throw new Error("地區比較來源或單位不符");
  const national = {population: read(population, "全港"), income: read(income, "全港")};
  const rows = districts.map((district) => ({...district, population: read(population, district.label), income: read(income, district.label)}));
  return {period, rows, national};
}

export function rankDistricts(rows, measure) {
  if (!["population", "income"].includes(measure)) throw new Error("未知地區比較項目");
  return [...rows].sort((a, b) => (b[measure] ?? -Infinity) - (a[measure] ?? -Infinity) || a.id.localeCompare(b.id));
}

// 圓面積同人數成正比：10萬人半徑10；40萬人半徑20。唔把半徑當人數。
export function populationRadius(value) {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error("人口必須為非負有限數");
  return Math.sqrt(value / 100_000) * 10;
}

export function incomeBand(value) {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error("入息必須為非負有限數");
  return value < 20_000 ? 0 : value < 30_000 ? 1 : value < 40_000 ? 2 : 3;
}
