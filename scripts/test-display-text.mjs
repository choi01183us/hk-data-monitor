import {execFile} from "node:child_process";
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import * as display from "../src/components/display-text.js";
import * as format from "../src/components/format.js";
import * as citation from "../src/components/citation.js";
import {labels} from "../src/lang/labels-en-GB.js";
import {indicatorEnglish} from "../src/lang/indicators-en-GB.js";
import {computeContentHash, validateIndicator} from "../src/data/_lib/schema.js";

const han = /\p{Script=Han}/u;
const English = (value) => typeof value === "string" && value.trim().length > 0 && !han.test(value);
const throws = (fn) => {try {fn(); return false;} catch {return true;}};
const runNode = promisify(execFile);

export async function testDisplayText(check) {
  console.log("\n[英式英文顯示] 來源口徑釘死、原值引用及量度自證");
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const setLanguage = (lang) => Object.defineProperty(globalThis, "document", {value: {documentElement: {lang}}, writable: true, configurable: true});
  const snapshots = new Map();
  // 用實際非 draft 指標頁決定涵蓋範圍；澳門保留原檔，但唔屬今次發布語言。
  for (const file of (await readdir(new URL("../src/indicators/", import.meta.url))).filter((name) => name.endsWith(".md"))) {
    const page = await readFile(new URL(`../src/indicators/${file}`, import.meta.url), "utf8");
    if (/^draft:\s*true\s*$/m.test(page)) continue;
    const id = file.slice(0, -3);
    snapshots.set(id, JSON.parse(await readFile(new URL(`../src/data/_snapshots/${id}.json`, import.meta.url), "utf8")));
  }
  const unchanged = JSON.stringify([...snapshots]);
  let mutationSequence = 0;
  async function mutate(file, from, to) {
    const url = new URL(`../src/components/${file}`, import.meta.url);
    const source = await readFile(url, "utf8");
    if (source.split(from).length !== 2) throw new Error(`英文顯示突變必須精確命中一次：${file}: ${from}`);
    const changed = source.replace(from, to).replace(/from\s+(["'])(\.\.?\/[^"']+)\1/g, (_, quote, path) => `from ${JSON.stringify(new URL(path, url).href)}`);
    return import(`data:text/javascript;base64,${Buffer.from(changed + `\n// mutation ${mutationSequence++}`).toString("base64")}`);
  }
  const detected = (oracle, module) => {try {return !oracle(module);} catch {return true;}};

  try {
    delete globalThis.document;
    check("Node 預設仍用香港中文大數", format.formatChineseMagnitude(7500000) === "750 萬" && format.formatChineseMagnitude(1230000000) === "12.3 億");
    check("Node 預設分類及口徑原樣保留", display.label("食品") === "食品" && display.indicatorText(snapshots.get("population"), "basis_zh") === snapshots.get("population").basis_zh);
    check("中文日期仍分財年同月份", format.formatPeriodZh("2000-01", {fiscal:true}) === "2000–01 年度" && format.formatPeriodZh("2000-01") === "2000 年 1 月");
    check("Node 明示英文可以讀分類及完整口徑", display.label("食品",{locale:"en-GB"}) === "Food" && English(display.indicatorText(snapshots.get("population"),"basis_zh",{locale:"en-GB"})));
    check("真正 metadata 閘喺冇 DOM 時驗全部公開快照", [...snapshots.values()].every((doc)=>!throws(()=>display.assertEnglishMetadata(doc))));
    const population = snapshots.get("population");
    const metadataPinGuard = (m) => throws(()=>m.assertEnglishMetadata({...population,basis_zh:population.basis_zh+"（已改定義）"}));
    const seriesLabelGuard = (m) => throws(()=>m.assertEnglishMetadata({...population,series:[{period:"2025",category:"未有翻譯嘅測試分類",value:1}]}));
    const orderedLabelGuard = (m) => throws(()=>m.assertEnglishMetadata({...population,category_order:["未有翻譯嘅排序分類"]}));
    const periodNoteGuard = (m) => throws(()=>m.assertEnglishMetadata({...population,period_notes:{"2025":"未有翻譯嘅期數備註"}}));
    check("真正 metadata 閘喺 Node 預設中文仍攔過期英文 pin", metadataPinGuard(display));
    for (const [name,patch] of [
      ["來源",{source_en:" "}], ["名稱",{name_en:0}], ["單位",{unit_en:null}],
      ["系列分類",{series:[{period:"2025",category:"未有翻譯嘅測試分類",value:1}]}],
      ["分類次序",{category_order:["未有翻譯嘅排序分類"]}],
      ["期數備註",{period_notes:{"2025":"未有翻譯嘅期數備註"}}]
    ]) check(`真正 metadata 閘拒絕缺譯：${name}`, throws(()=>display.assertEnglishMetadata({...population,...patch})));

    setLanguage("en-GB");
    const magnitudeOracle = (m) => [[1000,"1 thousand"],[1000000,"1 million"],[1000000000,"1 billion"],[1000000000000,"1 trillion"]].every(([number, expected]) => m.formatEnglishMagnitude(number) === expected && m.formatChineseMagnitude(number) === expected);
    check("英式大數四個已知答案：千／百萬／十億／萬億", magnitudeOracle(format));
    check("負數、小數及缺值唔變原量綱", format.formatEnglishMagnitude(-1250000000) === "-1.25 billion" && format.formatEnglishMagnitude(12.5) === "12.5" && [null,undefined,NaN,Infinity].every((value) => format.formatEnglishMagnitude(value) === "—"));
    check("明示 zh-HK 仍輸出中文量級", format.formatChineseMagnitude(7500000,{locale:"zh-HK"}) === "750 萬");
    check("英文介面明示中文仍保留原分類及口徑", display.label("食品",{locale:"zh-HK"}) === "食品" && display.indicatorText(population,"basis_zh",{locale:"zh-HK"}) === population.basis_zh);
    const periodOracle = (m) => m.formatPeriodZh("2000-01",{fiscal:true}) === "2000–01 financial year" && m.formatPeriodZh("2000-01") === "January 2000" && m.formatPeriodZh("2026-Q3") === "Q3 2026" && m.formatPeriodZh("2025") === "2025";
    check("英文期數四個已知答案，2000-01 財年唔當一月", periodOracle(format));
    check("明示中文期數唔受介面語言改變", format.formatPeriodZh("2000-01",{fiscal:true,locale:"zh-HK"}) === "2000–01 年度");
    check("日期物件保留四個期數定位", format.toDate("2000-01",{fiscal:true}).toISOString() === "2000-04-01T00:00:00.000Z" && format.toDate("2000-01").toISOString() === "2000-01-01T00:00:00.000Z" && format.toDate("2026-Q3").toISOString() === "2026-07-01T00:00:00.000Z" && format.toDate("2025").toISOString() === "2025-01-01T00:00:00.000Z");
    check("四個百分比已知答案及英文升跌方向", [[100,125,25,"increased by 25%"],[100,75,-25,"decreased by 25%"],[100,100,0,"increased by 0%"],[-100,-50,50,"increased by 50%"]].every(([from,to,change,text]) => {const result=format.formatPercentChange(from,to);return result.change===change && result.text===text;}));
    check("百分比缺值／零基準唔補算", [[0,100],[null,100],[100,undefined]].every(([from,to]) => format.formatPercentChange(from,to) === null));
    check("英式日期沿用香港時區", format.formatDateZh("2026-09-08T16:30:00Z") === "9 September 2026");
    check("相對日期三個已知答案", [["2026-09-08","yesterday"],["2026-09-10","tomorrow"],["2026-09-06","3 days ago"]].every(([date,text])=>format.formatRelativeZh(date,new Date("2026-09-09T00:00:00Z"))===text));

    check("英文口徑目錄對應全部已發布指標", JSON.stringify([...snapshots.keys()].sort()) === JSON.stringify(Object.keys(indicatorEnglish).sort()));
    for (const [id, doc] of snapshots) {
      const fields = Object.keys(doc).filter((key) => typeof doc[key] === "string" && (key.endsWith("_zh") || ["category","licence"].includes(key)));
      check(`${id}：所有標題、單位、來源、問題及口徑可用英文`, fields.every((field) => English(display.indicatorText(doc,field))));
      const values = new Set([...(doc.category_order ?? []), ...doc.series.map((row)=>row.category).filter(Boolean), ...Object.values(doc.period_notes ?? {})]);
      check(`${id}：分類及年度狀態有英文`, [...values].every((value)=>English(display.label(value))));
      const pins = Object.entries(indicatorEnglish[id] ?? {});
      check(`${id}：每個英文口徑釘死目前原中文`, pins.length > 0 && pins.every(([field,entry]) => entry.zh === doc[field] && English(entry.en)));
    }
    check("分類字典無空白或中文冒充英文", Object.entries(labels).every(([zh,en]) => zh.trim() && English(en)));
    check("所有名稱採用既有英文，authorised 只改串法", display.indicatorText(snapshots.get("banking_institutions"),"name_zh") === "Number of authorised institutions");
    check("公司與認可機構數目的短單位分開", display.indicatorText(snapshots.get("hkex_listings"),"unit_short_zh") === "companies" && display.indicatorText(snapshots.get("banking_institutions"),"unit_short_zh") === "institutions");
    check("未知 ASCII 標記、null 及空字串原樣保留", display.label("2026-Q3") === "2026-Q3" && display.label(null) === null && display.label("") === "");

    const unknownLabel = (m) => throws(()=>m.label("未有翻譯嘅測試分類"));
    const missingMetadata = (m) => throws(()=>m.indicatorText({...population,indicator_id:"untranslated_fixture"},"basis_zh"));
    const outdatedMetadata = (m) => throws(()=>m.indicatorText({...population,basis_zh:population.basis_zh+"（已改定義）"},"basis_zh"));
    check("未知中文分類硬失敗", unknownLabel(display));
    check("缺少英文口徑硬失敗", missingMetadata(display));
    check("中文口徑改動而翻譯未更新時硬失敗", outdatedMetadata(display));
    const oldEntry = indicatorEnglish.population.basis_zh;
    const missingEnglishEntry = (m) => {
      try {
        return ["", " ", undefined, null, 7].every((en) => {
          indicatorEnglish.population.basis_zh = {...oldEntry,en};
          return throws(()=>m.indicatorText(population,"basis_zh")) && throws(()=>m.assertEnglishMetadata(population));
        });
      } finally {indicatorEnglish.population.basis_zh=oldEntry;}
    };
    try {
      for (const missing of ["", " ", undefined, null]) {
        indicatorEnglish.population.basis_zh = {...oldEntry,en:missing};
        check(`匹配原文但英文缺失亦硬失敗：${String(missing)}`, throws(()=>display.indicatorText(population,"basis_zh")));
      }
    } finally {indicatorEnglish.population.basis_zh=oldEntry;}
    check("顯示與真正 metadata 閘同時拒絕五種無效英文", missingEnglishEntry(display));
    const oldFood = labels["食品"];
    const missingEnglishLabel = (m) => {
      try {
        return ["", " ", undefined, null, 7].every((en) => {
          labels["食品"]=en;
          return throws(()=>m.label("食品")) && throws(()=>m.assertEnglishMetadata({...population,series:[{period:"2025",category:"食品",value:1}]}));
        });
      } finally {labels["食品"]=oldFood;}
    };
    check("顯示與真正 metadata 閘同時拒絕五種無效分類翻譯", missingEnglishLabel(display));
    const directAnchor = {id:"qa",text_zh:"原始中文",basis_zh:"原算式",text_en:"Authored comparison",basis_en:"100 + 25 = 125"};
    check("動態錨點使用同次計算提供嘅英文", display.anchorText(population,directAnchor,"text_zh") === "Authored comparison" && display.anchorText(population,directAnchor,"basis_zh") === "100 + 25 = 125");
    const missingAnchor = (m) => throws(()=>m.anchorText(population,{id:"qa",text_zh:"只有中文"},"text_zh")) && throws(()=>m.anchorText(population,{...directAnchor,text_en:" "},"text_zh"));
    check("動態錨點缺英文唔靜靜回中文", missingAnchor(display));

    // Exercise the JSON embedded by postbuild, using exact original anchor pins.
    const canonicalAnchor = {id:"qa",text_zh:"原始中文",basis_zh:"原算式"};
    const paired = {population:{qa:directAnchor}};
    function setPayload(value) {
      const node = {textContent:JSON.stringify(value)};
      document.getElementById = (id) => id === "hkdm-english-anchors" ? node : null;
      return node;
    }
    setPayload(paired);
    check("頁面 JSON 用原中文 pin 配對英文文字及算式", display.anchorText(population,canonicalAnchor,"text_zh") === directAnchor.text_en && display.anchorText(population,canonicalAnchor,"basis_zh") === directAnchor.basis_en);
    const textPin = (m) => {setPayload(paired);return throws(()=>m.anchorText(population,{...canonicalAnchor,text_zh:"另一個原值"},"text_zh"));};
    const basisPin = (m) => {setPayload(paired);return throws(()=>m.anchorText(population,{...canonicalAnchor,basis_zh:"另一條算式"},"basis_zh"));};
    check("頁面 JSON 拒絕錯版本中文文字", textPin(display));
    check("頁面 JSON 拒絕錯版本中文算式", basisPin(display));
    const payloadShape = (m) => [null,[],1,"wrong"].every((value)=>{
      setPayload(value);
      try {m.anchorText(population,canonicalAnchor,"text_zh");return false;}
      catch(error){return error.message === "Invalid English comparison data";}
    });
    check("頁面 JSON 拒絕四種非物件根節點", payloadShape(display));
    const malformed = setPayload(paired); malformed.textContent = "{";
    check("損壞頁面 JSON hard fail", throws(()=>display.anchorText(population,canonicalAnchor,"text_zh")));
    setPayload({population:{qa:{...directAnchor,text_en:" "}}});
    check("頁面 JSON 不以空白英文代替原文", throws(()=>display.anchorText(population,canonicalAnchor,"text_zh")));
    document.getElementById = () => null;
    check("缺頁面 JSON 不會靜默沿用中文", throws(()=>display.anchorText(population,canonicalAnchor,"text_zh")));
    check("突變自證：移除頁面文字 pin 會漏過舊版資料", detected(textPin,await mutate("display-text.js","saved.text_zh === anchor.text_zh && ","")));
    check("突變自證：移除頁面算式 pin 會漏過舊版資料", detected(basisPin,await mutate("display-text.js"," && saved.basis_zh === anchor.basis_zh","")));
    check("突變自證：移除 JSON 根節點守衛會漏過格式錯誤", detected(payloadShape,await mutate("display-text.js",'if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Invalid English comparison data");',"/* mutation: root guard removed */")));
    delete document.getElementById;

    const income = {...snapshots.get("district_household_income"),updated_at:"2026-09-09",data_version:"language-fixture-v1",series:[
      {period:"2024",category:"全港",value:10000},
      {period:"2025",category:"全港",value:98765.4321},
      {period:"2025",category:"中西區",value:45000}
    ]};
    const selected = {kind:"point",period:"2025",category:"全港",value:999999};
    const pointOracle = (m) => m.createCitation(income,selected).split("\n")[0] === "Median monthly domestic household income by district, Hong Kong overall: 2025, 98,765.4321 HK$ per household per month.";
    check("英文引用重新讀精確原值，唔信選項附帶假 value", pointOracle(citation));
    const incomeText = citation.createCitation(income,selected);
    check("英文引用保留來源網址、統計日、版本及範圍", incomeText.includes(`Source: ${income.source_en}; ${income.source_url}`) && incomeText.includes("Data as of: 2026-09-09; data version: language-fixture-v1.") && incomeText.includes("Scope: Median monthly income of all domestic households") && !han.test(incomeText));
    check("英文選項仍携帶原始中文分類及原期數", citation.citationChoices(income).some((choice)=>choice.period==="2025"&&choice.category==="全港") && citation.citationChoiceLabel(income,selected).measure==="Hong Kong overall");
    check("英文分類名稱唔可當原始查數 key", throws(()=>citation.createCitation(income,{...selected,category:"Hong Kong overall"})));
    check("英語模式亦拒絕不存在期數、缺值及重複值", throws(()=>citation.createCitation(income,{...selected,period:"2023"})) && throws(()=>citation.createCitation({...income,series:income.series.map((row)=>row.category==="全港"?{...row,value:null}:row)},selected)) && throws(()=>citation.createCitation({...income,series:[...income.series,{...income.series[1]}]},selected)));
    const sourceUnitGuard = (m) => throws(()=>m.createCitation({...income,series:income.series.map((row)=>({...row,unit_zh:"千港元"}))},selected));
    check("英語引用仍會拒絕來源列單位不符", sourceUnitGuard(citation));

    const publicDoc = {...snapshots.get("public_expenditure_policy_groups"),updated_at:"2026-09-09",data_version:"public-fixture-v1",series:[
      {period:"2024-25",category:"教育",value:1234.125},
      {period:"2025-26",category:"教育",value:2234.375}
    ],totals:[]};
    const changeSelection = {kind:"point",category:"教育",from:"2024-25",to:"2025-26"};
    const changeText = citation.createCitation(publicDoc,changeSelection);
    check("英文財年增減引用保留原期數及實際／修訂預算", changeText.includes("2025-26 (Revised estimate) minus 2024-25 (Actual)") && changeText.includes("nominal change 1,000.25 HK$") && changeText.includes("2,234.375 HK$ − 2024-25 (Actual) 1,234.125 HK$ = 1,000.25 HK$"));
    check("英文亦禁止把政府開支當公共開支引用", throws(()=>citation.createCitation({...publicDoc,indicator_id:"govt_expenditure"},changeSelection)));
    const beforeCitation = JSON.stringify(income); citation.createCitation(income,selected); check("翻譯同引用唔改原始分類、值、單位及來源", JSON.stringify(income)===beforeCitation && JSON.stringify([...snapshots])===unchanged);
    setLanguage("zh-HK");
    check("切回中文仍顯示原字串及精確值", citation.createCitation(income,selected).startsWith("各區住戶月入中位數，全港：2025，98,765.4321 港元。") && display.anchorText(population,directAnchor,"text_zh")==="原始中文");
    setLanguage("en-GB");

    for (const [name,file,from,to,oracle] of [
      ["大數量級除數反轉","format.js","formatNumber(value / scale, {digits: 2})","formatNumber(value * scale, {digits: 2})",magnitudeOracle],
      ["十億誤稱百萬","format.js",'[1e9, "billion"]','[1e9, "million"]',magnitudeOracle],
      ["財年旗標漏用","format.js",'if (fiscal || month > 12 || month === 0) return `${match[1]}–${match[2]} financial year`;','if (month > 12 || month === 0) return `${match[1]}–${match[2]} financial year`;',periodOracle],
      ["未知分類偷偷退回中文","display-text.js",'throw new Error(`Missing authored English label: ${value}`);','return value;',unknownLabel],
      ["缺少口徑偷偷退回中文","display-text.js",'throw new Error(`Missing or outdated English metadata: ${doc.indicator_id}.${key}`);','return original;',missingMetadata],
      ["原文 pin 比較拆走","display-text.js","entry.zh === original","true",outdatedMetadata],
      ["真正 metadata 閘嘅原文 pin 比較拆走","display-text.js","entry.zh === original","true",metadataPinGuard],
      ["英文有效性檢查拆走","display-text.js",'const validEnglish = (text) => typeof text === "string" && text.trim().length > 0;','const validEnglish = (text) => true;',missingEnglishEntry],
      ["分類英文有效性檢查拆走","display-text.js",'const validEnglish = (text) => typeof text === "string" && text.trim().length > 0;','const validEnglish = (text) => true;',missingEnglishLabel],
      ["真正 metadata 閘錯用中文模式","display-text.js",'if (doc[field]) indicatorText(doc, field, {locale:"en-GB"});','if (doc[field]) indicatorText(doc, field, {locale:"zh-HK"});',metadataPinGuard],
      ["真正 metadata 閘漏驗系列分類","display-text.js",'...(doc.series ?? []).map((row) => row.category), ','',seriesLabelGuard],
      ["真正 metadata 閘漏驗分類次序","display-text.js",'...(doc.category_order ?? []), ','',orderedLabelGuard],
      ["真正 metadata 閘漏驗期數備註","display-text.js",'...Object.values(doc.period_notes ?? {})','...[]',periodNoteGuard],
      ["錨點缺英文偷偷退回中文","display-text.js",'throw new Error(`Missing English comparison: ${doc.indicator_id}.${anchor.id}.${field}`);','return anchor[field];',missingAnchor],
      ["精確引用改為整數","citation.js",'String(value).split(".")','String(Math.round(value)).split(".")',pointOracle],
      ["引用列單位閘拆走","citation.js",'matches[0].unit_zh !== undefined && matches[0].unit_zh !== indicator.unit_zh','false',sourceUnitGuard]
    ]) {
      check(`突變自證：${name}`,detected(oracle,await mutate(file,from,to)));
    }

    // 真正 validate 的讀檔位置導向臨時快照；schema、英文閘及其他依賴仍用 production。
    // 只改 fixture 路徑，不模擬驗證結果；原 repo 快照一直保持唯讀。
    const validateUrl = new URL("./validate.mjs",import.meta.url);
    const validateSource = await readFile(validateUrl,"utf8");
    const directory = await mkdtemp(join(tmpdir(),"hkdm-english-validate-"));
    try {
      const snapshotDirectory = join(directory,"snapshots");
      await mkdir(snapshotDirectory);
      const snapshotPath = join(snapshotDirectory,"population.json");
      let sequence=0;
      async function runValidate(source,doc) {
        await writeFile(snapshotPath,JSON.stringify(doc));
        const snapshotImport = 'import { SNAPSHOT_DIR } from "../src/data/_lib/snapshot.js";';
        if (source.split(snapshotImport).length!==2) throw new Error("真正 validate 測試無法精確改用 fixture 快照");
        const fixtureSource = source.replace(snapshotImport,`const SNAPSHOT_DIR = ${JSON.stringify(snapshotDirectory)};`)
          .replace(/from\s+(["'])(\.\.?\/[^"']+)\1/g,(_,quote,path)=>`from ${JSON.stringify(new URL(path,validateUrl).href)}`)
          .replace(/new URL\((["'])(\.\.?\/[^"']+)\1, import\.meta\.url\)/g,(_,quote,path)=>`new URL(${JSON.stringify(new URL(path,validateUrl).href)})`);
        const path=join(directory,`validate-${sequence++}.mjs`);
        await writeFile(path,fixtureSource);
        try {
          const result=await runNode(process.execPath,[path],{timeout:15000});
          return {code:0,output:result.stdout+result.stderr};
        } catch(error) {
          if(typeof error.code!=="number")throw error;
          return {code:error.code,output:error.stdout+error.stderr};
        }
      }
      const good = await runValidate(validateSource,population);
      check("真正 validate 接線：原快照可通過全部現有閘",good.code===0);
      if(good.code!==0)throw new Error(`英文 validate fixture 基線不合格：${good.output}`);
      const changed = {...population,basis_zh:population.basis_zh+"（已改定義）"};
      changed.content_hash=computeContentHash(changed);
      check("英文接線壞 fixture 仍過 schema 及內容 hash，獨立驗翻譯閘",validateIndicator(changed).ok);
      const bad = await runValidate(validateSource,changed);
      check("真正 validate 接線：已改中文而未更新英文會 hard fail",bad.code!==0 && bad.output.includes("Missing or outdated English metadata: population.basis_zh"));
      const hook='try { assertEnglishMetadata(doc); } catch (error) { problems.push(error.message); }';
      if(validateSource.split(hook).length!==2)throw new Error("英文 validate 接線突變必須精確命中一次");
      const disconnected = await runValidate(validateSource.replace(hook,'try { /* mutation: English guard disconnected */ } catch (error) { problems.push(error.message); }'),changed);
      check("突變自證：拆走真正 validate 英文閘後，過期翻譯會漏過",disconnected.code===0);
      check("真正 validate fixture 冇改 repo 原快照",JSON.stringify(JSON.parse(await readFile(new URL("../src/data/_snapshots/population.json",import.meta.url),"utf8")))===JSON.stringify(population));
    } finally {await rm(directory,{recursive:true,force:true});}
  } finally {
    if (savedDocument) Object.defineProperty(globalThis,"document",savedDocument);
    else delete globalThis.document;
  }
}
