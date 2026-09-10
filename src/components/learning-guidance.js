import {t} from "./locale.js";
// 教學讀法集中按 id 維護；只解釋現有指標，不載入其他數據或作政策成本估算。
import { html } from "npm:htl";

const guidance = {
  banking_institutions: {
    can: t("數清同一月末嘅持牌銀行、有限制牌照銀行同接受存款公司，認識牌照分類。", "Count licensed banks, restricted licence banks and deposit-taking companies at the same month end to understand the licensing categories."),
    cannot: t("機構數目唔係分行數目，亦唔代表存款、資產、就業或服務質素；人手快照唔係即時名單。", "Institution numbers are not branch numbers and do not show deposits, assets, employment or service quality. This manually recorded snapshot is not a live register."),
    question: t("若要評估市民使用銀行服務方唔方便，除機構數目，仲需要查咩？", "Besides institution numbers, what would you need to assess how easily people can use banking services?"),
  },
  money_supply: {
    can: t("分開睇香港 M1、M2、M3 所有貨幣折合港元嘅季末存量，理解現金、活期及其他存款嘅涵蓋範圍。", "Read Hong Kong's M1, M2 and M3 quarter-end stocks separately, in all currencies expressed in Hong Kong dollars, to understand coverage of cash, demand deposits and other deposits."),
    cannot: t("三者逐層包含，唔可相加；唔係只計香港居民、政府收入或可動用公帑。未經季節性調整，亦唔可單靠同向變動證明股價或通脹因果。", "These measures are nested and cannot be added. They are not limited to Hong Kong residents and are neither government revenue nor available public funds. They are not seasonally adjusted, and co-movement alone cannot establish effects on share prices or inflation."),
    question: t("若 M3 增加，點解唔能夠直接說政府有更多預算，或者預測股票一定會升？", "If M3 increases, why can you not conclude that the Government has more budget or that share prices will rise?"),
    routeHref: "../explore/finance",
  },
  cpi_components: {
    can: t("按同一月份比較九類綜合消費物價嘅按年變動，再追蹤單一類別嘅加價速度。", "Compare year-on-year changes in the nine Composite CPI sections for the same month, then track inflation in an individual section."),
    cannot: t("類別升幅唔係家庭開支佔比，亦唔係對整體通脹嘅貢獻。九個變動率唔可直接相加或平均；指數未剔除政府一次性紓困措施。", "Section inflation rates are neither household expenditure shares nor contributions to overall inflation. Do not add or average the nine rates. The index includes the effects of the Government's one-off relief measures."),
    question: t("若要支援某類生活開支，除加價幅度外，仲需要查受惠家庭花幾多錢、收入同已有支援嗎？", "When proposing support for a living cost, should you also check affected households' spending, income and existing support?"),
    routeHref: "../explore/living-cost",
  },
  private_domestic_price: {
    can: t("睇全港各類已落成私人住宅嘅二手售價指數走勢，了解買樓市場價格變化。", "Track the resale price index for all classes of completed private domestic premises across Hong Kong to understand changes in the home-purchase market."),
    cannot: t("唔包括一手樓，唔係每平方米售價、某個單位估價或每月供款；指數點數唔可除以收入推算置業負擔。", "It excludes first-hand sales and is not a price per square metre, a valuation of a particular flat or a monthly mortgage payment. Dividing index points by income does not measure affordability."),
    question: t("樓價變動對租客、準置業者同自住業主有咩唔同影響？提出房屋措施前仲欠咩資料？", "How do price changes affect tenants, prospective buyers and owner-occupiers differently? What evidence is missing before proposing a housing measure?"),
    routeHref: "../explore/living-cost",
  },
  private_domestic_rent: {
    can: t("睇全港各類私人住宅租金指數嘅長期變化，作為討論租住壓力嘅背景。", "Track long-term changes in the rent index for all classes of private domestic premises as context for rental pressures."),
    cannot: t("指數唔係月租港元，唔包括差餉及管理費，亦唔等同 CPI 住屋類別；全港指數唔代表個別家庭嘅租金負擔。", "The index is not monthly rent in dollars, excludes rates and management fees, and differs from the CPI housing section. A Hong Kong-wide index does not show an individual household's rent burden."),
    question: t("如果想提出租住支援，租金走勢以外，仲要了解住戶人數、收入、居住安排同邊啲現有措施？", "Beyond rental trends, what should you know about household size, income, living arrangements and existing measures before proposing rental support?"),
    routeHref: "../explore/living-cost",
  },
  district_population: {
    can: t("按同一年比較十八區陸上非住院人口，了解地區服務需求嘅規模背景。", "Compare the land-based non-institutional population of the 18 districts in the same year as context for the scale of local service needs."),
    cannot: t("呢個口徑唔係香港總人口估計，亦唔係人口密度；地區總人數唔能夠直接推算年齡、個別家庭需要或政府分區開支。", "This is neither the Hong Kong population estimate nor population density. District totals cannot directly establish ages, individual household needs or government spending by district."),
    question: t("建議某區增設服務時，人口以外，仲要查邊種年齡、交通同現有設施資料？", "When proposing a local service, which data on age, transport and existing facilities should you check alongside population?"),
    routeHref: "../explore/city",
  },
  district_household_income: {
    can: t("按同一年比較十八區家庭住戶每月入息中位數，討論地區生活背景。", "Compare median monthly domestic household income across the 18 districts in the same year to discuss local living conditions."),
    cannot: t("中位數唔係平均收入、個人月薪或財富；唔可以把各區中位數相加或平均，當成全港中位數。", "The median is not mean income, an individual's salary or wealth. Adding or averaging district medians does not produce Hong Kong's median."),
    question: t("兩區入息中位數唔同，住戶大小、居住成本同就業人數會點影響生活處境？", "When two districts have different median incomes, how might household size, housing costs and the number of earners affect living conditions?"),
    routeHref: "../explore/city",
  },
  goods_imports: {
    can: t("睇每月商品進口貨值嘅名義走勢，連繫香港對外貿易同物流活動。", "Track the nominal monthly value of merchandise imports and relate it to Hong Kong's external trade and logistics."),
    cannot: t("進口用到岸價，唔等於本地消費或政府收入；貨值唔係貨物重量，亦未扣除價格變化。月份相加未必等於之後修訂嘅年度總額。", "Imports use cost, insurance and freight (c.i.f.) values. They are not domestic consumption or government revenue. Value is not cargo weight and has not been adjusted for price changes. Adding months may differ from a subsequently revised annual total."),
    question: t("建議支援物流業之前，除貨值外，仲需要查邊啲就業、效率或環境資料？", "Besides trade value, what employment, efficiency or environmental evidence is needed before proposing logistics support?"),
    routeHref: "../explore/city",
  },
  goods_exports: {
    can: t("睇每月商品整體出口貨值，認識香港連繫外地市場嘅角色。", "Track the monthly value of total merchandise exports to understand Hong Kong's links with overseas markets."),
    cannot: t("整體出口包括港產品出口同轉口，採用離岸價；唔等於本地製造產值，唔可以同進口相加當成 GDP 或政府收入。", "Total exports include domestic exports and re-exports at free-on-board (f.o.b.) values. They are not local manufacturing output and cannot be added to imports to obtain GDP or government revenue."),
    question: t("出口增長會令哪些行業受惠？單靠貨值能否知道工人收入有冇改善？", "Which industries might benefit from export growth? Can trade value alone show whether workers' incomes have improved?"),
    routeHref: "../explore/city",
  },
  port_cargo: {
    can: t("睇港口每季處理貨物嘅總重量，連繫港口設施同物流需要。", "Track the total weight of cargo handled by the port each quarter and relate it to facilities and logistics needs."),
    cannot: t("貨物吞吐量唔係貨櫃數、船舶數或貿易金額，亦唔包括空運。全港總量唔代表葵青單一碼頭情況。", "Cargo throughput is not a count of containers or vessels, or a trade value; it excludes air cargo. The Hong Kong total does not show conditions at an individual Kwai Tsing terminal."),
    question: t("評估港口投資時，重量走勢以外，仲應點衡量效率、工作機會同環境成本？", "Besides cargo weight, how should a port investment be assessed for efficiency, jobs and environmental costs?"),
    routeHref: "../explore/city",
  },
  rd_expenditure: {
    can: t("睇本地研發投入嘅名義金額點變，分清企業、高校同政府等機構在香港進行嘅研發。", "Track nominal local R&D spending and distinguish research conducted in Hong Kong by businesses, higher education, government and other sectors."),
    cannot: t("本地研發總開支唔係政府科技預算，亦唔代表科研成果或青年就業增加。未扣除通脹，唔好將名義增幅當成實質增幅。", "Gross domestic expenditure on R&D is not the Government's technology budget, research outcomes or growth in youth employment. It has not been adjusted for inflation: nominal growth is not real growth."),
    question: t("提出研發或實習支援時，除咗投入金額，仲要查邊種技能、受惠者同成效證據？", "Before proposing research or placement support, what evidence on skills, beneficiaries and outcomes is needed alongside spending?"),
    routeHref: "../explore/technology",
  },
  household_internet: {
    can: t("睇住戶在家中接駁互聯網嘅比例，了解數碼服務所處嘅背景。", "Read the proportion of households with an internet connection at home as context for digital services."),
    cannot: t("有網絡接駁唔等於設備足夠、連線質素良好或識得使用；全港住戶比例亦唔代表個人上網率或各群組情況。", "A connection does not guarantee enough devices, good quality or the skills to use it. The overall household rate is not an individual usage rate or a breakdown by group."),
    question: t("建議公共服務數碼化之前，仲要查邊啲群組需要設備、操作或面對面支援？", "Before proposing digital public services, which groups may need equipment, skills or face-to-face support?"),
    routeHref: "../explore/technology",
  },
  population: {
    can: t("睇香港總人口喺唔同年份有幾多，作為理解服務需求規模嘅背景。", "Read Hong Kong's population in different years as context for the scale of service demand."),
    cannot: t("總人口冇拆年齡，單靠呢條線唔能夠判斷人口老化，亦唔能夠解釋人口變動原因。", "The total has no age breakdown. This line alone cannot establish population ageing or explain why the population changed."),
    question: t("如果想判斷長者服務需求有冇增加，總人口以外仲需要邊種資料？", "Besides total population, what information is needed to judge whether demand for older people's services has risen?"),
    route: "hong-kong",
  },
  unemployment: {
    can: t("比較整體同青年勞動人口嘅失業率，睇兩組走勢同差距。", "Compare unemployment rates in the overall and youth labour forces, looking at trends and gaps."),
    cannot: t("青年失業率唔係所有青年之中冇返工嘅比例；讀書而冇求職嘅青年唔因此算失業。差距本身亦未解釋原因。", "Youth unemployment is not the proportion of all young people without a job. A young person studying without looking for work is not unemployed on that basis. The gap alone does not explain its causes."),
    question: t("提出青年就業支援之前，仲要了解求職者面對邊啲困難？", "What difficulties faced by jobseekers should be understood before proposing youth employment support?"),
    route: "hong-kong",
  },
  median_wage: {
    can: t("睇工資分布中間位置隨年份點變，並分清所有僱員同全職僱員。", "Track the middle of the wage distribution over time and distinguish all employees from full-time employees."),
    cannot: t("中位數唔係每個人實收嘅工資，亦唔代表一個家庭嘅總入息；兩種受聘口徑唔可以隨意接成同一條走勢。", "The median is not everyone's take-home pay or a household's total income. The two employment definitions must not be joined arbitrarily into one series."),
    question: t("用呢個數為模擬角色寫收入背景時，角色嘅受聘性質同工作時數仲有咩要交代？", "When using this figure to describe a simulated character's income, what else should you explain about their employment type and working hours?"),
    route: "hong-kong",
  },
  household_income: {
    can: t("睇家庭住戶每月總入息嘅中位數，作為家庭資源嘅背景。", "Read median monthly total domestic household income as context for household resources."),
    cannot: t("住戶入息唔等於個人工資；住戶大小同就業人數唔同，單靠中位數唔能夠判斷每個家庭是否夠使。", "Household income is not an individual's wage. Household sizes and numbers of earners differ; the median alone cannot show whether every household has enough to live on."),
    question: t("兩個入息相同、但成員數目唔同嘅家庭，生活壓力可能有咩分別？", "How might living pressures differ for two households with the same income but different numbers of members?"),
    route: "hong-kong",
  },
  cpi: {
    can: t("睇綜合消費物價相對一年前嘅變動百分率，分清升價速度加快定放慢。", "Read the percentage change in the Composite CPI from a year earlier and distinguish faster from slower price increases."),
    cannot: t("通脹率回落唔一定代表物價下跌；綜合指數亦唔代表每個家庭嘅購物籃或個別商品價格。", "Falling inflation does not necessarily mean falling prices. The composite index does not represent every household's shopping basket or individual product prices."),
    question: t("如果通脹率回落但仍然為正，點解家庭仍可能覺得生活費愈來愈高？", "If inflation falls but remains positive, why might families still feel their living costs are rising?"),
    route: "hong-kong",
  },
  gdp: {
    can: t("睇以當時市價計算嘅人均經濟產出隨年份點變。", "Track per capita economic output at current market prices over time."),
    cannot: t("人均 GDP 唔係工資，亦唔係每人分到嘅收入；未扣除通脹，亦睇唔到收入點樣分布。", "GDP per capita is neither a wage nor income distributed to each person. It is not adjusted for inflation and does not show income distribution."),
    question: t("要評估市民生活有冇改善，除咗人均 GDP，仲會查邊啲生活數據？", "Beyond GDP per capita, which living conditions data would help assess whether people's lives have improved?"),
    route: "hong-kong",
  },
  four_key_industries: {
    can: t("睇四大行業增加價值佔 GDP 嘅比重同走勢，認識香港經濟結構。", "Read the four key industries' value added as shares of GDP and their trends to understand Hong Kong's economic structure."),
    cannot: t("比重唔係就業人數比例；比重下降亦唔一定代表該行業產出減少，因為整體 GDP 同時會變。", "A GDP share is not an employment share. A falling share need not mean lower industry output because total GDP also changes."),
    question: t("建議支援某個行業時，除咗 GDP 比重，仲要衡量邊啲就業或社會影響？", "Besides GDP share, which employment or social impacts should be assessed when proposing industry support?"),
    route: "hong-kong",
  },
  hkex_listings: {
    can: t("分開睇主板同 GEM 嘅上市公司數目，了解上市市場嘅公司數量。", "Read listed company numbers separately for the Main Board and GEM to understand the size of the listing market."),
    cannot: t("上市公司數目唔等於市值、就業人數或市民收入，單靠公司數目唔能夠判斷經濟好壞。", "Company numbers do not show market capitalisation, employment or people's income, and cannot alone establish how well the economy is doing."),
    question: t("兩個時期上市公司數目相若，金融市場狀況都可能唔同，仲需要查咩資料？", "Financial market conditions can differ even when company numbers are similar. What other data are needed?"),
    route: "hong-kong",
  },
  govt_expenditure: {
    can: t("睇政府經常開支喺教育、社會福利、衞生同其他類別嘅分配及歷年變化。", "Read the allocation and historical changes in recurrent government expenditure on education, social welfare, health and other categories."),
    cannot: t("呢度只計政府帳目，唔包括營運基金同房屋委員會，亦唔係全年開支總額；開支多咗本身未能證明服務改善。", "These are government accounts only, excluding Trading Funds and the Housing Authority, and not total annual expenditure. More spending alone does not prove better services."),
    question: t("如果想討論公共房屋資源，點解需要先轉到公共經常開支嘅口徑？", "Why should a discussion of public housing resources use recurrent public expenditure instead?"),
    route: "public-finance",
  },
  public_expenditure_policy_groups: {
    can: t("填齊數據後，可按同一公共口徑比較各政策組別嘅經常開支，同相鄰年度名義增減。", "Once the data are complete, compare recurrent spending across policy groups using the same public expenditure coverage, including nominal changes between adjacent years."),
    cannot: t("經常開支唔係全年公共開支總額；預算唔等於實際已用款項，名義增加亦未證明服務增加。政府開支已包括喺公共開支內，唔可以再相加或合圖。", "Recurrent expenditure is not total annual public expenditure. Estimates are not money already spent, and nominal increases do not prove more services. Government expenditure is already included in public expenditure: do not add them or combine them in one chart."),
    question: t("增加某範疇資源之前，你會用咩需要同成效證據，向其他範疇嘅同學解釋取捨？", "Before increasing resources for one area, what evidence of needs and outcomes would you use to explain the trade-offs to classmates representing other areas?"),
    route: "public-finance",
  },
  govt_revenue: {
    can: t("睇政府各類收入嘅規模同歷年變化，討論資金來源嘅穩定性。", "Read the scale and historical changes in government revenue categories and discuss the stability of funding sources."),
    cannot: t("預算收入唔保證一定收到；單靠收入亦計唔到財政盈餘，因為需要同年度、同口徑嘅完整收支資料。", "Estimated revenue is not guaranteed. Revenue alone cannot establish a fiscal surplus: complete revenue and expenditure figures for the same year and coverage are required."),
    question: t("如果一項服務要年年持續，揀資金來源時要考慮咩風險？", "What risks should you consider when choosing funding for a service that must continue every year?"),
    route: "public-finance",
  },
  fiscal_reserves: {
    can: t("睇某個月末財政儲備嘅結餘同變化，作為討論政府承受風險能力嘅背景。", "Read fiscal reserves at a particular month end and their changes as context for the Government's capacity to absorb risks."),
    cannot: t("儲備係某一時點嘅結餘，唔係一年收入；唔可以由儲備數字直接推斷有幾多錢可以長期用於新服務。", "Reserves are a balance at one point in time, not annual revenue. They do not directly establish how much can be spent sustainably on new services."),
    question: t("一次性措施同每年持續嘅服務，用儲備支持時有咩唔同考慮？", "How does using reserves for a one-off measure differ from funding a service that continues every year?"),
    route: "public-finance",
  },
  phr_waiting_time: {
    can: t("可分清三個已獲安排入住群組的平均輪候時間；長者一人係一般申請者的一部分，唔係可以另外相加的人數。", "Distinguish average waits for three groups of applicants who were housed. Elderly one-person applicants form part of general applicants, not an additional population to add."),
    cannot: t("唔同輪候定義唔可以接成一條趨勢；官方平均數亦唔保證今日新申請嘅個人會等相同時間。", "Different waiting-time definitions cannot be joined into a single trend. An official average does not guarantee that a new applicant today will wait the same length of time."),
    question: t("比較房屋措施成效之前，點樣確保兩個輪候數字講緊同一類申請者同住屋安排？", "Before comparing housing measures, how can you ensure both waiting-time figures refer to the same applicants and housing arrangements?"),
    route: "public-finance",
  },
};

const technologyRelated = new Set([
  "unemployment", "median_wage", "household_income", "population",
  "gdp", "four_key_industries", "govt_revenue", "fiscal_reserves", "public_expenditure_policy_groups",
]);

/** 每頁只傳自己嘅指標；待填狀態沿用正式 loader，唔將 null 當零。 */
export function learningGuidance(indicator) {
  const item = guidance[indicator.indicator_id];
  if (!item) return html`<div></div>`;
  const waiting = indicator.manual_status === "todo" || indicator.manual_status === "partial";
  return html`<section class="learning-guidance" aria-labelledby="reading-guide">
    <h2 id="reading-guide">${t("用呢個數建立論點", "Use this figure to build an argument")}</h2>
    ${waiting ? html`<p class="manual-notice">${indicator.manual_status === "todo" ? t("呢頁數據仍待填。", "Data on this page have not yet been entered.") : t("呢頁數據未填齊。", "Data on this page are incomplete.")}${t("未填唔代表零，暫時唔可以用未填部分作證據。", " Missing entries do not mean zero and cannot yet be used as evidence.")}</p>` : null}
    <p><strong>${t("可以看甚麼：", "What it can show: ")}</strong>${item.can}</p>
    <p class="learning-guidance__limits"><strong>${t("未能證明甚麼：", "What it cannot establish: ")}</strong>${item.cannot}</p>
    <p class="learning-guidance__question"><strong>${t("一齊討論：", "Discuss together: ")}</strong>${item.question}</p>
    <p><a href=${item.routeHref ?? `../learn/${item.route}`}>${t("繼續學習路線", "Continue the learning pathway")}</a> · <a href="../learn/budget-memo">${t("用證據寫青年預算備忘", "Use evidence in a youth budget memo")}</a></p>
    ${technologyRelated.has(indicator.indicator_id) ? html`<p><a href="../explore/technology">${t("連繫科技、生活與財政：探索相關資料", "Connect technology, daily life and public finance: explore related data")} <span aria-hidden="true">↗</span></a></p>` : null}
  </section>`;
}
