// 人手策劃嘅閱讀路線，只建立問題同連結；唔計相關系數、合併數據或推斷因果。
// 外部來源已於 2026-09-08 核對。數字由各指標原始快照提供，唔抄入呢個檔。
export const technologySources = {
  research: {
    institution: "政府統計處", title: "研究及發展統計",
    url: "https://www.censtatd.gov.hk/tc/scode580.html",
    detail: "延伸查研發活動、執行機構同資金來源，分清邊個做研究、邊個出錢。",
  },
  internet: {
    institution: "政府統計處", title: "資訊科技的使用",
    url: "https://www.censtatd.gov.hk/tc/scode590.html",
    detail: "查住戶、個人及企業使用情況；各類統計嘅調查對象同分母不同。",
  },
  inclusion: {
    institution: "數字政策辦公室", title: "資訊科技使用調查",
    url: "https://www.digitalpolicy.gov.hk/tc/about_us/facts/it_usage_penetration_survey.html",
    detail: "沿住戶及企業原報告追查分組資料，留意每份報告嘅調查年份。",
  },
  skills: {
    institution: "職業訓練局", title: "創科人力與技能",
    url: "https://manpower-survey.vtc.edu.hk/tc/industry/innovation-and-technology",
    detail: "查技能、職位空缺及入職要求；先辨認調查年份，將預測同實際僱員數分開。",
  },
  funding: {
    institution: "創新科技署", title: "創科基金年度核准資助",
    url: "https://www.itf.gov.hk/tc/itf-statistics/index-4.html",
    detail: "了解獲批資助；核准金額唔等於當年現金支出，亦唔涵蓋所有創科資助計劃。",
  },
  ai: {
    institution: "香港特別行政區政府", title: "2026–27 預算案：人工智能+",
    url: "https://www.budget.gov.hk/2026/chi/budget07.html",
    detail: "查政策目標、應用同培訓安排；將建議、撥款承諾、執行情況同成效分開。",
  },
};

export const technologyTopics = [
  {
    id: "research", label: "研發與青年", tag: "研究投入 × 青年機會",
    title: "研究做多咗，青年點樣參與？",
    intro: "先睇本地研發投入，再了解青年求職環境。兩者可以幫你提出培訓問題，但未能單靠走勢判斷一項計劃有冇效。",
    indicators: ["rd_expenditure", "unemployment"],
    caveat: "研發開支包括企業、高校同政府等機構；失業率卡顯示全港整體，點入可睇青年分類。兩項唔係同一群人嘅投入與成果。",
    connections: [
      { label: "科技觀察", question: "研發資源規模點變？", links: [["本地研發總開支", "rd_expenditure"]] },
      { label: "市民需要", question: "青年求職同技能需要係乜？", links: [["整體與青年失業率", "unemployment"], ["全港工資背景", "median_wage"]] },
      { label: "財政取捨", question: "實習或培訓應支援邊啲人？", links: [["資源分配與取捨", "../learn/public-finance"]] },
    ],
    sources: ["research", "skills"],
    proposal: "可以研究：支援青年參與研究實習或技能培訓。",
    missing: "仲要查課程成本、參加者背景、完成後就業情況；全港工資唔代表科技業薪酬。",
    outcome: "成效點驗：按相同追蹤時間，睇參加者完成培訓及進入相關工作嘅情況，並交代其他可能影響因素。",
  },
  {
    id: "inclusion", label: "數碼共融", tag: "家居上網 × 家庭資源",
    title: "服務搬上網，邊啲人需要支援？",
    intro: "將家居上網情況同住戶收入並排閱讀，再到分組調查查證邊啲人遇到困難。網絡接駁、設備同使用能力係不同問題。",
    indicators: ["household_internet", "household_income"],
    caveat: "全港住戶上網率同入息中位數唔會話畀你知低收入住戶嘅上網率；唔可以由兩個全港數字推算群組差距。",
    connections: [
      { label: "科技觀察", question: "家中有冇網絡接駁？", links: [["住戶上網率", "household_internet"]] },
      { label: "市民需要", question: "設備、費用、操作邊樣有困難？", links: [["住戶入息背景", "household_income"], ["香港生活路線", "../learn/hong-kong"]] },
      { label: "財政取捨", question: "設備支援定面對面服務更合適？", links: [["資源分配與取捨", "../learn/public-finance"]] },
    ],
    sources: ["internet", "inclusion"],
    proposal: "可以研究：設備借用、數碼技能支援，或保留面對面辦事渠道。",
    missing: "仲要查年齡及入息分組、設備是否足夠、實際辦事困難；唔向同學收集私人家庭資料。",
    outcome: "成效點驗：睇目標使用者能否完成所需服務、需要幾多協助，同線下渠道是否仍然可用。",
  },
  {
    id: "ai-work", label: "AI與工作", tag: "技能轉變 × 就業背景",
    title: "AI 應用增加，培訓應該教啲乜？",
    intro: "先讀官方人力與政策資料，辨認所需技能，再用就業及工資數據了解整體背景。提出可檢驗嘅問題，唔預先假定 AI 必然增加或減少職位。",
    indicators: ["unemployment", "median_wage"],
    caveat: "呢兩張係全港就業背景，並非 AI 行業指標。失業率或工資變動有多種原因，唔能夠單靠佢哋斷言 AI 造成。",
    connections: [
      { label: "技能問題", question: "實際工作需要邊種新技能？", links: [["科技行業資料入口", "#official-resources"]] },
      { label: "市民需要", question: "在職人士同求職青年需要一樣？", links: [["整體與青年失業率", "unemployment"], ["工資中位數", "median_wage"]] },
      { label: "財政取捨", question: "培訓點配合工作同照顧時間？", links: [["寫青年預算備忘", "../learn/budget-memo"]] },
    ],
    sources: ["skills", "ai"],
    proposal: "可以研究：配合實際職務嘅 AI 基礎培訓，涵蓋核查輸出同保護資料。",
    missing: "仲要查僱主技能要求、培訓對象及上課時間；人力需求預測、空缺同已就業人數要分開。",
    outcome: "成效點驗：用具體工作任務評估技能，追蹤能否應用所學，唔只數有幾多人報名。",
  },
  {
    id: "funding", label: "創科與財政", tag: "研究投入 × 資源取捨",
    title: "支持創新，點安排長期資源？",
    intro: "研發統計描述全港投入，財政儲備描述政府結餘。再查個別資助同預算措施，分清誰出錢、款項點用，同往後點維持。",
    indicators: ["rd_expenditure", "fiscal_reserves"],
    caveat: "兩者都以港元表示，但研發開支係一年投入、儲備係月末結餘，時期同範圍不同。研發開支唔係政府科技預算，兩者唔適合直接相減或計『可用幾年』。",
    connections: [
      { label: "科技觀察", question: "全港研發投入包括邊啲機構？", links: [["本地研發總開支", "rd_expenditure"]] },
      { label: "資金背景", question: "一次性試驗之後點繼續？", links: [["政府收入", "govt_revenue"], ["財政儲備", "fiscal_reserves"]] },
      { label: "財政取捨", question: "相對其他需要，點排優先？", links: [["公共經常開支（先核對填數狀態）", "public_expenditure_policy_groups"], ["分餅學習路線", "../learn/public-finance"]] },
    ],
    sources: ["funding", "ai"],
    proposal: "可以研究：先做小規模試驗，按成效再決定持續資助。",
    missing: "仲要查具體項目嘅一次性及經常成本；基金核准資助唔等於當年實際支出，唔可以加進公共開支。",
    outcome: "成效點驗：先寫清受惠者、服務改善目標、檢討時間，同未達目標時點調整。",
  },
];
