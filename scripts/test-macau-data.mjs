// 澳門固定2025年度資料：官方PDF逐頁核對的答案與真實manual loader分開。
// 不抓網絡、不寫快照；合法格式仍可能錯數，所以另外比較精確值、幣別及期間。
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadManualIndicator } from "../src/data/_lib/manual.js";
import { finaliseIndicator } from "../src/data/_lib/snapshot.js";
import { validateIndicator } from "../src/data/_lib/schema.js";

// 2026-09-09由DSEC原刊第1頁目視核對；不是從待測JSON抄回預期值。
// 原GDP 4,180.4億 = 418,040,000,000 MOP，以整數保存已換算值，沒有浮點四捨五入。
const BASELINES = [
  ["macau_population", 688900, "人", "persons", "澳門總人口（年末）", "deb7e332-7a04-460e-b5f2-d36f8a410ebe/C_DEM_FR_2025_Q4.aspx", "68.89", "688,900人 ÷ 10,000 = 68.89萬人"],
  ["macau_visitors", 40069360, "人次", "visitor arrivals", "全年入境旅客", "9ff0f920-e541-4d15-bb4d-f6ead6e9aa23/C_TUR_FR_2025_Q4.aspx", "4,006.936", "40,069,360人次 ÷ 10,000 = 4,006.936萬人次"],
  ["macau_inflation", 0.33, "%", "%", "綜合消費物價平均指數按年變動", "c5de5e9d-4e6e-4166-b3ac-1dd8bca276aa/C_IPC_FR_2025_M12.aspx", "100變成100.33", "(100.33 - 100) ÷ 100 × 100 = 0.33%"],
  ["macau_gdp", 418040000000, "澳門元", "MOP", "本地生產總值（當年價格）", "2fdc5303-030e-4d73-b70a-f605ae31f889/C_PIB_FR_2025_Q4.aspx", "4,180.4", "418,040,000,000澳門元 ÷ 100,000,000 = 4,180.4億澳門元"],
];

function matchesOfficialBaseline(doc, baseline) {
  const [id, value, unit, unitEn, category, file, anchorText, formula] = baseline;
  const source = `https://www.dsec.gov.mo/getAttachment/${file}`;
  return doc.indicator_id === id && doc.acquisition === "manual" && doc.frequency === "annual" &&
    doc.updated_at === "2025-12-31" && doc.unit_zh === unit && doc.unit_en === unitEn &&
    doc.source_zh === "澳門統計暨普查局" && doc.source_url === source &&
    doc.licence_url === `${source}#page=1` && doc.licence.includes("須指出資料來源") &&
    doc.series.length === 1 && doc.series[0].period === "2025" &&
    doc.series[0].category === category && doc.series[0].value === value &&
    doc.category_order?.length === 1 && doc.category_order[0] === category &&
    doc.anchors?.length === 1 && doc.anchors[0].text_zh.includes(anchorText) &&
    doc.anchors[0].basis_zh.includes(formula);
}

async function loadAndFinalise(id, options) {
  return finaliseIndicator(await loadManualIndicator(id, options), null);
}

export async function testMacauData(check) {
  console.log("\n[澳門年度資料] 2025官方答案、幣別、期間與manual真實載入 — 自證與突變");
  check("人口換算已知答案：688900人 = 68.89萬人", 688900 / 10000 === 68.89);
  check("旅客換算已知答案：40069360人次 = 4006.936萬人次", 40069360 / 10000 === 4006.936);
  check("GDP十進制已知答案：4180.4億 = 418040000000元", 41804n * 10000000n === 418040000000n);
  check("GDP展示換算保留來源4180.4億", 418040000000 / 100000000 === 4180.4);
  // 先以百分位整數作差，精確驗100 -> 100.33的0.33%；不把二進制浮點尾差當來源精度。
  check("物價示例已知答案：100 -> 100.33升幅0.33%", (10033 - 10000) / 10000 * 100 === 0.33);
  check("證實直接浮點擴大會失真，不可用Math.round掩蓋來源換算", 4180.4 * 100000000 !== 418040000000);

  const temp = await mkdtemp(join(tmpdir(), "hkdm-macau-data-"));
  try {
    for (const baseline of BASELINES) {
      const id = baseline[0];
      const raw = JSON.parse(await readFile(new URL(`../manual/${id}.json`, import.meta.url), "utf8"));
      const doc = await loadAndFinalise(id);
      check(`${id}真正manual loader精確對官方獨立答案`, matchesOfficialBaseline(doc, baseline));
      check(`${id}格式、來源、內容hash及版本通過schema`, validateIndicator(doc).ok && /^\d{4}\.\d{2}\.\d+$/.test(doc.data_version));
      check(`${id}原檔數值為最終單位整數或百分率，倍率嚴格為1`, raw.source_value_multiplier === 1 && raw.series[0].value === baseline[1]);
      check(`${id}抄數日與資料截至日分開`, raw.transcribed_at === "2026-09-09" && doc.fetched_at === "2026-09-09T00:00:00Z");
      check(`${id}相同內容不改版本`, finaliseIndicator(await loadManualIndicator(id), doc).data_version === doc.data_version);
      const entry = await readFile(new URL(`../src/data/${id}.json.js`, import.meta.url), "utf8");
      check(`${id}正式入口使用同名manual及snapshot管道`, entry.includes(`loadManualIndicator("${id}")`) && entry.includes(`loadIndicator("${id}"`) && entry.includes("maxAgeMs: 0"));

      const mutations = [
        ["倍率變千", (f) => { f.source_value_multiplier = 1000; }],
        ["來源數值細改", (f) => { f.series[0].value += id === "macau_inflation" ? 0.01 : 1; }],
        ["錯單位冒充港元", (f) => { f.unit_zh = "港元"; f.unit_en = "HK$"; }],
        ["季度冒充全年", (f) => { f.series[0].period = "2025-Q4"; }],
        ["不同年度冒充2025", (f) => { f.series[0].period = "2024"; }],
        ["抄數日冒充資料截至日", (f) => { f.updated_at = "2026-09-09"; }],
        ["分類名冒充另一指標", (f) => { f.series[0].category = "本地居民"; }],
        ["零冒充缺數", (f) => { f.series[0].value = 0; }],
        ["缺數不能借舊值", (f) => { f.series[0].value = null; }],
        ["來源連到不同表", (f) => { f.source_url = "https://www.dsec.gov.mo/"; }],
        ["換算錨點失去算式", (f) => { f.anchors[0].basis_zh = "大概相當於"; }],
      ];
      if (id === "macau_gdp") mutations.push(["直接浮點擴大尾差不能靜靜四捨五入", (f) => { f.series[0].value = 4180.4; f.source_value_multiplier = 100000000; }]);
      for (const [name, change] of mutations) {
        const altered = structuredClone(raw); change(altered);
        await writeFile(join(temp, `${id}.json`), JSON.stringify(altered));
        const changed = await loadAndFinalise(id, { manualDir: temp });
        check(`${id} ${name}即使schema合法仍被官方答案捉到`, validateIndicator(changed).ok && !matchesOfficialBaseline(changed, baseline));
        if (name === "來源數值細改") check(`${id}真正內容改變會改hash及版本`, changed.content_hash !== doc.content_hash && finaliseIndicator(changed, doc).data_version !== doc.data_version);
      }
      const missingSource = structuredClone(raw); delete missingSource.source_url;
      await writeFile(join(temp, `${id}.json`), JSON.stringify(missingSource));
      let schemaError;
      try { await loadAndFinalise(id, { manualDir: temp }); } catch (error) { schemaError = error; }
      check(`${id}真正schema拒絕缺少來源`, schemaError?.name === "SchemaError");
    }
    const inflation = await loadAndFinalise("macau_inflation");
    check("通脹錨點明示純算式示例，非實際指數", inflation.anchors[0].basis_zh.includes("純算式示例，不是澳門的實際指數點數"));
    const gdp = await loadAndFinalise("macau_gdp");
    check("GDP精度及澳門元保留，沒有冒充港元或新增小數", Number.isSafeInteger(gdp.series[0].value) && gdp.source_note_zh.includes("0.1億澳門元") && gdp.source_note_zh.includes("4,180.4"));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
