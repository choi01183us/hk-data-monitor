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
