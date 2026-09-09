// 真係寫入臨時 src 檔案,再行同 validate/build 一樣嘅閘;唔改 repo／錄影。
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSeparatedExpenditureSources } from "./expenditure-scope-gate.mjs";

const GOVT = 'const govt = await FileAttachment("../data/govt_expenditure.json").json();';
const PUBLIC = 'const publicData = await FileAttachment("../data/public_expenditure_policy_groups.json").json();';
const fence = (code) => `\`\`\`js\n${code}\n\`\`\`\n`;
const HOME = fence(`
import { indicatorCard } from "./components/indicator-card.js";
const loaded = await Promise.all([
  FileAttachment("./data/govt_expenditure.json").json(),
  FileAttachment("./data/public_expenditure_policy_groups.json").json(),
]);
const indicators = loaded.filter((indicator) => indicator.manual_status !== "todo");
`) + "# 各自睇返口徑\n" + fence('display(html`<div class="card-grid">${indicators.map((indicator) => indicatorCard(indicator))}</div>`);');

const BRAND = fence(`
import {programmeBrand} from "./components/programme-brand.js";
const programmeLogos = {
 bgca: await FileAttachment("./assets/programme/bgca.png").url(),
 hkex: await FileAttachment("./assets/programme/hkex.png").url(),
 edb: await FileAttachment("./assets/programme/edb.png").url(),
 hkcss: await FileAttachment("./assets/programme/hkcss.png").url()
};
display(programmeBrand({logos: programmeLogos}));
`);
const NEWS_CODE = `
import {cityNews} from "./components/city-dashboard.js";
const news = await FileAttachment("./data/city_news.json").json();
display(cityNews(news, {compact: true, invalidation}));
`;
const NEWS = fence(NEWS_CODE);
const WEATHER_CODE = `
import {weatherMap} from "./components/weather-map.js";
const weather = await FileAttachment("./data/city_weather.json").json();
const weatherMapUrl = await FileAttachment("./assets/hong-kong-map.svg").url();
display(weatherMap(weather, {mapUrl: weatherMapUrl, invalidation}));
`;
const WEATHER = fence(WEATHER_CODE);

export async function testExpenditureScopeGate(check) {
  console.log("\n[R9] 政府／公共開支口徑閘 — 真實源碼突變");
  const root = await mkdtemp(join(tmpdir(), "hkdm-expenditure-scope-"));
  async function runCase(name, files, shouldFail) {
    const source = join(root, String(runCase.next++));
    for (const [file, contents] of Object.entries(files)) {
      const path = join(source, file);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, contents);
    }
    let error = null;
    try { await assertSeparatedExpenditureSources(source); } catch (caught) { error = caught; }
    check(name, shouldFail ? error?.message.includes("唔可以合圖或將總額相加") : error === null, error?.message ?? "冇攔截");
  }
  runCase.next = 0;
  try {
    const separate = {
      "indicators/govt.md": fence(`${GOVT}\ndisplay(indicatorChart(govt, 600));`) + "[公共開支](./public_expenditure_policy_groups)\n",
      "indicators/public.md": fence(`${PUBLIC}\ndisplay(indicatorChart(publicData, 600));`) + "[政府開支](./govt_expenditure)\n",
    };
    await runCase("合法:兩頁各自畫圖,互相連結口徑說明", separate, false);
    await runCase("合法:首頁兩張卡分開顯示", { ...separate, "index.md": HOME }, false);
    await runCase("合法:首頁附件清單增減、普通文案同註解可改", {
      "index.md": HOME.replace("# 各自睇返口徑", "# 更新文案").replace("const loaded", "// 新增指標\nconst loaded")
        .replace('  FileAttachment("./data/govt_expenditure.json")', '  FileAttachment("./data/gdp.json").json(),\n  FileAttachment("./data/govt_expenditure.json")'),
    }, false);
    await runCase("合法:首頁只讀四張原圖的計劃品牌格", {"index.md": HOME + BRAND}, false);
    await runCase("合法:首頁獨立新聞格配原卡片及底部四標誌", {
      "index.md": NEWS + HOME + BRAND,
      "components/city-dashboard.js": "export const cityNews = (doc) => doc.records;",
    }, false);
    await runCase("合法:獨立新聞格只改空白及註解", {
      "index.md": HOME + fence(NEWS_CODE.replace("const news", "// 與開支卡片分開\nconst news").replace("compact: true, invalidation", "compact:true,\n  invalidation")) + BRAND,
    }, false);
    await runCase("突變:新聞格傳 loaded 代替新聞被攔", {"index.md": HOME + NEWS.replace("cityNews(news,", "cityNews(loaded,") + BRAND}, true);
    await runCase("突變:新聞格把開支資料塞入 options 被攔", {"index.md": HOME + NEWS.replace("compact: true, invalidation", "compact: true, invalidation, data: loaded") + BRAND}, true);
    await runCase("突變:新聞格合併兩套開支 series 被攔", {
      "index.md": HOME + NEWS.replace("cityNews(news,", "cityNews({...news, records: loaded.flatMap(d => d.series)},") + BRAND,
    }, true);
    await runCase("突變:新聞格加入開支加總被攔", {
      "index.md": HOME + NEWS.replace("display(cityNews", "display(loaded.reduce((sum, d) => sum + d.totals[0].value, 0));\ndisplay(cityNews") + BRAND,
    }, true);
    for (const id of ["govt_expenditure", "public_expenditure_policy_groups", "city_flights"]) {
      await runCase(`突變:新聞格改讀 ${id} 附件被攔`, {"index.md": HOME + NEWS.replace("./data/city_news.json", `./data/${id}.json`) + BRAND}, true);
    }
    await runCase("突變:新聞程式混入卡片 cell 而非獨立格被攔", {
      "index.md": HOME.replace("const loaded", NEWS_CODE + "\nconst loaded") + BRAND,
    }, true);
    await runCase("突變:首頁重複新聞格被攔", {"index.md": NEWS + HOME + NEWS + BRAND}, true);
    await runCase("突變:新聞 helper 偷讀政府開支被攔", {
      "index.md": NEWS + HOME + BRAND,
      "components/city-dashboard.js": GOVT + "\nexport const cityNews = (doc) => doc.records;",
    }, true);
    await runCase("突變:新聞 helper 間接依賴偷讀公共開支被攔", {
      "index.md": NEWS + HOME + BRAND,
      "components/city-dashboard.js": 'import {newsRows} from "./news-helper.js"; export const cityNews = newsRows;',
      "components/news-helper.js": PUBLIC + "\nexport const newsRows = (doc) => doc.records;",
    }, true);
    await runCase("合法:首頁獨立天氣格連同新聞、卡片及品牌格", {
      "index.md": WEATHER + NEWS + HOME + BRAND,
      "components/weather-map.js": "export const weatherMap = (weather, options) => weather.stations;",
    }, false);
    await runCase("合法:獨立天氣格只改空白及註解", {
      "index.md": HOME + fence(WEATHER_CODE.replace("const weather =", "// 天氣資料與開支卡片分開\nconst weather =").replace("mapUrl: weatherMapUrl, invalidation", "mapUrl:weatherMapUrl,\n invalidation")) + BRAND,
    }, false);
    for (const id of ["govt_expenditure", "public_expenditure_policy_groups", "city_news"]) {
      await runCase(`突變:天氣格改讀 ${id} 附件被攔`, {
        "index.md": WEATHER.replace("./data/city_weather.json", `./data/${id}.json`) + NEWS + HOME + BRAND,
      }, true);
    }
    for (const path of ["./data/govt_expenditure.json", "./data/public_expenditure_policy_groups.json", "./assets/another-map.svg"]) {
      await runCase(`突變:天氣地圖改讀 ${path} 被攔`, {
        "index.md": HOME + WEATHER.replace("./assets/hong-kong-map.svg", path) + BRAND,
      }, true);
    }
    await runCase("突變:天氣格傳 loaded 代替天氣被攔", {
      "index.md": HOME + WEATHER.replace("weatherMap(weather,", "weatherMap(loaded,") + BRAND,
    }, true);
    await runCase("突變:天氣格把開支塞入 options 被攔", {
      "index.md": HOME + WEATHER.replace("mapUrl: weatherMapUrl, invalidation", "mapUrl: weatherMapUrl, invalidation, data: loaded") + BRAND,
    }, true);
    await runCase("突變:天氣格合併兩套開支 series 被攔", {
      "index.md": HOME + WEATHER.replace("weatherMap(weather,", "weatherMap({...weather, stations: loaded.flatMap(d => d.series)},") + BRAND,
    }, true);
    await runCase("突變:天氣格加入開支加總被攔", {
      "index.md": HOME + WEATHER.replace("display(weatherMap", "display(loaded.reduce((sum, d) => sum + d.totals[0].value, 0));\ndisplay(weatherMap") + BRAND,
    }, true);
    await runCase("突變:首頁重複天氣格被攔", {
      "index.md": WEATHER + NEWS + HOME + WEATHER + BRAND,
    }, true);
    await runCase("突變:天氣程式混入卡片 cell 被攔", {
      "index.md": HOME.replace("const loaded", WEATHER_CODE + "\nconst loaded") + BRAND,
    }, true);
    await runCase("突變:天氣程式混入新聞 cell 被攔", {
      "index.md": HOME + fence(NEWS_CODE + WEATHER_CODE) + BRAND,
    }, true);
    await runCase("突變:天氣程式拆成兩個 cell 被攔", {
      "index.md": HOME + WEATHER.replace("display(weatherMap", "```\n```js\ndisplay(weatherMap") + BRAND,
    }, true);
    await runCase("突變:天氣 helper 直接偷讀政府開支被攔", {
      "index.md": WEATHER + NEWS + HOME + BRAND,
      "components/weather-map.js": GOVT + "\nexport const weatherMap = (weather) => weather.stations;",
    }, true);
    await runCase("突變:天氣 helper 間接偷讀公共開支被攔", {
      "index.md": WEATHER + NEWS + HOME + BRAND,
      "components/weather-map.js": 'import {weatherRows} from "./weather-helper.js"; export const weatherMap = weatherRows;',
      "components/weather-helper.js": PUBLIC + "\nexport const weatherRows = (weather) => weather.stations;",
    }, true);
    await runCase("突變:品牌格偷傳兩個開支數據被攔", {"index.md": HOME + BRAND.replace("logos: programmeLogos", "logos: programmeLogos, data: loaded")}, true);
    await runCase("突變:品牌格加入加總被攔", {"index.md": HOME + BRAND.replace("const programmeLogos", "display(loaded.reduce((sum,d)=>sum+d.totals[0].value,0)); const programmeLogos")}, true);
    await runCase("突變:品牌格改圖路徑為數據被攔", {"index.md": HOME + BRAND.replace("./assets/programme/hkex.png", "./data/govt_expenditure.json")}, true);
    await runCase("突變:品牌helper額外讀取開支被攔", {"index.md": HOME + BRAND, "components/programme-brand.js": PUBLIC}, true);
    await runCase("突變:兩份 series 合併同圖被攔", {
      "indicators/mixed.md": fence(`${GOVT}\n${PUBLIC}\ndisplay(indicatorChart({...govt, series: [...govt.series, ...publicData.series]}, 600));`),
    }, true);
    await runCase("突變:兩份總額相加被攔", {
      "indicators/mixed.md": fence(`${GOVT}\n${PUBLIC}\ndisplay(govt.totals.at(-1).value + publicData.totals.at(-1).value);`),
    }, true);
    await runCase("突變:首頁 loaded 加總被攔", {
      "index.md": HOME + fence("display(loaded.reduce((sum, d) => sum + d.totals.at(-1).value, 0));"),
    }, true);
    await runCase("突變:首頁 loaded 合圖被攔", {
      "index.md": HOME + fence("display(indicatorChart({series: loaded.flatMap(d => d.series)}, 600));"),
    }, true);
    await runCase("突變:首頁行內運算被攔", {
      "index.md": HOME + "${loaded[0].totals[0].value + loaded[1].totals[0].value}\n",
    }, true);
    await runCase("突變:首頁另一種程式 fence 加總被攔", {
      "index.md": HOME + "~~~js\ndisplay(loaded[0].totals[0].value + loaded[1].totals[0].value);\n~~~\n",
    }, true);
    await runCase("突變:經 import helper 帶入另一套數據被攔", {
      "indicators/mixed.md": fence(`${GOVT}\nimport { publicData } from "../components/public.js";\ndisplay(govt.totals[0].value + publicData.totals[0].value);`),
      "components/public.js": `${PUBLIC}\nexport { publicData };`,
    }, true);
    await runCase("突變:直接 import 兩個 JSON 被攔", {
      "indicators/mixed.md": fence('import govt from "../data/govt_expenditure.json";\nimport publicData from "../data/public_expenditure_policy_groups.json";\ndisplay(govt.totals[0].value + publicData.totals[0].value);'),
    }, true);
    await runCase("突變:首頁卡片 helper 偷讀開支資料被攔", {
      "index.md": HOME,
      "components/indicator-card.js": `${PUBLIC}\nexport const indicatorCard = (indicator) => indicator.totals[0].value + publicData.totals[0].value;`,
    }, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
