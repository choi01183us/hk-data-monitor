import {t} from "./locale.js";

// Authored teaching cases, not statistical records. No amounts, scoring history or storage.
export function moneyFlowCases() {
  return [
    {
      id: "loan", title: t("銀行借貸", "Bank loan"),
      scenario: t("一間虛構本地維修公司想買設備。銀行批出商業貸款，並已向公司放款。", "A fictional local repair company wants to buy equipment. A bank approves a business loan and pays it to the company."),
      payer: t("銀行", "Bank"), recipient: "company", responsibility: "repay",
      options: [
        ["repay", t("公司按合約還本付息，先評估現金流。", "The company repays principal and interest under the agreement, having assessed its cash flow.")],
        ["gift", t("公司收到錢就唔使還，銀行承擔全部風險。", "The company keeps the money without repayment; the bank bears all risk.")],
        ["owner", t("貸款一批出，銀行就必然成為股東。", "Approval of a loan automatically makes the bank a shareholder.")],
      ],
      explanation: t("貸款進入公司，但同時產生還款責任。營業收入未必如預期，仍要按合約還本付息；銀行要評估信貸風險，抵押或擔保要求則按合約。", "The company receives the loan and takes on a repayment obligation. Revenue may fall short of expectations, but principal and interest remain due under the agreement. The bank assesses credit risk; collateral or guarantees depend on the contract."),
      question: t("如果生意轉差，公司仍要支付邊啲款項？決定借貸前要補咩證據？", "If business deteriorates, which payments remain due? What evidence is needed before borrowing?"),
    },
    {
      id: "new-shares", title: t("認購公司新股", "Subscribing for new shares"),
      scenario: t("另一間虛構公司透過公開招股發行新股，投資者認購。本例只講公司新發行嘅股份，唔包括舊股出售。", "Another fictional company issues new shares through an IPO, and investors subscribe. This case covers newly issued shares only, excluding sales of existing shares."),
      payer: t("認購新股嘅投資者", "Investors subscribing for new shares"), recipient: "company", responsibility: "disclose",
      options: [
        ["guarantee", t("交易所保證股價上升同派息。", "The exchange guarantees rising share prices and dividends.")],
        ["disclose", t("公司披露業務、風險同集資用途；股東承擔投資風險。", "The company discloses its business, risks and use of proceeds; shareholders bear investment risk.")],
        ["deposit", t("認購股份等同存款，必定保本。", "A share subscription is a deposit with guaranteed capital.")],
      ],
      explanation: t("新股認購款由公司取得，扣除發行費用後可按披露用途運用。股東取得擁有權，原有股東持股比例可能被攤薄。公司有披露責任；投資者可能損失本金，派息並無保證。", "The company receives subscription proceeds and can use them for the disclosed purposes after issue costs. Investors acquire ownership, and existing shareholders may be diluted. The company has disclosure obligations; investors may lose capital and dividends are not guaranteed."),
      question: t("招股文件講到資金用途同風險，是否就等於保證回報？", "Does disclosure of the use of proceeds and risks guarantee a return?"),
    },
    {
      id: "secondary", title: t("買賣現有股票", "Trading existing shares"),
      scenario: t("公司已經上市。投資者甲向另一位投資者乙買入乙持有嘅現有股份；公司今次冇發行新股。", "A company is already listed. Investor A buys existing shares held by Investor B; the company does not issue any new shares in this transaction."),
      payer: t("買入股票嘅投資者甲", "Investor A, the buyer"), recipient: "seller", responsibility: "market-risk",
      options: [
        ["capital", t("每次成交都為上市公司增加同額新資金。", "Every trade raises the same amount of new funding for the listed company.")],
        ["refund", t("股價跌咗，上市公司必須退回買入價。", "If the share price falls, the company must refund the purchase price.")],
        ["market-risk", t("買方承擔股價風險；公司仍須履行上市披露責任。", "The buyer bears share-price risk; the company retains its listing disclosure obligations.")],
      ],
      explanation: t("呢次買賣嘅股票價款流向賣方乙，唔係公司新增集資。交易及結算由市場制度處理，另有費用；買方仍須了解公司披露資料同市場風險。成交額唔等於公司集資額。", "The share purchase price goes to seller B, rather than providing new capital to the company. Market arrangements handle trading and settlement, with separate charges. The buyer still needs to understand company disclosures and market risk. Turnover is not the same as funds raised."),
      question: t("點解市場好活躍，唔能夠單靠成交額判斷企業集咗幾多新資金？", "Why can trading turnover alone not tell us how much new funding companies raised?"),
    },
    {
      id: "grant", title: t("公共資助", "Public grant"),
      scenario: t("虛構課堂方案：政府審批後向維修公司發放培訓資助，限定用於指定培訓，並要求交代用途同成果。呢個唔係現行資助計劃。", "Fictional classroom scheme: after approval, the government pays a training grant to the repair company for specified training, requiring reports on its use and outcomes. This is not an existing grant scheme."),
      payer: t("政府（公帑）", "Government (public money)"), recipient: "company", responsibility: "accountability",
      options: [
        ["accountability", t("按條件用款及報告成效，並交代公共資源嘅取捨。", "Use the grant under its conditions, report outcomes and explain the trade-offs in public resources.")],
        ["free", t("獲批後可以任意使用，永遠唔使追討。", "Once approved, the money can be spent on anything and can never be recovered.")],
        ["results", t("只要使晒資助，就已經證明培訓有效。", "Spending the entire grant proves that the training worked.")],
      ],
      explanation: t("公司收到公帑，要按呢個虛構方案嘅條件使用及交代成效。真實計劃嘅資格、配對款、支付同追討安排各有不同，要查原文。公共資助有機會成本；使咗幾多錢唔等於改善咗幾多。", "The company receives public money and must meet this fictional scheme's conditions and outcome-reporting requirements. Actual schemes differ in eligibility, matching funds, payments and recovery arrangements; consult their terms. Public grants have opportunity costs. Spending is not a measure of improvement."),
      question: t("如果用公帑支持培訓，點證明公共需要、比較其他用途，同觀察受惠者有冇改善？", "If public money supports training, how would you evidence the need, compare other uses and observe improvements for beneficiaries?"),
    },
  ];
}

export function moneyRecipients() {
  return [
    ["company", t("公司", "The company")],
    ["seller", t("出售現有股票嘅投資者", "The investor selling existing shares")],
    ["exchange", t("交易所（全數股票價款）", "The exchange (the entire share purchase price)")],
  ];
}

export function assessMoneyFlow(caseId, {recipient = null, responsibility = null} = {}) {
  const item = moneyFlowCases().find((entry) => entry.id === caseId);
  if (!item) throw new Error("Unknown money-flow case");
  if (recipient !== null && !moneyRecipients().some(([id]) => id === recipient)) throw new Error("Unknown recipient");
  if (responsibility !== null && !item.options.some(([id]) => id === responsibility)) throw new Error("Unknown responsibility");
  const complete = recipient !== null && responsibility !== null;
  return {complete, recipientCorrect: recipient !== null && recipient === item.recipient,
    responsibilityCorrect: responsibility !== null && responsibility === item.responsibility,
    correct: complete && recipient === item.recipient && responsibility === item.responsibility};
}
