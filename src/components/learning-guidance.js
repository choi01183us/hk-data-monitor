// 教學讀法集中按 id 維護；只解釋現有指標，不載入其他數據或作政策成本估算。
import { html } from "npm:htl";

const guidance = {
  population: {
    can: "睇香港總人口喺唔同年份有幾多，作為理解服務需求規模嘅背景。",
    cannot: "總人口冇拆年齡，單靠呢條線唔能夠判斷人口老化，亦唔能夠解釋人口變動原因。",
    question: "如果想判斷長者服務需求有冇增加，總人口以外仲需要邊種資料？",
    route: "hong-kong",
  },
  unemployment: {
    can: "比較整體同青年勞動人口嘅失業率，睇兩組走勢同差距。",
    cannot: "青年失業率唔係所有青年之中冇返工嘅比例；讀書而冇求職嘅青年唔因此算失業。差距本身亦未解釋原因。",
    question: "提出青年就業支援之前，仲要了解求職者面對邊啲困難？",
    route: "hong-kong",
  },
  median_wage: {
    can: "睇工資分布中間位置隨年份點變，並分清所有僱員同全職僱員。",
    cannot: "中位數唔係每個人實收嘅工資，亦唔代表一個家庭嘅總入息；兩種受聘口徑唔可以隨意接成同一條走勢。",
    question: "用呢個數為模擬角色寫收入背景時，角色嘅受聘性質同工作時數仲有咩要交代？",
    route: "hong-kong",
  },
  household_income: {
    can: "睇家庭住戶每月總入息嘅中位數，作為家庭資源嘅背景。",
    cannot: "住戶入息唔等於個人工資；住戶大小同就業人數唔同，單靠中位數唔能夠判斷每個家庭是否夠使。",
    question: "兩個入息相同、但成員數目唔同嘅家庭，生活壓力可能有咩分別？",
    route: "hong-kong",
  },
  cpi: {
    can: "睇綜合消費物價相對一年前嘅變動百分率，分清升價速度加快定放慢。",
    cannot: "通脹率回落唔一定代表物價下跌；綜合指數亦唔代表每個家庭嘅購物籃或個別商品價格。",
    question: "如果通脹率回落但仍然為正，點解家庭仍可能覺得生活費愈來愈高？",
    route: "hong-kong",
  },
  gdp: {
    can: "睇以當時市價計算嘅人均經濟產出隨年份點變。",
    cannot: "人均 GDP 唔係工資，亦唔係每人分到嘅收入；未扣除通脹，亦睇唔到收入點樣分布。",
    question: "要評估市民生活有冇改善，除咗人均 GDP，仲會查邊啲生活數據？",
    route: "hong-kong",
  },
  four_key_industries: {
    can: "睇四大行業增加價值佔 GDP 嘅比重同走勢，認識香港經濟結構。",
    cannot: "比重唔係就業人數比例；比重下降亦唔一定代表該行業產出減少，因為整體 GDP 同時會變。",
    question: "建議支援某個行業時，除咗 GDP 比重，仲要衡量邊啲就業或社會影響？",
    route: "hong-kong",
  },
  hkex_listings: {
    can: "分開睇主板同 GEM 嘅上市公司數目，了解上市市場嘅公司數量。",
    cannot: "上市公司數目唔等於市值、就業人數或市民收入，單靠公司數目唔能夠判斷經濟好壞。",
    question: "兩個時期上市公司數目相若，金融市場狀況都可能唔同，仲需要查咩資料？",
    route: "hong-kong",
  },
  govt_expenditure: {
    can: "睇政府經常開支喺教育、社會福利、衞生同其他類別嘅分配及歷年變化。",
    cannot: "呢度只計政府帳目，唔包括營運基金同房屋委員會，亦唔係全年開支總額；開支多咗本身未能證明服務改善。",
    question: "如果想討論公共房屋資源，點解需要先轉到公共經常開支嘅口徑？",
    route: "public-finance",
  },
  public_expenditure_policy_groups: {
    can: "填齊數據後，可按同一公共口徑比較各政策組別嘅經常開支，同相鄰年度名義增減。",
    cannot: "經常開支唔係全年公共開支總額；預算唔等於實際已用款項，名義增加亦未證明服務增加。政府開支已包括喺公共開支內，唔可以再相加或合圖。",
    question: "增加某範疇資源之前，你會用咩需要同成效證據，向其他範疇嘅同學解釋取捨？",
    route: "public-finance",
  },
  govt_revenue: {
    can: "睇政府各類收入嘅規模同歷年變化，討論資金來源嘅穩定性。",
    cannot: "預算收入唔保證一定收到；單靠收入亦計唔到財政盈餘，因為需要同年度、同口徑嘅完整收支資料。",
    question: "如果一項服務要年年持續，揀資金來源時要考慮咩風險？",
    route: "public-finance",
  },
  fiscal_reserves: {
    can: "睇某個月末財政儲備嘅結餘同變化，作為討論政府承受風險能力嘅背景。",
    cannot: "儲備係某一時點嘅結餘，唔係一年收入；唔可以由儲備數字直接推斷有幾多錢可以長期用於新服務。",
    question: "一次性措施同每年持續嘅服務，用儲備支持時有咩唔同考慮？",
    route: "public-finance",
  },
  phr_waiting_time: {
    can: "填妥後，可按同一定義睇官方輪候時間，分清綜合輪候時間、傳統公屋輪候時間同長者一人申請者。",
    cannot: "唔同輪候定義唔可以接成一條趨勢；官方平均數亦唔保證今日新申請嘅個人會等相同時間。",
    question: "比較房屋措施成效之前，點樣確保兩個輪候數字講緊同一類申請者同住屋安排？",
    route: "public-finance",
  },
};

/** 每頁只傳自己嘅指標；待填狀態沿用正式 loader，唔將 null 當零。 */
export function learningGuidance(indicator) {
  const item = guidance[indicator.indicator_id];
  if (!item) return html`<div></div>`;
  const waiting = indicator.manual_status === "todo" || indicator.manual_status === "partial";
  return html`<section class="learning-guidance" aria-labelledby="reading-guide">
    <h2 id="reading-guide">用呢個數建立論點</h2>
    ${waiting ? html`<p class="manual-notice">${indicator.manual_status === "todo" ? "呢頁數據仍待填。" : "呢頁數據未填齊。"}未填唔代表零，暫時唔可以用未填部分作證據。</p>` : null}
    <p><strong>可以看甚麼：</strong>${item.can}</p>
    <p class="learning-guidance__limits"><strong>未能證明甚麼：</strong>${item.cannot}</p>
    <p class="learning-guidance__question"><strong>一齊討論：</strong>${item.question}</p>
    <p><a href=${`../learn/${item.route}`}>繼續學習路線</a> · <a href="../learn/budget-memo">用證據寫青年預算備忘</a></p>
  </section>`;
}
