// 全站層面嘅中繼資料計算。
//
// 抽出嚟做一個純函數(唔係留喺 postbuild.mjs 入面),係為咗測得到 ——
// postbuild.mjs 一 import 就會執行,冇得淨係攞佢條邏輯出嚟驗。

/**
 * 離線橫額採用已發布且有數據的統計快照中最早的 updated_at（數據截至日）。
 * 呼叫者先用 selectPublishedIndicators 配對實際建置附件；此處唔判斷發布狀態。
 * 未填數的 manual／全 null 快照不計入；已填的 manual 同 API 一樣計入。
 * 各指標真正統計期仍需讀該卡，唔可由此推斷全部資料同時期。
 * @param {object[]} docs 已發布指標文件
 * @returns {string|null} YYYY-MM-DD，無可用數據就 null
 */
export function pickDataAsOf(docs) {
  return docs
    .filter(isDisplayed)
    .map((doc) => doc.updated_at)
    .filter((date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort()
    .at(0) ?? null;
}

/** 指標有冇可供頁面顯示的數值？唔決定它屬於哪個城市或頁面。 */
export function isDisplayed(doc) {
  if (doc?.manual_status === "todo") return false;
  return Array.isArray(doc?.series) && doc.series.some((point) => point?.value !== null && point?.value !== undefined);
}

/**
 * 只取 Framework 真正輸出到 dist 的指標附件所對應的快照。
 * 草稿頁的資料仍留在 repo，唔應拉低公開網站的離線截至日。
 * 路徑來自 postbuild.walk()，格式係 ./_file/data/<id>.<8 位 hash>.json。
 * 新增或重新發布任何城市／指標都由實際附件決定，唔釘死城市名單。
 */
export function selectPublishedIndicators(docs, paths) {
  const ids = new Set(paths.flatMap((path) => {
    const match = /^\.\/_file\/data\/([a-z][a-z0-9_]*)\.[a-f0-9]{8}\.json$/.exec(path);
    return match ? [match[1]] : [];
  }));
  return docs.filter((doc) => ids.has(doc.indicator_id));
}
