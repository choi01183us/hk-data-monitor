// Browser-side views use the saved snapshot and the device clock; no network access.
export function citySnapshotIsOld(doc, now = Date.now()) {
  const currentTime = typeof now === "number" ? now : Date.parse(now);
  const fetchedTime = Date.parse(doc?.fetched_at);
  if (!Number.isFinite(currentTime) || !Number.isFinite(fetchedTime)) {
    throw new TypeError("城市快照年齡需要有效的擷取時間及目前時間");
  }
  const oldAge = currentTime - fetchedTime > 6 * 3600_000;
  // 香港日期比 UTC 快 8 小時；減一天後才取日期，處理午夜、跨年及閏年。
  const previousHongKongDate = new Date(currentTime + 8 * 3600_000 - 24 * 3600_000).toISOString().slice(0, 10);
  const oldDate = doc.kind === "flights" && doc.requested_date !== previousHongKongDate;
  return Boolean(doc.build?.stale) || oldAge || oldDate;
}

const compact = (value) => value.replace(/\s/g, "").toUpperCase();

export function filterFlightRecords(records, direction, query = "") {
  if (!Array.isArray(records) || !["arrival", "departure"].includes(direction) || typeof query !== "string") {
    throw new TypeError("航班篩選需要紀錄陣列、抵離港方向及文字查詢");
  }
  const needle = compact(query);
  // Filter creates a new array; sorting must never reorder the saved records.
  const filtered = records.filter((record) => record.direction === direction && (
    !needle || record.airports.some((airport) => compact(airport).includes(needle)) ||
    record.flights.some((flight) => compact(flight.no).includes(needle))
  ));
  return filtered.sort((a, b) => a.time.localeCompare(b.time));
}
