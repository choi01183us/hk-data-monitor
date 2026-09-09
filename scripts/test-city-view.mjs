import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {citySnapshotIsOld, filterFlightRecords} from "../src/components/city-view.js";

export async function testCityView(check) {
  console.log("\n[城市快照畫面] 離線年齡、香港午夜及航班篩選自證");
  const at = (iso) => Date.parse(iso);
  const news = {kind: "news", fetched_at: "2026-09-09T00:00:00.000Z", build: {stale: false}};
  const flight = {kind: "flights", fetched_at: "2026-09-08T15:59:00.000Z", requested_date: "2026-09-07", build: {stale: false}};
  const sixHoursIsFresh = (fn) => fn(news, at("2026-09-09T06:00:00.000Z")) === false;
  const pastSixHoursIsOld = (fn) => fn(news, at("2026-09-09T06:00:00.001Z")) === true;
  const midnightIsOld = (fn) => fn(flight, at("2026-09-08T16:00:00.000Z")) === true;
  const oldBuildPersists = (fn) => fn({...news, build: {stale: true}}, at("2026-09-09T00:01:00.000Z")) === true;
  check("年齡已知答案：剛好六小時保持有效", sixHoursIsFresh(citySnapshotIsOld));
  check("年齡已知答案：六小時加一毫秒標舊", pastSixHoursIsOld(citySnapshotIsOld));
  check("香港日期已知答案：午夜前一毫秒仍然係同一日",
    citySnapshotIsOld(flight, at("2026-09-08T15:59:59.999Z")) === false);
  check("香港日期已知答案：午夜即時標舊，即使剛擷取一分鐘", midnightIsOld(citySnapshotIsOld));
  check("香港日期已知答案：元旦前一日係上年十二月三十一日",
    citySnapshotIsOld({kind: "flights", fetched_at: "2025-12-31T16:00:00.000Z", requested_date: "2025-12-31"}, at("2025-12-31T16:00:00.000Z")) === false);
  check("香港日期已知答案：閏年三月一日前一日係二月二十九日",
    citySnapshotIsOld({kind: "flights", fetched_at: "2024-02-29T16:00:00.000Z", requested_date: "2024-02-29"}, at("2024-02-29T16:00:00.000Z")) === false);
  check("離線多日：建置時未過期仍會按目前時間標舊", citySnapshotIsOld(news, at("2026-09-16T00:00:00.000Z")) === true);
  check("保留建置時已過期判斷，唔因裝置時鐘回退變新", oldBuildPersists(citySnapshotIsOld));
  check("新聞唔套用航班原定日期條件", citySnapshotIsOld({...news, requested_date: "1999-01-01"}, at(news.fetched_at)) === false);
  const newsBefore = JSON.stringify(news);
  citySnapshotIsOld(news, at("2026-09-16T00:00:00.000Z"));
  check("計算年齡唔寫回快照或建置 metadata", JSON.stringify(news) === newsBefore);
  const realNow = Date.now;
  try {
    Date.now = () => at("2026-09-16T00:00:00.000Z");
    check("省略 now 真正使用讀取當刻的裝置時鐘", citySnapshotIsOld(news) === true);
  } finally { Date.now = realNow; }
  const throws = (fn) => { try { fn(); return false; } catch { return true; } };
  check("無效擷取時間硬失敗，唔假裝新鮮", throws(() => citySnapshotIsOld({...news, fetched_at: "bad"}, at(news.fetched_at))));
  check("無效目前時間硬失敗，唔假裝新鮮", throws(() => citySnapshotIsOld(news, NaN)));

  const shared = {direction: "departure", time: "01:05", airports: ["LAX"], flights: [{no: "CX 880"}, {no: "AA 8933"}]};
  const records = [
    {direction: "departure", time: "23:55", airports: ["NRT"], flights: [{no: "JL 736"}]},
    {direction: "arrival", time: "00:05", airports: ["LAX"], flights: [{no: "CX 881"}]},
    {direction: "departure", time: "12:00", airports: ["HND", "TPE"], flights: [{no: "UO 622"}]},
    shared
  ];
  const sourceBefore = JSON.stringify(records);
  const sortedCorrectly = (fn) => fn(records, "departure").map((row) => row.time).join() === "01:05,12:00,23:55";
  const directionIsCorrect = (fn) => fn(records, "arrival").length === 1 && fn(records, "arrival")[0].direction === "arrival";
  const sharedIsSearchable = (fn) => {
    const rows = fn(records, "departure", "a a 8933");
    return rows.length === 1 && rows[0] === shared && rows[0].flights.length === 2;
  };
  const airportIsSearchable = (fn) => fn(records, "departure", "t p e").map((row) => row.time).join() === "12:00";
  const inputIsPreserved = (fn) => {
    const input = structuredClone(records);
    const before = JSON.stringify(input);
    fn(input, "departure");
    return JSON.stringify(input) === before;
  };
  const noMatchStaysEmpty = (fn) => fn(structuredClone(records), "departure", "NONE").length === 0;
  check("排序已知答案：倒序輸入按 01:05／12:00／23:55 排列", sortedCorrectly(filterFlightRecords));
  check("方向已知答案：抵港唔混入離港紀錄", directionIsCorrect(filterFlightRecords));
  check("搜尋已知答案：第二個共享編號忽略空格及大小寫，仍係一筆", sharedIsSearchable(filterFlightRecords));
  check("搜尋已知答案：機場陣列第二個代碼亦可搜尋", airportIsSearchable(filterFlightRecords));
  check("共享編號搜尋唔拆列或只保留命中編號", filterFlightRecords(records, "departure", "CX880")[0] === shared && shared.flights.length === 2);
  check("只有空白查詢等同全部同方向紀錄", filterFlightRecords(records, "departure", " \t\n").length === 3);
  check("沒有匹配維持零筆，唔補預設航班", filterFlightRecords(records, "departure", "NONE").length === 0);
  check("空快照輸入維持零筆", filterFlightRecords([], "departure").length === 0);
  check("篩選排序冇改輸入次序、紀錄或共享列表", JSON.stringify(records) === sourceBefore);
  check("結果係新陣列，未複製或拆散原始紀錄", filterFlightRecords(records, "departure") !== records && filterFlightRecords(records, "departure")[0] === shared);
  check("未提供的方向硬失敗", throws(() => filterFlightRecords(records, "both")));

  const dir = await mkdtemp(join(tmpdir(), "hkdm-city-view-"));
  const source = await readFile(new URL("../src/components/city-view.js", import.meta.url), "utf8");
  let sequence = 0;
  async function mutate(before, after) {
    if (source.split(before).length !== 2) throw new Error(`畫面源碼突變必須精確命中一次：${before}`);
    const file = join(dir, `mutation-${sequence++}.mjs`);
    await writeFile(file, source.replace(before, after));
    return import(pathToFileURL(file).href);
  }
  const detects = (oracle, fn) => { try { return !oracle(fn); } catch { return true; } };
  try {
    const boundary = await mutate("> 6 * 3600_000", ">= 6 * 3600_000");
    check("源碼突變：六小時界線提前一毫秒會被已知答案捉到", detects(sixHoursIsFresh, boundary.citySnapshotIsOld));
    const age = await mutate("|| oldAge || oldDate", "|| oldDate");
    check("源碼突變：只看 build 而忽略離線年齡會被捉到", detects(pastSixHoursIsOld, age.citySnapshotIsOld));
    const utc = await mutate("+ 8 * 3600_000", "+ 0 * 3600_000");
    check("源碼突變：用 UTC 日期會被香港午夜已知答案捉到", detects(midnightIsOld, utc.citySnapshotIsOld));
    const build = await mutate("Boolean(doc.build?.stale)", "false");
    check("源碼突變：抹走既有 stale 提示會被捉到", detects(oldBuildPersists, build.citySnapshotIsOld));
    const direction = await mutate("record.direction === direction", "true");
    check("源碼突變：混合抵離港會被方向測例捉到", detects(directionIsCorrect, direction.filterFlightRecords));
    const sorting = await mutate("return filtered.sort((a, b) => a.time.localeCompare(b.time));", "return filtered;");
    check("源碼突變：依賴上游次序會被倒序測例捉到", detects(sortedCorrectly, sorting.filterFlightRecords));
    const shares = await mutate("record.flights.some", "record.flights.slice(0, 1).some");
    check("源碼突變：只搜尋主航班會被第二個共享編號捉到", detects(sharedIsSearchable, shares.filterFlightRecords));
    const whitespace = await mutate('value.replace(/\\s/g, "").toUpperCase()', "value.toUpperCase()");
    check("源碼突變：唔忽略空白會被查詢已知答案捉到", detects(sharedIsSearchable, whitespace.filterFlightRecords));
    const airports = await mutate("record.airports.some", "record.airports.slice(0, 1).some");
    check("源碼突變：只搜尋第一機場會被陣列測例捉到", detects(airportIsSearchable, airports.filterFlightRecords));
    const inPlace = await mutate("const filtered = records.filter", "records.sort((a, b) => a.time.localeCompare(b.time));\n  const filtered = records.filter");
    check("源碼突變：先排序原始陣列會被不改輸入測例捉到", detects(inputIsPreserved, inPlace.filterFlightRecords));
    const fallback = await mutate("return filtered.sort", "return (filtered.length ? filtered : records).sort");
    check("源碼突變：無匹配時補回全部航班會被零筆測例捉到", detects(noMatchStaysEmpty, fallback.filterFlightRecords));
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}
