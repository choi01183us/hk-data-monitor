// Offline Macau teaching places. Coordinates: MGTO individual place pages.
// Projected once using the matching macau-geography.json frame; no network requests.
export const macauPlaceSource = Object.freeze({
  "source_zh": "澳門特別行政區政府旅遊局",
  "source_url": "https://www.macaotourism.gov.mo/zh-hant/sightseeing",
  "verified_at": "2026-09-09",
  "note": "六個地點為本站課堂選例，並非官方排名或完整名錄。只短述事實及引用景點定位，沒有重製官方圖片或地圖；source_updated_at 是網頁資料更新日，不是坐標測量日期。",
  "location_fields": "景點頁 window.__INITIAL_STATE__.sightmap.entities.zh-hant[route].coordinate，次序為經度、緯度。",
  "projection_data": "../data/macau-geography.json"
});

export const macauPlaceTypes = Object.freeze([
  {
    "id": "culture",
    "label": "文化與古蹟"
  },
  {
    "id": "urban",
    "label": "城市與旅遊"
  },
  {
    "id": "nature",
    "label": "自然教育"
  },
  {
    "id": "transport",
    "label": "社區交通"
  }
].map((type) => Object.freeze(type)));

export const macauPlaces = Object.freeze([
  {
    "id": "st-pauls",
    "label": "大三巴牌坊",
    "region_id": "peninsula",
    "region": "澳門半島",
    "type": "culture",
    "x": 356.19,
    "y": 127.53,
    "longitude": 113.54086971865576,
    "latitude": 22.197486389830942,
    "source_url": "https://www.macaotourism.gov.mo/zh-hant/sightseeing/churches/ruins-of-st-pauls",
    "source_zh": "澳門特別行政區政府旅遊局",
    "description": "聖保祿學院附屬教堂留下的正面前壁，呈現澳門中西文化交流的歷史。",
    "question": "古蹟附近同時有居民、商店與旅客，保育及行人空間應如何分配資源？",
    "location_source_url": "https://www.macaotourism.gov.mo/zh-hant/sightseeing/churches/ruins-of-st-pauls",
    "location_name": "聖保祿學院天主之母教堂遺址（大三巴牌坊、前地及石階）",
    "location_note": "沿用旅遊局景點網頁的經緯度定位，表示景點位置，不表示入口、範圍或測量控制點。",
    "source_updated_at": "2026-07-08",
    "verified_at": "2026-09-09"
  },
  {
    "id": "a-ma-temple",
    "label": "媽閣廟",
    "region_id": "peninsula",
    "region": "澳門半島",
    "type": "culture",
    "x": 316.32,
    "y": 178.39,
    "longitude": 113.53125040870964,
    "latitude": 22.186125134171505,
    "source_url": "https://www.macaotourism.gov.mo/zh-hant/sightseeing/macao-world-heritage/a-ma-temple",
    "source_zh": "澳門特別行政區政府旅遊局",
    "description": "位於澳門半島西南的廟宇，是澳門歷史城區的文化遺產之一。",
    "question": "宗教場所也是旅遊景點時，怎樣兼顧使用者、保育與交通需要？",
    "location_source_url": "https://www.macaotourism.gov.mo/zh-hant/sightseeing/macao-world-heritage/a-ma-temple",
    "location_name": "媽祖閣（媽閣廟）",
    "location_note": "沿用旅遊局景點網頁的經緯度定位，表示景點位置，不表示入口、範圍或測量控制點。",
    "source_updated_at": "2025-07-29",
    "verified_at": "2026-09-09"
  },
  {
    "id": "taipa-houses",
    "label": "龍環葡韻",
    "region_id": "taipa",
    "region": "氹仔",
    "type": "culture",
    "x": 435.31,
    "y": 321.79,
    "longitude": 113.55995799593398,
    "latitude": 22.154085620126637,
    "source_url": "https://www.macaotourism.gov.mo/zh-hant/sightseeing/museums-and-galleries/taipa-houses",
    "source_zh": "澳門特別行政區政府旅遊局",
    "description": "氹仔海邊馬路的葡式住宅群，透過展覽呈現土生葡人生活與文化。",
    "question": "舊建築活化作文化設施，哪些教育與社區效益值得評估？",
    "location_source_url": "https://www.macaotourism.gov.mo/zh-hant/sightseeing/museums-and-galleries/taipa-houses",
    "location_name": "龍環葡韻",
    "location_note": "沿用旅遊局景點網頁的經緯度定位，表示景點位置，不表示入口、範圍或測量控制點。",
    "source_updated_at": "2023-03-07",
    "verified_at": "2026-09-09"
  },
  {
    "id": "cotai-spectacle",
    "label": "路氹・視博廣場",
    "region_id": "cotai",
    "region": "路氹",
    "type": "urban",
    "x": 469.72,
    "y": 358.07,
    "longitude": 113.56826,
    "latitude": 22.14598,
    "source_url": "https://www.macaotourism.gov.mo/zh-hant/sightseeing/other-attractions/the-spectacle-at-mgm-cotai",
    "source_zh": "澳門特別行政區政府旅遊局",
    "description": "美獅美高梅酒店內展示數碼藝術的室內廣場，結合藝術與旅遊設施。",
    "question": "綜合度假村帶來哪些交通、就業與公共空間需求？需要甚麼資料作判斷？",
    "location_source_url": "https://www.macaotourism.gov.mo/zh-hant/sightseeing/other-attractions/the-spectacle-at-mgm-cotai",
    "location_name": "美獅美高梅視博廣場",
    "location_note": "沿用旅遊局景點網頁的經緯度定位，表示景點位置，不表示入口、範圍或測量控制點。",
    "source_updated_at": "2021-12-11",
    "verified_at": "2026-09-09"
  },
  {
    "id": "panda-pavilion",
    "label": "澳門大熊貓館",
    "region_id": "coloane",
    "region": "路環",
    "type": "nature",
    "x": 431.14,
    "y": 444.55,
    "longitude": 113.558951,
    "latitude": 22.126654,
    "source_url": "https://www.macaotourism.gov.mo/zh-hant/sightseeing/other-attractions/macao-giant-panda-pavilion",
    "source_zh": "澳門特別行政區政府旅遊局",
    "description": "位於路環石排灣郊野公園，設有動物照護、展示及自然教育設施。",
    "question": "自然教育設施的成效，除了入場人次，還應觀察哪些保育與教育成果？",
    "location_source_url": "https://www.macaotourism.gov.mo/zh-hant/sightseeing/other-attractions/macao-giant-panda-pavilion",
    "location_name": "澳門大熊貓館和珍稀動物館",
    "location_note": "沿用旅遊局景點網頁的經緯度定位，表示景點位置，不表示入口、範圍或測量控制點。",
    "source_updated_at": "2024-08-21",
    "verified_at": "2026-09-09"
  },
  {
    "id": "coloane-pier",
    "label": "路環碼頭",
    "region_id": "coloane",
    "region": "路環",
    "type": "transport",
    "x": 393.29,
    "y": 478.37,
    "longitude": 113.54982158948525,
    "latitude": 22.119093564985107,
    "source_url": "https://www.macaotourism.gov.mo/zh-hant/sightseeing/other-attractions/coloane-pier",
    "source_zh": "澳門特別行政區政府旅遊局",
    "description": "昔日供往返澳門半島及氹仔的小輪停泊，可用來觀察道路發展如何改變社區交通。",
    "question": "新道路與橋樑出現後，舊交通設施及周邊商業可以怎樣轉變？",
    "location_source_url": "https://www.macaotourism.gov.mo/zh-hant/sightseeing/other-attractions/coloane-pier",
    "location_name": "路環碼頭",
    "location_note": "沿用旅遊局景點網頁的經緯度定位，表示景點位置，不表示入口、範圍或測量控制點。",
    "source_updated_at": "2021-10-21",
    "verified_at": "2026-09-09"
  }
].map((place) => Object.freeze(place)));
