import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import * as money from "../src/components/money-flow.js";

// Independent teaching answers: never derive expected answers from the case metadata.
const ANSWERS = [
  ["loan", "company", "repay", "gift"],
  ["new-shares", "company", "disclose", "guarantee"],
  ["secondary", "seller", "market-risk", "capital"],
  ["grant", "company", "accountability", "free"],
];
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const throws = (fn) => {try {fn(); return false;} catch {return true;}};
const result = (complete, recipientCorrect, responsibilityCorrect, correct) => ({complete, recipientCorrect, responsibilityCorrect, correct});

export async function testMoneyFlow(check) {
  console.log("\n[資金流向課堂練習] 獨立答案、未完成及錯誤選項自證");
  const keysCorrect = (module) => same(module.moneyFlowCases().map(({id, recipient, responsibility}) => [id, recipient, responsibility]), ANSWERS.map((row) => row.slice(0, 3)));
  const allCorrect = (module) => ANSWERS.every(([id, recipient, responsibility]) => same(module.assessMoneyFlow(id, {recipient, responsibility}), result(true, true, true, true)));
  const unfinishedCorrect = (module) => ANSWERS.every(([id, recipient, responsibility]) =>
    same(module.assessMoneyFlow(id), result(false, false, false, false)) &&
    same(module.assessMoneyFlow(id, {recipient: null, responsibility: null}), result(false, false, false, false)) &&
    same(module.assessMoneyFlow(id, {recipient}), result(false, true, false, false)) &&
    same(module.assessMoneyFlow(id, {responsibility}), result(false, false, true, false)));
  const recipientErrorCorrect = (module) => ANSWERS.every(([id, , responsibility]) => same(module.assessMoneyFlow(id, {recipient: "exchange", responsibility}), result(true, false, true, false)));
  const responsibilityErrorCorrect = (module) => ANSWERS.every(([id, recipient, , wrongResponsibility]) => same(module.assessMoneyFlow(id, {recipient, responsibility: wrongResponsibility}), result(true, true, false, false)));
  const bothErrorsCorrect = (module) => ANSWERS.every(([id, , , responsibility]) => same(module.assessMoneyFlow(id, {recipient: "exchange", responsibility}), result(true, false, false, false)));
  const unknownCaseRejected = (module) => ["unknown", "toString", null, undefined].every((id) => throws(() => module.assessMoneyFlow(id)));
  const unknownRecipientRejected = (module) => ["government", "", 0, false, {}, []].every((recipient) => throws(() => module.assessMoneyFlow("loan", {recipient, responsibility: "repay"})));
  const unknownResponsibilityRejected = (module) => ["unknown", "accountability", "", 0, false, {}, []].every((responsibility) => throws(() => module.assessMoneyFlow("loan", {recipient: "company", responsibility})));

  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  try {
    const titles = {};
    for (const language of ["zh-HK", "en-GB"]) {
      Object.defineProperty(globalThis, "document", {configurable: true, writable: true, value: {documentElement: {lang: language}}});
      check(`${language}：四個情境收款者及責任符合獨立答案`, keysCorrect(money));
      check(`${language}：四題正確答案全部獲正確回饋`, allCorrect(money));
      check(`${language}：未答、全空及只答一部分唔會當完成或全對`, unfinishedCorrect(money));
      check(`${language}：錯收款者、啱責任，分項回饋分得清`, recipientErrorCorrect(money));
      check(`${language}：啱收款者、錯責任，分項回饋分得清`, responsibilityErrorCorrect(money));
      check(`${language}：兩項都錯仍屬已完成，唔會當答啱`, bothErrorsCorrect(money));
      check(`${language}：未知情境拒絕，唔借第一題答案`, unknownCaseRejected(money));
      check(`${language}：未知收款者及錯類型拒絕`, unknownRecipientRejected(money));
      check(`${language}：未知責任、其他題責任及錯類型拒絕`, unknownResponsibilityRejected(money));
      const cases = money.moneyFlowCases();
      titles[language] = cases.map(({title}) => title);
      check(`${language}：每題有情境、付款者、選項、解釋及追問`, cases.every((item) =>
        [item.title, item.scenario, item.payer, item.explanation, item.question, ...item.options.map(([, label]) => label)]
          .every((text) => typeof text === "string" && text.trim().length > 0)));
      check(`${language}：收款選項維持公司、賣方同交易所，唔隨語言改答案鍵`, same(money.moneyRecipients().map(([id]) => id), ["company", "seller", "exchange"]));
    }
    check("中英情境標題確實切換，唔只重用同一語言", titles["zh-HK"].every((title, index) => title !== titles["en-GB"][index]));
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  }

  const original = await readFile(new URL("../src/components/money-flow.js", import.meta.url), "utf8");
  const localeImport = 'from "./locale.js";';
  if (original.split(localeImport).length !== 2) throw new Error("資金流向突變測試必須精確定位 locale 匯入一次");
  const source = original.replace(localeImport, `from ${JSON.stringify(new URL("../src/components/locale.js", import.meta.url).href)};`);
  const directory = await mkdtemp(join(tmpdir(), "hkdm-money-flow-"));
  let sequence = 0;
  const detects = (oracle, module) => {try {return !oracle(module);} catch {return true;}};
  async function mutation(from, to) {
    if (source.split(from).length !== 2) throw new Error(`資金流向源碼突變必須精確命中一次：${from}`);
    const file = join(directory, `mutation-${sequence++}.mjs`);
    await writeFile(file, source.replace(from, to));
    // Import failures are hard failures, not proof that an answer/guard mutation was detected.
    return import(pathToFileURL(file).href);
  }
  try {
    for (const [label, from, to, oracle] of [
      ["貸款收款者誤改賣方", 'recipient: "company", responsibility: "repay"', 'recipient: "seller", responsibility: "repay"', keysCorrect],
      ["現有股票價款誤入公司", 'recipient: "seller", responsibility: "market-risk"', 'recipient: "company", responsibility: "market-risk"', allCorrect],
      ["新股正確答案誤改保證回報", 'recipient: "company", responsibility: "disclose"', 'recipient: "company", responsibility: "guarantee"', keysCorrect],
      ["公共資助正確答案誤改任意使用", 'recipient: "company", responsibility: "accountability"', 'recipient: "company", responsibility: "free"', allCorrect],
      ["只答一項就算完成", "const complete = recipient !== null && responsibility !== null;", "const complete = recipient !== null || responsibility !== null;", unfinishedCorrect],
      ["答啱責任就放過錯收款者", "correct: complete && recipient === item.recipient && responsibility === item.responsibility", "correct: complete && responsibility === item.responsibility", recipientErrorCorrect],
      ["答啱收款者就放過錯責任", "correct: complete && recipient === item.recipient && responsibility === item.responsibility", "correct: complete && recipient === item.recipient", responsibilityErrorCorrect],
      ["刪除未知情境閘", 'if (!item) throw new Error("Unknown money-flow case");', "", unknownCaseRejected],
      ["刪除未知收款者閘", 'if (recipient !== null && !moneyRecipients().some(([id]) => id === recipient)) throw new Error("Unknown recipient");', "", unknownRecipientRejected],
      ["刪除未知責任閘", 'if (responsibility !== null && !item.options.some(([id]) => id === responsibility)) throw new Error("Unknown responsibility");', "", unknownResponsibilityRejected],
    ]) check(`源碼突變：${label}會被捉到`, detects(oracle, await mutation(from, to)));
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}
