// Curated teaching locations, not administrative districts or statutory zoning.
// Points use Lands Department PLACANNO label anchors; see docs/香港地點.md.
// No live positions, activity counts, area boundaries or external browser requests.
export const placeTypes = Object.freeze([
  Object.freeze({id: "business", label: "商業與就業"}),
  Object.freeze({id: "transport", label: "機場與港口"}),
  Object.freeze({id: "countryside", label: "郊野與保育"})
]);

const locationSource = "https://portal.csdi.gov.hk/csdi-webpage/dataset/landsd_rcd_1637221775627_85634";

export const hongKongPlaces = Object.freeze([
  {
    id: "central", label: "中環", type: "business", x: 475.43, y: 366.75,
    source_url: "https://www.had-cwdo.gov.hk/tc/introduce-to-CWD.html",
    source_zh: "中西區民政事務處",
    description: "從中環的商業及金融活動，連繫香港的就業與公共交通。",
    question: "改善商業區步行環境，會令哪些上班族、居民及商戶受惠？",
    location_label: "中環", location_object_id: 1924
  },
  {
    id: "tsim-sha-tsui", label: "尖沙咀", type: "business", x: 489.74, y: 348.34,
    source_url: "https://www.discoverhongkong.com/content/dam/dhk/intl/plan/traveller-info/e-guidebooks/tsim-sha-tsui-tc.pdf",
    source_zh: "香港旅遊發展局",
    description: "文化設施、商場與旅遊活動並存，可連繫零售、旅遊及社區需要。",
    question: "推廣旅遊時，怎樣同時衡量本地商戶得益及居民的生活環境？",
    location_label: "尖沙咀", location_object_id: 2203
  },
  {
    id: "kwun-tong", label: "觀塘", type: "business", x: 547.97, y: 333.36,
    source_url: "https://www.ekeo.gov.hk/tc/smart-green-resilient-cbd/index.html",
    source_zh: "發展局起動九龍東辦事處",
    description: "九龍東商業轉型的一個觀察點，可連繫舊工業區、就業及公共空間。",
    question: "改善行人連接與海濱設施，應用甚麼證據決定資源先後？",
    location_label: "觀塘", location_object_id: 189
  },
  {
    id: "kowloon-bay", label: "九龍灣", type: "business", x: 533.13, y: 318.3,
    source_url: "https://www.ekeo.gov.hk/tc/smart-green-resilient-cbd/index.html",
    source_zh: "發展局起動九龍東辦事處",
    description: "從九龍灣商貿區的步行環境及智慧城市措施，思考商業發展與日常生活。",
    question: "科技試驗怎樣由展示變成市民用得到的服務？",
    location_label: "九龍灣", location_object_id: 2244
  },
  {
    id: "airport", label: "香港國際機場", type: "transport", x: 192.58, y: 316.89,
    source_url: "https://www.hongkongairport.com/tc/about-us/",
    source_zh: "香港機場管理局",
    description: "以赤鱲角作機場定位，連繫航空客貨運、旅遊與對外貿易。",
    question: "評估航空相關投資，除航班數量外，還需要哪些就業及環境資料？",
    location_label: "赤鱲角", location_object_id: 1508
  },
  {
    id: "kwai-tsing-port", label: "葵青貨櫃碼頭", type: "transport", x: 427.81, y: 301.36,
    source_url: "https://www.mardep.gov.hk/tc/materials-and-publications/publications/hk-fact-sheet/index.html",
    source_zh: "海事處",
    description: "從貨櫃碼頭連繫進出口、轉運、物流工作及港口設施。",
    question: "貨櫃吞吐量與貨物貿易金額有甚麼不同？改善港口應先了解哪一項？",
    location_label: "葵青貨櫃碼頭", location_object_id: 120
  },
  {
    id: "tai-mo-shan", label: "大帽山", type: "countryside", x: 439.44, y: 211.5,
    source_url: "https://www.afcd.gov.hk/tc_chi/country/cou_vis/cou_vis_cou/cou_vis_cou_tms/cou_vis_cou_tms.html",
    source_zh: "漁農自然護理署",
    description: "以大帽山作郊野公園定位，連繫自然教育、康樂設施及生態保育。",
    question: "山徑及郊遊設施的維修費，應怎樣與保育需要一齊考慮？",
    location_label: "大帽山", location_object_id: 436
  },
  {
    id: "sai-kung-east", label: "西貢東・北潭凹", type: "countryside", x: 676.86, y: 199.16,
    source_url: "https://www.afcd.gov.hk/tc_chi/country/cou_vis/cou_vis_cou/cou_vis_cou_ske/cou_vis_cou_ske.html",
    source_zh: "漁農自然護理署",
    description: "北潭凹是西貢東郊野公園一帶的代表地點，可連繫郊遊交通及環境保護。",
    question: "增加郊遊配套時，如何兼顧使用需要、交通與生態承受能力？",
    location_label: "北潭凹", location_object_id: 285
  },
  {
    id: "lantau-south", label: "南大嶼・鳳凰山", type: "countryside", x: 204.2, y: 410.5,
    source_url: "https://www.afcd.gov.hk/tc_chi/country/cou_vis/cou_vis_cou/cou_vis_cou_ls/cou_vis_cou_ls.html",
    source_zh: "漁農自然護理署",
    description: "以南大嶼郊野公園內的鳳凰山定位，連繫自然保育、康樂及戶外教育。",
    question: "郊野康樂與保育措施的成效，可以用哪些資料追蹤？",
    location_label: "鳳凰山", location_object_id: 627
  }
].map((place) => Object.freeze({
  ...place,
  location_source_url: locationSource,
  verified_at: "2026-09-09"
})));
