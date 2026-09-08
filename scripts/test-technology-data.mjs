// 新科技指標：先驗獨立已知答案，再突變最終切片、單位及真正 loader 源碼。
// 測試只讀錄影／快照；臨時源碼副本放系統暫存目錄。
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CENSTATD_INDICATORS, verifyRdExpenditure, verifyHouseholdInternet } from "../src/data/_lib/indicators.js";

const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const rdRows = (total = 6, parts = [1, 2, 3]) => [total, ...parts].map((figure, i) => ({
  period: "2024", freq: "Y", sv: "GRD_EXP", svDesc: "百萬港元",
  SECTOR: ["", "1", "2", "3"][i], figure, sd_value: "",
}));
const internetRows = (figure = 75) => [{
  period: "2025", freq: "Y", sv: "IT_HH", svDesc: "比率（%）",
  TYPE_IT_USAGE: "With_Internet_as", figure, sd_value: "",
}];

export async function testTechnologyData(check) {
  console.log("\n[科技資料] 總額、換算、住戶分母 — 已知答案與突變");
  const rd = CENSTATD_INDICATORS.rd_expenditure;
  const internet = CENSTATD_INDICATORS.household_internet;
  // 四個不用真實最新數值作假設嘅單位換算答案。
  for (const [millions, dollars] of [[0, 0], [1, 1000000], [1.5, 1500000], [35771.9, 35771900000]]) {
    check(`${millions} 百萬港元 = ${dollars} 港元`, rd.transform(millions) === dollars);
  }
  check("研發缺值保持 null", rd.transform(null) === null);
  check("三類 1 + 2 + 3 = 6 百萬，最終數列係 600 萬", !throws(() => verifyRdExpenditure(rdRows(), [{ period: "2024", value: 6000000 }])));
  check("研發零總額係有效值", !throws(() => verifyRdExpenditure(rdRows(0, [0, 0, 0]), [{ period: "2024", value: 0 }])));
  check("來源 0.2 百萬最大四捨五入差可接受", !throws(() => verifyRdExpenditure(rdRows(6.2), [{ period: "2024", value: 6200000 }])));
  check("來源差 0.3 百萬會嘈，門檻唔係相對百分比", throws(() => verifyRdExpenditure(rdRows(6.3), [{ period: "2024", value: 6300000 }])));
  check("大額總數差 0.3 百萬同樣會嘈", throws(() => verifyRdExpenditure(rdRows(60000.3, [10000, 20000, 30000]), [{ period: "2024", value: 60000300000 }])));
  check("錯 pin 把工商機構當總額會嘈", throws(() => verifyRdExpenditure(rdRows(), [{ period: "2024", value: 1000000 }])));
  check("錯換算乘 1000001 會嘈", throws(() => verifyRdExpenditure(rdRows(), [{ period: "2024", value: 6000006 }])));
  check("研發缺值唔可以填零", throws(() => verifyRdExpenditure(rdRows(""), [{ period: "2024", value: 0 }])));
  check("研發缺值原樣保留", !throws(() => verifyRdExpenditure(rdRows(""), [{ period: "2024", value: null }])));
  check("2018 之前嘅不同口徑會嘈", throws(() => verifyRdExpenditure(rdRows().map((r) => ({ ...r, period: "2017" })), [{ period: "2017", value: 6000000 }])));
  for (const [name, mutate] of [
    ["缺原表總額", (rows) => rows.shift()],
    ["重複總額", (rows) => rows.push({ ...rows[0] })],
    ["Total 維度消失", (rows) => { delete rows[0].SECTOR; }],
    ["缺一機構", (rows) => rows.pop()],
    ["總額單位改為千元", (rows) => { rows[0].svDesc = "千港元"; }],
    ["總額變項變成比例", (rows) => { rows[0].sv = "GRD_EXP_GDP"; }],
    ["季度冒充年度", (rows) => { rows[0].freq = "Q"; }],
    ["分項為負數", (rows) => { rows[1].figure = -1; rows[2].figure = 4; }],
  ]) {
    const rows = rdRows(); mutate(rows);
    check(`研發突變:${name}會嘈`, throws(() => verifyRdExpenditure(rows, [{ period: "2024", value: 6000000 }])));
  }

  for (const value of [0, 25, 75, 100]) {
    check(`住戶上網 ${value}% 原值保留`, !throws(() => verifyHouseholdInternet(internetRows(value), [{ period: "2025", value }])));
    const anchor = internet.anchors([{ period: "2025", value }])[0];
    check(`${value}% = 每 100 戶約 ${value} 戶`, anchor?.text_zh.includes(`約有 ${value} 戶`) && anchor.basis_zh.includes("所有住戶，唔係人口"));
  }
  check("住戶缺值保持 null", !throws(() => verifyHouseholdInternet(internetRows(""), [{ period: "2025", value: null }])));
  check("住戶缺值唔會出假錨點", internet.anchors([{ period: "2025", value: null }]).length === 0);
  for (const [name, mutate, value] of [
    ["大過 100%", (rows) => { rows[0].figure = 100.1; }, 100.1],
    ["負比例", (rows) => { rows[0].figure = -0.1; }, -0.1],
    ["千戶冒充百分比", (rows) => { rows[0].svDesc = "千戶"; }, 75],
    ["分類消失", (rows) => { delete rows[0].TYPE_IT_USAGE; }, 75],
    ["錯分類", (rows) => { rows[0].TYPE_IT_USAGE = "With_PC"; }, 75],
    ["重複來源值", (rows) => rows.push({ ...rows[0] }), 75],
    ["月度混入年度", (rows) => { rows[0].freq = "M"; }, 75],
    ["錯統計變項", (rows) => { rows[0].sv = "OTHER"; }, 75],
    ["缺值填零", (rows) => { rows[0].figure = ""; }, 0],
    ["比例再除 100", () => {}, 0.75],
  ]) {
    const rows = internetRows(); mutate(rows);
    check(`住戶突變:${name}會嘈`, throws(() => verifyHouseholdInternet(rows, [{ period: "2025", value }])));
  }

  // 真 loader 源碼突變會行相同 fixture；verify 必須攔住錯 pin 同換算。
  const original = new URL("../src/data/_lib/indicators.js", import.meta.url);
  const source = await readFile(original, "utf8");
  const temp = await mkdtemp(join(tmpdir(), "hkdm-technology-data-"));
  const previousMode = process.env.HKDM_FIXTURES;
  process.env.HKDM_FIXTURES = "replay";
  try {
    let sequence = 0;
    for (const [name, before, after] of [
      ["總額 pin 改成工商機構", 'pin: { SECTOR: "" }', 'pin: { SECTOR: "1" }'],
      ["一百萬換算寫成一百萬零一", 'Math.round(value * 1_000_000)', 'Math.round(value * 1_000_001)'],
    ]) {
      if (source.split(before).length !== 2) throw new Error(`科技突變必須精確命中一次:${before}`);
      const altered = source.replace(before, after).replace(/(\bfrom\s+["'])(\.[^"']+)(["'])/g,
        (_, prefix, specifier, suffix) => `${prefix}${new URL(specifier, original).href}${suffix}`);
      const path = join(temp, `variant-${sequence++}.mjs`);
      await writeFile(path, altered);
      const variant = await import(pathToFileURL(path).href);
      let message = "";
      try { await variant.loadCenstatdIndicator("rd_expenditure"); } catch (error) { message = error.message; }
      check(`真正 loader 源碼突變:${name} -> 最終切片守衛拒絕`, message.includes("最終數列唔等於原表 Total"));
    }
  } finally {
    if (previousMode === undefined) delete process.env.HKDM_FIXTURES;
    else process.env.HKDM_FIXTURES = previousMode;
    await rm(temp, { recursive: true, force: true });
  }
}
