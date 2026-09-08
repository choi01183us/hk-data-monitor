// 引用功能嘅已知答案及突變。全部固定人造資料,唔讀快照、唔上網、唔寫檔。
import { citationChoices, citationChoiceLabel, createCitation, exactNumber, periodWithNote } from "../src/components/citation.js";
import { CENSTATD_INDICATORS, FISCAL_INDICATORS } from "../src/data/_lib/indicators.js";

function sample() {
  return {
    indicator_id: "public_expenditure_policy_groups",
    name_zh: "公共經常開支", unit_zh: "港元", source_zh: "測試來源",
    source_url: "https://example.gov.hk/budget.pdf", updated_at: "2026-02-25", data_version: "2026.09.1",
    basis_zh: "公共經常開支(政府、營運基金及房屋委員會)",
    period_notes: { "2025-26": "修訂預算", "2026-27": "預算" },
    series: [
      { period: "2025-26", category: "教育", value: 20 },
      { period: "2025-26", category: "房屋", value: 10 },
      { period: "2026-27", category: "教育", value: 35 },
      { period: "2026-27", category: "房屋", value: null },
      { period: "2026-27", category: "環境", value: 0 },
    ],
    totals: [{ period: "2025-26", value: 30 }, { period: "2026-27", value: 35 }],
  };
}
const point = { kind: "point", period: "2026-27", category: "教育" };
const change = { kind: "point", from: "2025-26", to: "2026-27", category: "教育" };
function errorOf(action) {
  try { action(); return null; } catch (error) { return error.message; }
}

export function testCitations(check) {
  console.log("\n[引用] 完整引用、缺數／口徑突變及算式自證");
  // 四個已知答案先行:正差、負差、零差、保留小數。未過唔信後面嘅結果。
  for (const [later, expected] of [[35, "15"], [15, "-5"], [20, "0"]]) {
    const doc = sample();
    doc.series[2].value = later;
    const text = createCitation(doc, change);
    check(`${later} − 20 = ${expected} 港元`, text.includes(`= ${expected} 港元。`), text);
  }
  check("1,234.56789 保留全部小數,唔變成 1,235", exactNumber(1234.56789) === "1,234.56789");

  const doc = sample();
  const text = createCitation(doc, point);
  check("引用包含名稱、分類、原值及單位", text.includes("公共經常開支，教育：2026-27（預算），35 港元。"), text);
  check("引用包含口徑、機構、URL、數據日期及版本", [doc.basis_zh, doc.source_zh, doc.source_url, doc.updated_at, doc.data_version].every(v => text.includes(v)), text);
  const difference = createCitation(doc, change);
  check("增減引用帶兩年原值、各自狀態及完整算式", difference.includes("2026-27（預算） 35 港元 − 2025-26（修訂預算） 20 港元 = 15 港元。"), difference);
  check("選項帶期數狀態", citationChoiceLabel(doc, point).period === "2026-27（預算）");
  check("未提供期數狀態唔擅自補實際", periodWithNote({ period_notes: {} }, "2024-25") === "2024-25");
  check("0 係有效數字可以引用", createCitation(doc, { ...point, category: "環境" }).includes("0 港元"));

  const options = citationChoices(doc);
  check("初始期數只指定選項,唔刪其他可引用年份", citationChoices(doc, { period: "2025-26" }).length === options.length);
  check("partial 只提供已填值,唔提供 null 房屋", !options.some(c => c.period === "2026-27" && c.category === "房屋"));
  const empty = { ...doc, series: doc.series.map(r => ({ ...r, value: null })), totals: undefined };
  check("全 null 骨架無引用選項", citationChoices(empty).length === 0);
  check("有 totals 才提供總額", options.some(c => c.kind === "total") && !citationChoices({ ...doc, totals: undefined }).some(c => c.kind === "total"));
  check("總額直接引用 doc.totals,唔把分類自行相加", createCitation(doc, { kind: "total", category: null, period: "2026-27" }).includes("總額：2026-27（預算），35 港元"));
  check("partial 增減只提供兩年都有值嘅分類", !citationChoices(doc, { comparison: change }).some(c => c.category === "房屋"));
  check("傳入假 value 唔會覆蓋原值", createCitation(doc, { ...point, value: 999 }).includes("35 港元"));

  const reject = (name, action, fragment) => {
    const error = errorOf(action);
    check(name, error !== null && (!fragment || error.includes(fragment)), error ?? "冇攔截");
  };
  for (const field of ["name_zh", "unit_zh", "source_zh", "source_url", "updated_at", "data_version"]) {
    reject(`突變:缺少 ${field} 唔產生不完整引用`, () => createCitation({ ...doc, [field]: undefined }, point), "引用缺少");
  }
  reject("突變:非 HTTPS 來源被攔", () => createCitation({ ...doc, source_url: "javascript:alert(1)" }, point), "HTTPS");
  reject("突變:來源網址只有相對路徑被攔", () => createCitation({ ...doc, source_url: "/budget.pdf" }, point), "網址");
  reject("突變:缺值唔可作零引用", () => createCitation(doc, { ...point, category: "房屋" }), "唯一有效數字");
  reject("突變:不存在嘅分類被攔", () => createCitation(doc, { ...point, category: "虛構" }), "唯一有效數字");
  reject("突變:不存在嘅期數唔借最近一年", () => createCitation(doc, { ...point, period: "2027-28" }), "唯一有效數字");
  reject("突變:引用初始期數不存在唔猜其他年份", () => citationChoices(doc, { period: "2027-28" }), "所選期數");
  reject("突變:指定期數全部 null 唔改用較早年份", () => citationChoices({ ...doc, totals: undefined, series: doc.series.map(row => row.period === "2026-27" ? { ...row, value: null } : row) }, { period: "2026-27" }), "所選期數");
  check("比較模式由 comparison 控制,唔被 period 選項改寫", citationChoices(doc, { comparison: change, period: "2027-28" }).every(choice => choice.from === "2025-26" && choice.to === "2026-27"));
  reject("突變:冇 totals 唔可自行冒充總額", () => createCitation({ ...doc, totals: undefined }, { kind: "total", category: null, period: "2026-27" }), "唯一有效數字");
  const duplicate = sample(); duplicate.series.push({ ...duplicate.series[2] });
  reject("突變:重複同年同分類數字被攔", () => createCitation(duplicate, point), "唯一有效數字");
  const badUnit = sample(); badUnit.series[2].unit_zh = "百萬元";
  reject("突變:行內單位同指標單位不同被攔", () => createCitation(badUnit, point), "單位");
  reject("突變:期數狀態變物件被攔", () => createCitation({ ...doc, period_notes: { "2026-27": {} } }, point), "期數狀態");
  for (const [from, to] of [["2026-27", "2026-27"], ["2026-27", "2025-26"], ["2024-25", "2026-27"]]) {
    reject(`突變:錯誤比較 ${from} → ${to} 被攔`, () => createCitation(doc, { ...change, from, to }));
  }
  reject("突變:政府口徑唔可混入公共開支比較", () => createCitation({ ...doc, indicator_id: "govt_expenditure" }, change), "公共經常開支");
  reject("突變:百分比唔可冒充港元名義增減", () => createCitation({ ...doc, unit_zh: "%" }, change), "港元");
  check("建立引用唔會改原始文件", JSON.stringify(doc) === JSON.stringify(sample()));

  // 用真正 registry 口徑,固定人造數值。檢查語義限制有帶入引用,唔係淨係重複指標名稱。
  const hasBasis = (spec) => typeof spec.basis_zh === "string" && spec.basis_zh.trim().length > 0;
  const specs = { ...CENSTATD_INDICATORS, ...FISCAL_INDICATORS };
  check("所有 API 指標都提供穩定口徑文字", Object.keys(specs).length > 0 && Object.values(specs).every(hasBasis));
  check("突變:刪一個 registry 口徑會被完整性斷言捉到", !Object.values({ ...specs, gdp: { ...specs.gdp, basis_zh: undefined } }).every(hasBasis));
  for (const [id, category, fragments] of [
    ["gdp", null, ["當時市價", "未扣除通脹"]],
    ["unemployment", "15–24 歲青年", ["15–24", "青年勞動人口", "全港勞動人口"]],
  ]) {
    const spec = CENSTATD_INDICATORS[id];
    const fixture = {
      ...sample(), ...spec, indicator_id: id,
      series: [{ period: "2025", ...(category ? { category } : {}), value: 10 }],
      totals: undefined, period_notes: undefined,
    };
    const selection = { kind: "point", period: "2025", category };
    const includesBasis = (quote) => fragments.every(fragment => quote.includes(fragment));
    check(`${id}: 真實 registry 口徑進入引用`, includesBasis(createCitation(fixture, selection)));
    check(`${id}: 刪 basis_zh 後語義斷言捉到缺口`, !includesBasis(createCitation({ ...fixture, basis_zh: undefined }, selection)));
  }
}
