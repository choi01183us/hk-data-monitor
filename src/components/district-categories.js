// 統計處表 110-06811／130-06806 嘅 DC 次序；唔按字母或人口重排來源識別碼。
// 原表 Total 用空字串。地圖只連接以下 18 區，全港參考值另讀 series.category="全港"。
export const DISTRICT_CATEGORIES = Object.freeze([
  ["A", "中西區"], ["B", "灣仔區"], ["C", "東區"], ["D", "南區"],
  ["E", "油尖旺區"], ["F", "深水埗區"], ["G", "九龍城區"], ["H", "黃大仙區"],
  ["J", "觀塘區"], ["S", "葵青區"], ["K", "荃灣區"], ["L", "屯門區"],
  ["M", "元朗區"], ["N", "北區"], ["P", "大埔區"], ["R", "沙田區"],
  ["Q", "西貢區"], ["T", "離島區"],
].map(([code, label_zh]) => Object.freeze({ code, label_zh })));

export const DISTRICT_WITH_HK = Object.freeze([
  Object.freeze({ code: "", label_zh: "全港" }), ...DISTRICT_CATEGORIES,
]);
