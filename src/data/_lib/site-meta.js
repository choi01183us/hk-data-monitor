// 全站層面嘅中繼資料計算。
//
// 抽出嚟做一個純函數(唔係留喺 postbuild.mjs 入面),係為咗測得到 ——
// postbuild.mjs 一 import 就會執行,冇得淨係攞佢條邏輯出嚟驗。

/**
 * 離線橫額要顯示嘅「數據截至」日期。
 *
 * 規則:**只計首頁真係顯示緊嘅指標**,取當中最舊嗰個 `updated_at`。
 *
 * 點解唔係「全部快照最舊嗰個」:
 *   實測撞到 —— 橫額顯示「數據截至 2026 年 2 月 25 日」,但嗰個日期嚟自
 *   `public_expenditure_policy_groups`,一個 `manual_status: "todo"`、
 *   一個數都冇填、首頁根本唔會顯示嘅指標。學生見到嘅 11 個指標入面,
 *   最舊嗰個其實係 2026-03-23。即係橫額報咗一個同畫面無關嘅日期。
 *
 * 點解唔係「排除全部 manual」:
 *   填咗數之後嗰個指標就會出現喺首頁,嗰陣佢就**應該**計入。
 *   條件係「有冇顯示」,唔係「邊種 acquisition」。
 *
 * 取最舊唔取最新:橫額係一句保守嘅聲明 ——「你而家睇緊嘅嘢,最舊嘅去到呢日」。
 * 報最新會令人以為全部數都咁新。
 *
 * @param {object[]} docs  全部指標文件
 * @returns {string|null}  YYYY-MM-DD,冇一個指標顯示緊就 null
 */
export function pickDataAsOf(docs) {
  return docs
    .filter(isDisplayed)
    .map((doc) => doc.updated_at)
    .filter((date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort()
    .at(0) ?? null;
}

/**
 * 呢個指標首頁會唔會顯示?
 *
 * 同 src/index.md 嘅過濾條件係同一套。兩邊唔一致嘅話,橫額就會報一個
 * 畫面上見唔到嘅指標嘅日期 —— 呢個就係一開始出事嗰個成因。
 */
export function isDisplayed(doc) {
  if (doc?.manual_status === "todo") return false;
  return Array.isArray(doc?.series) && doc.series.some((point) => point?.value !== null && point?.value !== undefined);
}
