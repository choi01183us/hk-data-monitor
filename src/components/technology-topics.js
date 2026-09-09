import {t} from "./locale.js";
// 人手策劃嘅閱讀路線，只建立問題同連結；唔計相關系數、合併數據或推斷因果。
// 外部來源已於 2026-09-08 核對。數字由各指標原始快照提供，唔抄入呢個檔。
export const technologySources = {
  research: {
    institution: t("政府統計處", "Census and Statistics Department"), title: t("研究及發展統計", "Research and development statistics"),
    url: "https://www.censtatd.gov.hk/tc/scode580.html",
    detail: t("延伸查研發活動、執行機構同資金來源，分清邊個做研究、邊個出錢。", "Explore R&D activities, performing sectors and funding sources. Distinguish who conducts the research from who pays for it."),
  },
  internet: {
    institution: t("政府統計處", "Census and Statistics Department"), title: t("資訊科技的使用", "Use of information technology"),
    url: "https://www.censtatd.gov.hk/tc/scode590.html",
    detail: t("查住戶、個人及企業使用情況；各類統計嘅調查對象同分母不同。", "Check household, individual and business use. These surveys cover different populations and use different denominators."),
  },
  inclusion: {
    institution: t("數字政策辦公室", "Digital Policy Office"), title: t("資訊科技使用調查", "Surveys on IT usage"),
    url: "https://www.digitalpolicy.gov.hk/tc/about_us/facts/it_usage_penetration_survey.html",
    detail: t("沿住戶及企業原報告追查分組資料，留意每份報告嘅調查年份。", "Follow the original household and business reports for breakdowns, and check the survey year in each report."),
  },
  skills: {
    institution: t("職業訓練局", "Vocational Training Council"), title: t("創科人力與技能", "Innovation and technology workforce and skills"),
    url: "https://manpower-survey.vtc.edu.hk/tc/industry/innovation-and-technology",
    detail: t("查技能、職位空缺及入職要求；先辨認調查年份，將預測同實際僱員數分開。", "Check skills, vacancies and entry requirements. Identify the survey year and distinguish forecasts from actual employment."),
  },
  funding: {
    institution: t("創新科技署", "Innovation and Technology Commission"), title: t("創科基金年度核准資助", "Annual funding approved by the Innovation and Technology Fund"),
    url: "https://www.itf.gov.hk/tc/itf-statistics/index-4.html",
    detail: t("了解獲批資助；核准金額唔等於當年現金支出，亦唔涵蓋所有創科資助計劃。", "Explore approved funding. Approval amounts are not cash expenditure in that year and do not cover every innovation funding programme."),
  },
  ai: {
    institution: t("香港特別行政區政府", "Hong Kong Special Administrative Region Government"), title: t("2026–27 預算案：人工智能+", "2026–27 Budget: AI+"),
    url: "https://www.budget.gov.hk/2026/chi/budget07.html",
    detail: t("查政策目標、應用同培訓安排；將建議、撥款承諾、執行情況同成效分開。", "Read policy objectives, applications and training arrangements. Distinguish proposals, funding commitments, implementation and outcomes."),
  },
};

export const technologyTopics = [
  {
    id: "research", label: t("研發與青年", "R&D and young people"), tag: t("研究投入 × 青年機會", "Research spending × Youth opportunities"),
    title: t("研究做多咗，青年點樣參與？", "How can young people take part in growing research activity?"),
    intro: t("先睇本地研發投入，再了解青年求職環境。兩者可以幫你提出培訓問題，但未能單靠走勢判斷一項計劃有冇效。", "Start with local R&D spending, then consider the job market for young people. Together they can suggest training questions, but trends alone cannot establish whether a programme works."),
    indicators: ["rd_expenditure", "unemployment"],
    caveat: t("研發開支包括企業、高校同政府等機構；失業率卡顯示全港整體，點入可睇青年分類。兩項唔係同一群人嘅投入與成果。", "R&D expenditure covers businesses, higher education and government, among others. The unemployment card shows Hong Kong overall; open it for youth categories. These are not inputs and outcomes for the same group of people."),
    connections: [
      { label: t("科技觀察", "Technology observations"), question: t("研發資源規模點變？", "How is the scale of research resources changing?"), links: [[t("本地研發總開支", "Gross domestic expenditure on R&D"), "rd_expenditure"]] },
      { label: t("市民需要", "People's needs"), question: t("青年求職同技能需要係乜？", "What job-search and skills support do young people need?"), links: [[t("整體與青年失業率", "Overall and youth unemployment rates"), "unemployment"], [t("全港工資背景", "Hong Kong wage context"), "median_wage"]] },
      { label: t("財政取捨", "Budget choices"), question: t("實習或培訓應支援邊啲人？", "Who should receive placement or training support?"), links: [[t("資源分配與取捨", "Resource allocation and trade-offs"), "../learn/public-finance"]] },
    ],
    sources: ["research", "skills"],
    proposal: t("可以研究：支援青年參與研究實習或技能培訓。", "Possible enquiry: support young people to take part in research placements or skills training."),
    missing: t("仲要查課程成本、參加者背景、完成後就業情況；全港工資唔代表科技業薪酬。", "Also investigate course costs, participants' backgrounds and employment after completion. Hong Kong-wide wages do not represent technology-sector pay."),
    outcome: t("成效點驗：按相同追蹤時間，睇參加者完成培訓及進入相關工作嘅情況，並交代其他可能影響因素。", "Assess outcomes over the same follow-up period: training completion and entry into related work. Explain other factors that may affect the results."),
  },
  {
    id: "inclusion", label: t("數碼共融", "Digital inclusion"), tag: t("家居上網 × 家庭資源", "Home internet × Household resources"),
    title: t("服務搬上網，邊啲人需要支援？", "Who needs support when services move online?"),
    intro: t("將家居上網情況同住戶收入並排閱讀，再到分組調查查證邊啲人遇到困難。網絡接駁、設備同使用能力係不同問題。", "Read home internet access alongside household income, then use survey breakdowns to identify who faces difficulties. Connections, devices and the ability to use them are separate issues."),
    indicators: ["household_internet", "household_income"],
    caveat: t("全港住戶上網率同入息中位數唔會話畀你知低收入住戶嘅上網率；唔可以由兩個全港數字推算群組差距。", "Hong Kong-wide household internet access and median income do not tell you the internet access rate of low-income households. Two overall figures cannot establish gaps between groups."),
    connections: [
      { label: t("科技觀察", "Technology observations"), question: t("家中有冇網絡接駁？", "Is there an internet connection at home?"), links: [[t("住戶上網率", "Household internet access rate"), "household_internet"]] },
      { label: t("市民需要", "People's needs"), question: t("設備、費用、操作邊樣有困難？", "Are devices, costs or skills causing difficulties?"), links: [[t("住戶入息背景", "Household income context"), "household_income"], [t("香港生活路線", "Hong Kong living conditions pathway"), "../learn/hong-kong"]] },
      { label: t("財政取捨", "Budget choices"), question: t("設備支援定面對面服務更合適？", "Would device support or face-to-face services help more?"), links: [[t("資源分配與取捨", "Resource allocation and trade-offs"), "../learn/public-finance"]] },
    ],
    sources: ["internet", "inclusion"],
    proposal: t("可以研究：設備借用、數碼技能支援，或保留面對面辦事渠道。", "Possible enquiry: device lending, digital skills support or retaining face-to-face service channels."),
    missing: t("仲要查年齡及入息分組、設備是否足夠、實際辦事困難；唔向同學收集私人家庭資料。", "Also check age and income groups, whether devices are adequate, and actual difficulties using services. Do not collect classmates' private household information."),
    outcome: t("成效點驗：睇目標使用者能否完成所需服務、需要幾多協助，同線下渠道是否仍然可用。", "Assess whether intended users can complete the service, how much help they need, and whether offline channels remain available."),
  },
  {
    id: "ai-work", label: t("AI與工作", "AI and work"), tag: t("技能轉變 × 就業背景", "Changing skills × Employment context"),
    title: t("AI 應用增加，培訓應該教啲乜？", "As AI use grows, what should training teach?"),
    intro: t("先讀官方人力與政策資料，辨認所需技能，再用就業及工資數據了解整體背景。提出可檢驗嘅問題，唔預先假定 AI 必然增加或減少職位。", "Read official workforce and policy information to identify skills, then use employment and wage data for context. Ask testable questions without assuming AI must increase or reduce jobs."),
    indicators: ["unemployment", "median_wage"],
    caveat: t("呢兩張係全港就業背景，並非 AI 行業指標。失業率或工資變動有多種原因，唔能夠單靠佢哋斷言 AI 造成。", "These two cards describe employment across Hong Kong, not the AI sector. Unemployment and wages change for many reasons; neither establishes that AI caused the change."),
    connections: [
      { label: t("技能問題", "Skills questions"), question: t("實際工作需要邊種新技能？", "Which new skills do real jobs require?"), links: [[t("科技行業資料入口", "Technology industry sources"), "#official-resources"]] },
      { label: t("市民需要", "People's needs"), question: t("在職人士同求職青年需要一樣？", "Do workers and young jobseekers need the same support?"), links: [[t("整體與青年失業率", "Overall and youth unemployment rates"), "unemployment"], [t("工資中位數", "Median wage"), "median_wage"]] },
      { label: t("財政取捨", "Budget choices"), question: t("培訓點配合工作同照顧時間？", "How can training fit around work and caring responsibilities?"), links: [[t("寫青年預算備忘", "Write a youth budget memo"), "../learn/budget-memo"]] },
    ],
    sources: ["skills", "ai"],
    proposal: t("可以研究：配合實際職務嘅 AI 基礎培訓，涵蓋核查輸出同保護資料。", "Possible enquiry: basic AI training linked to real tasks, including checking outputs and protecting information."),
    missing: t("仲要查僱主技能要求、培訓對象及上課時間；人力需求預測、空缺同已就業人數要分開。", "Also investigate employers' skill requirements, intended participants and class times. Distinguish workforce forecasts, vacancies and people already employed."),
    outcome: t("成效點驗：用具體工作任務評估技能，追蹤能否應用所學，唔只數有幾多人報名。", "Assess skills through concrete work tasks and follow up their use. Do more than count enrolments."),
  },
  {
    id: "funding", label: t("創科與財政", "Innovation and public finance"), tag: t("研究投入 × 資源取捨", "Research spending × Resource choices"),
    title: t("支持創新，點安排長期資源？", "How can innovation receive sustainable support?"),
    intro: t("研發統計描述全港投入，財政儲備描述政府結餘。再查個別資助同預算措施，分清誰出錢、款項點用，同往後點維持。", "R&D statistics describe spending across Hong Kong; fiscal reserves describe the Government's balance. Check specific grants and Budget measures to establish who pays, how funds are used and how support continues."),
    indicators: ["rd_expenditure", "fiscal_reserves"],
    caveat: t("兩者都以港元表示，但研發開支係一年投入、儲備係月末結餘，時期同範圍不同。研發開支唔係政府科技預算，兩者唔適合直接相減或計『可用幾年』。", "Both are expressed in Hong Kong dollars, but R&D expenditure is annual spending and reserves are a month-end balance. Their periods and coverage differ. R&D is not the Government's technology budget; subtracting the two or calculating how many years reserves would last is inappropriate."),
    connections: [
      { label: t("科技觀察", "Technology observations"), question: t("全港研發投入包括邊啲機構？", "Which sectors contribute to Hong Kong's R&D spending?"), links: [[t("本地研發總開支", "Gross domestic expenditure on R&D"), "rd_expenditure"]] },
      { label: t("資金背景", "Funding context"), question: t("一次性試驗之後點繼續？", "What happens after a one-off pilot?"), links: [[t("政府收入", "Government revenue"), "govt_revenue"], [t("財政儲備", "Fiscal reserves"), "fiscal_reserves"]] },
      { label: t("財政取捨", "Budget choices"), question: t("相對其他需要，點排優先？", "How should this rank alongside other needs?"), links: [[t("公共經常開支（先核對填數狀態）", "Recurrent public expenditure — check data completion first"), "public_expenditure_policy_groups"], [t("分餅學習路線", "Budget allocation pathway"), "../learn/public-finance"]] },
    ],
    sources: ["funding", "ai"],
    proposal: t("可以研究：先做小規模試驗，按成效再決定持續資助。", "Possible enquiry: start with a small pilot and decide on continuing funding using evidence of its results."),
    missing: t("仲要查具體項目嘅一次性及經常成本；基金核准資助唔等於當年實際支出，唔可以加進公共開支。", "Also check one-off and recurrent costs of the specific project. Approved grants are not actual expenditure in that year and must not be added to public expenditure."),
    outcome: t("成效點驗：先寫清受惠者、服務改善目標、檢討時間，同未達目標時點調整。", "Set out beneficiaries, service improvement goals, a review date and how to adjust the programme if targets are missed."),
  },
];
