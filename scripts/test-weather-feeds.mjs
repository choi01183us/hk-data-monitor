import { mkdtemp, readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { UpstreamError } from "../src/data/_lib/http.js";
import {
  CITY_FIXTURE_DIR, CITY_SNAPSHOT_DIR, WEATHER_URL, parseWeather, fetchCitySnapshot,
  cityContentHash, validateCitySnapshot, cityBuildMetadata, readCitySnapshot,
  replayCitySnapshot, refreshCitySnapshots, loadCitySnapshot,
} from "../src/data/_lib/city-feeds.js";
import { WEATHER_ICONS, weatherState, weatherTemperature } from "../src/components/weather-state.js";

const clone = (value) => structuredClone(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const throws = (fn, type = Error) => { try { fn(); return false; } catch (error) { return error instanceof type; } };
async function rejects(fn, type = Error) { try { await fn(); return false; } catch (error) { return error instanceof type; } }
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fingerprint(directory) {
  const result = [];
  async function walk(path, prefix = "") {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix + entry.name, absolute = join(path, entry.name);
      if (entry.isDirectory()) await walk(absolute, relative + "/");
      else result.push([relative, digest(await readFile(absolute))]);
    }
  }
  await walk(directory);
  return JSON.stringify(result);
}
function reseal(doc) { doc.content_hash = cityContentHash(doc); return doc; }

export async function testWeatherFeeds(check) {
  console.log("\n[自動天氣] 官方標記、時效邊界、同次錄影及源碼突變");
  // Fixed answers, independently chosen from the official icon dictionary and
  // calendar arithmetic. They must not depend on the test machine's clock.
  const raw = {
    icon: [77], updateTime: "2024-03-01T08:00:00+08:00", iconUpdateTime: "2024-02-29T20:00:00+08:00",
    temperature: { recordTime: "2024-03-01T07:58:00+08:00", data: [
      { place: "京士柏", value: 19, unit: "C" },
      { place: "香港天文台", value: 27.625, unit: "C" },
    ] },
  };
  const report = "2024-03-01T00:00:00.000Z", captured = "2024-03-01T00:05:00.000Z";
  const good = await fetchCitySnapshot("weather", { now: captured, getJson: async (url) => {
    check("天氣只要求已釘死的繁體中文 rhrread 官方 URL", url === "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc" && url === WEATHER_URL);
    return { body: clone(raw) };
  } });
  const at = (doc, time = captured) => weatherState(doc, time);
  const withIcons = (icons) => { const doc = clone(good); doc.records[0].icons = icons; return reseal(doc); };
  const withTimes = (updated, fetched = captured) => {
    const doc = clone(good); doc.updated_at = updated; doc.records[0].report_updated_at = updated; doc.fetched_at = fetched; return reseal(doc);
  };
  check("天氣已知答案：香港 3/1 08:00 = UTC 3/1 00:00", parseWeather(raw).report_updated_at === report);
  check("天氣已知答案：香港閏日 20:00 = UTC 閏日 12:00", parseWeather(raw).icon_updated_at === "2024-02-29T12:00:00.000Z");
  check("天氣已知答案：香港新年 00:30 = UTC 上一年 12/31 16:30", parseWeather({ ...raw, updateTime: "2025-01-01T00:30:00+08:00" }).report_updated_at === "2024-12-31T16:30:00.000Z");
  check("天氣已知答案：負時區 2/29 23:30 -05:00 = UTC 3/1 04:30", parseWeather({ ...raw, updateTime: "2024-02-29T23:30:00-05:00" }).report_updated_at === "2024-03-01T04:30:00.000Z");
  check("天氣已知答案：保留來源毫秒，不捨入到整秒", parseWeather({ ...raw, updateTime: "2024-03-01T08:00:00.123+08:00" }).report_updated_at === "2024-03-01T00:00:00.123Z");
  check("天氣獨立保存整份報告、圖示與取得時刻", good.updated_at === report && good.fetched_at === captured && good.records[0].icon_updated_at === "2024-02-29T12:00:00.000Z");
  check("正常天氣快照通過 schema 及 content_hash", validateCitySnapshot(good).ok && cityContentHash(good) === good.content_hash);

  const temperatureExpected = { station: "香港天文台", value: 27.625, unit: "C", recorded_at: "2024-02-29T23:58:00.000Z" };
  check("溫度已知答案：取香港天文台第二列並完整保留小數，不取京士柏首列", equal(good.records[0].temperature, temperatureExpected));
  check("溫度觀測香港 07:58 = UTC 前一日 23:58，獨立於報告／標記／抓取時間", parseWeather(raw).temperature.recorded_at === "2024-02-29T23:58:00.000Z" && ![report, captured, good.records[0].icon_updated_at].includes(good.records[0].temperature.recorded_at));
  const zeroRaw = clone(raw); zeroRaw.temperature.data[1].value = 0;
  check("來源零度是有效數值，不當成缺漏或用另一站補上", parseWeather(zeroRaw).temperature.value === 0);
  const reordered = clone(raw); reordered.temperature.data.reverse();
  check("測站來源次序改變仍精確取香港天文台，沒有位置依賴", equal(parseWeather(reordered).temperature, temperatureExpected));
  const rawTemperatureMutations = [
    ["缺溫度", (x) => { delete x.temperature; }], ["缺站表", (x) => { delete x.temperature.data; }],
    ["空站表", (x) => { x.temperature.data = []; }], ["站表不是陣列", (x) => { x.temperature.data = {}; }],
    ["缺香港天文台", (x) => { x.temperature.data.pop(); }],
    ["近似名稱唔算指定測站", (x) => { x.temperature.data[1].place = "香港天文台總部"; }],
    ["重複香港天文台", (x) => { x.temperature.data.push(clone(x.temperature.data[1])); }],
    ["錯單位", (x) => { x.temperature.data[1].unit = "F"; }],
    ["字串溫度", (x) => { x.temperature.data[1].value = "27.625"; }],
    ["null 溫度", (x) => { x.temperature.data[1].value = null; }],
    ["NaN 溫度", (x) => { x.temperature.data[1].value = NaN; }],
    ["無限溫度", (x) => { x.temperature.data[1].value = Infinity; }],
    ["缺觀測時間", (x) => { delete x.temperature.recordTime; }],
    ["觀測缺時區", (x) => { x.temperature.recordTime = "2024-03-01T07:58:00"; }],
    ["觀測錯曆日", (x) => { x.temperature.recordTime = "2024-02-30T07:58:00+08:00"; }],
  ];
  for (const [label, change] of rawTemperatureMutations) {
    const bad = clone(raw); change(bad);
    check(`上游溫度突變：${label} 明確 UpstreamError，不回傳估算值`, throws(() => parseWeather(bad), UpstreamError));
  }
  const withTemperature = (change) => { const doc = clone(good); change(doc.records[0].temperature); return reseal(doc); };
  const temperatureMutations = [
    ["錯測站", (x) => { x.station = "京士柏"; }], ["錯單位", (x) => { x.unit = "F"; }],
    ["字串數值", (x) => { x.value = "27.625"; }], ["null 數值", (x) => { x.value = null; }],
    ["NaN 數值", (x) => { x.value = NaN; }], ["無限數值", (x) => { x.value = Infinity; }],
    ["缺數值", (x) => { delete x.value; }],
    ["缺觀測時間", (x) => { delete x.recorded_at; }],
    ["觀測未正規化", (x) => { x.recorded_at = "2024-03-01T07:58:00+08:00"; }],
    ["觀測錯曆日", (x) => { x.recorded_at = "2024-02-30T23:58:00.000Z"; }],
  ];
  for (const [label, change] of temperatureMutations) {
    const bad = withTemperature(change);
    check(`溫度 schema 自證：${label} 重算 hash 仍失敗`, !validateCitySnapshot(bad).ok);
    const state = weatherTemperature(bad, captured);
    check(`前端溫度自證：${label} 無數值但不影響有效夜間標記`, state.status === "unavailable" && state.value === null && state.recorded_at === null && at(bad).scene === "night");
  }
  const missingTemperature = clone(good); delete missingTemperature.records[0].temperature; reseal(missingTemperature);
  check("缺溫度欄位不通過新 schema，前端舊快照無數值但保留天氣標記", !validateCitySnapshot(missingTemperature).ok && weatherTemperature(missingTemperature, captured).status === "unavailable" && weatherTemperature(missingTemperature, captured).value === null && at(missingTemperature).scene === "night");
  check("溫度 schema 禁止額外平均值欄位，即使 hash 配對", !validateCitySnapshot(withTemperature((x) => { x.average = 27; })).ok);
  const futureTemperature = withTemperature((x) => { x.recorded_at = "2024-03-01T00:10:00.000Z"; });
  const futureTemperatureLate = withTemperature((x) => { x.recorded_at = "2024-03-01T00:10:00.001Z"; });
  check("溫度 schema 觀測超前抓取剛好五分鐘容許，加 1ms 必定失敗", validateCitySnapshot(futureTemperature).ok && !validateCitySnapshot(futureTemperatureLate).ok);
  check("正常前端溫度完整保留原數及觀測時刻", equal(weatherTemperature(good, captured), { status: "current", value: 27.625, recorded_at: "2024-02-29T23:58:00.000Z" }));
  const zeroDoc = withTemperature((x) => { x.value = 0; });
  check("schema 和前端都保留來源零度", validateCitySnapshot(zeroDoc).ok && weatherTemperature(zeroDoc, captured).value === 0 && weatherTemperature(zeroDoc, captured).status === "current");
  for (const [label, doc] of [["缺檔", null], ["錯種類", { ...good, kind: "news" }], ["多報告", { ...good, records: [good.records[0], good.records[0]] }]]) {
    check(`溫度無效容器：${label} 不生成預設數值`, equal(weatherTemperature(doc, captured), { status: "unavailable", value: null, recorded_at: null }));
  }
  const temperatureBoundary = withTemperature((x) => { x.recorded_at = report; });
  check("溫度觀測剛好 90 分鐘仍有效", weatherTemperature(temperatureBoundary, "2024-03-01T01:30:00.000Z").status === "current");
  check("溫度觀測過 90 分鐘保留舊值及時間並標 stale", equal(weatherTemperature(temperatureBoundary, "2024-03-01T01:30:00.001Z"), { status: "stale", value: 27.625, recorded_at: report }));
  check("觀測時效獨立於新報告：舊溫度 stale 但夜間特效保持 current", weatherTemperature(good, "2024-03-01T01:28:00.001Z").status === "stale" && at(good, "2024-03-01T01:28:00.001Z").status === "current");
  const reportBoundary = withTemperature((x) => { x.recorded_at = captured; });
  const captureBoundary = clone(reportBoundary); captureBoundary.updated_at = captureBoundary.records[0].report_updated_at = captured; captureBoundary.fetched_at = report; reseal(captureBoundary);
  for (const [label, doc] of [["報告", reportBoundary], ["擷取", captureBoundary]]) {
    check(`溫度 ${label} 獨立 90 分鐘邊界及加 1ms`, weatherTemperature(doc, "2024-03-01T01:30:00.000Z").status === "current" && weatherTemperature(doc, "2024-03-01T01:30:00.001Z").status === "stale");
  }
  check("前端觀測超前裝置五分鐘邊界及加 1ms", weatherTemperature(futureTemperature, captured).status === "current" && weatherTemperature(futureTemperatureLate, captured).status === "stale");
  for (const [label, change] of [["報告", (x, time) => { x.updated_at = x.records[0].report_updated_at = time; }], ["擷取", (x, time) => { x.fetched_at = time; }]]) {
    const within = clone(good), beyond = clone(good); change(within, "2024-03-01T00:10:00.000Z"); change(beyond, "2024-03-01T00:10:00.001Z");
    check(`溫度 ${label} 超前裝置五分鐘邊界及加 1ms`, weatherTemperature(within, captured).status === "current" && weatherTemperature(beyond, captured).status === "stale");
  }
  check("build 已標舊，溫度亦保留數字並標 stale", weatherTemperature({ ...good, build: { stale: true } }, captured).status === "stale" && weatherTemperature({ ...good, build: { stale: true } }, captured).value === 27.625);
  check("只有溫度改變或觀測時刻更新，各自都改變內容 hash", withTemperature((x) => { x.value = 28.25; }).content_hash !== good.content_hash && withTemperature((x) => { x.recorded_at = report; }).content_hash !== good.content_hash);

  const known = [
    [50, "陽光充沛", "sunny"], [51, "間有陽光", "partly-cloudy"], [52, "短暫陽光", "partly-cloudy"],
    [53, "間有陽光幾陣驟雨", "sun-shower"], [54, "短暫陽光有驟雨", "sun-shower"],
    [60, "多雲", "cloudy"], [61, "密雲", "cloudy"], [62, "微雨", "rain"], [63, "雨", "rain"], [64, "大雨", "rain"], [65, "雷暴", "cloudy"],
    [70, "天色良好(只在農曆第一日晚間使用)", "night"], [71, "天色良好(只在農曆第二日至第六日晚間使用)", "night"],
    [72, "天色良好(只在農曆第七日至第十三日晚間使用)", "night"], [73, "天色良好(只在農曆第十四日至第十七日晚間使用)", "night"],
    [74, "天色良好(只在農曆第十八日至第二十四日晚間使用)", "night"], [75, "天色良好(只在農曆第二十五日至第三十日晚間使用)", "night"],
    [76, "大致多雲(只在晚間使用)", "night-cloudy"], [77, "天色大致良好(只在晚間使用)", "night"],
    [80, "大風", "off"], [81, "乾燥", "off"], [82, "潮濕", "off"], [83, "霧", "fog"], [84, "薄霧", "fog"], [85, "煙霞", "off"],
    [90, "熱", "off"], [91, "暖", "off"], [92, "涼", "off"], [93, "冷", "off"],
  ];
  check("官方字典剛好涵蓋 29 個釘死代碼，沒有連續數字猜測", equal(Object.keys(WEATHER_ICONS).map(Number), known.map(([code]) => code)));
  for (const [code, label, scene] of known) {
    const state = at(withIcons([code]));
    check(`官方標記 ${code}：${label} → ${scene}`, state.status === "current" && state.scene === scene && equal(state.labels_zh, [label]) && state.labels_en.length === 1 && state.labels_en[0].length > 0);
  }
  check("夜間 77 不借用晴日太陽", at(withIcons([77])).scene === "night" && at(withIcons([77])).scene !== "sunny");
  check("潮濕及寒冷都不推斷成落雨或落雪", at(withIcons([82])).scene === "off" && at(withIcons([93])).scene === "off");
  check("雷暴保留正確文字但只畫雲，不製造閃光", at(withIcons([65])).scene === "cloudy" && at(withIcons([65])).labels_zh[0] === "雷暴");
  const transition = withIcons([64, 50]);
  check("多標記解析保留來源次序，不取第一個或排序", equal(parseWeather({ ...raw, icon: [64, 50] }).icons, [64, 50]));
  check("多標記保持天氣轉變狀態並停止單一天氣效果", at(transition).status === "transition" && at(transition).scene === "off" && equal(at(transition).icons, [64, 50]) && equal(at(transition).labels_zh, ["大雨", "陽光充沛"]));
  check("轉變次序反轉仍保留雙標記，沒有嚴重程度排序", equal(at(withIcons([50, 64])).labels_zh, ["陽光充沛", "大雨"]) && at(withIcons([50, 64])).scene === "off");
  const rawCopy = clone(raw), docCopy = clone(good);
  const parsed = parseWeather(rawCopy); parsed.icons.push(50);
  const stateCopy = at(docCopy); stateCopy.icons.push(50);
  check("parser 和視覺狀態不修改輸入標記陣列", equal(rawCopy, raw) && equal(docCopy, good));

  check("報告時效已知答案：剛好 90 分鐘仍有效", at(good, "2024-03-01T01:30:00.000Z").status === "current");
  check("報告時效已知答案：90 分鐘加 1 毫秒便停效果", at(good, "2024-03-01T01:30:00.001Z").reason === "report-old" && at(good, "2024-03-01T01:30:00.001Z").scene === "off");
  const capturedEarlier = withTimes("2024-03-01T00:05:00.000Z", report);
  check("擷取時效獨立已知答案：剛好 90 分鐘仍有效", at(capturedEarlier, "2024-03-01T01:30:00.000Z").status === "current");
  check("擷取時效獨立已知答案：90 分鐘加 1 毫秒便停效果", at(capturedEarlier, "2024-03-01T01:30:00.001Z").reason === "snapshot-old" && at(capturedEarlier, "2024-03-01T01:30:00.001Z").scene === "off");
  check("未來報告剛好 5 分鐘容差仍有效", at(withTimes("2024-03-01T00:10:00.000Z")).status === "current");
  check("未來報告 5 分鐘加 1 毫秒判定時鐘異常", at(withTimes("2024-03-01T00:10:00.001Z")).reason === "clock-skew");
  check("未來擷取剛好 5 分鐘容差仍有效", at(withTimes(report, "2024-03-01T00:10:00.000Z")).status === "current");
  check("未來擷取 5 分鐘加 1 毫秒判定時鐘異常", at(withTimes(report, "2024-03-01T00:10:00.001Z")).reason === "clock-skew");
  check("12 小時前圖示配合新報告仍有效，不拿圖示時間當報告時效", at(good).status === "current" && at(good).scene === "night");
  check("build stale 必須停效果，即使來源時間表面仍新", at({ ...good, build: { stale: true } }).reason === "build-stale" && at({ ...good, build: { stale: true } }).scene === "off");
  check("weather build metadata 用 90 分鐘規則，不沿用城市六小時", !cityBuildMetadata(good, "2024-03-01T01:30:00.000Z").build.stale && cityBuildMetadata(good, "2024-03-01T01:30:00.001Z").build.stale);
  check("build 標舊不改 hash、取得時刻或原快照", cityContentHash(cityBuildMetadata(good, "2024-03-02T00:00:00.000Z")) === good.content_hash && cityBuildMetadata(good, "2024-03-02T00:00:00.000Z").fetched_at === captured && !Object.hasOwn(good, "build"));
  check("時效計算接受相同 epoch 或帶時區 ISO 時刻", equal(at(good, Date.parse(captured)), at(good, "2024-03-01T08:05:00+08:00")));
  for (const now of ["bad", NaN, Infinity, null, {}]) check(`無效裝置時間 ${String(now)} 必須 hard fail`, throws(() => weatherState(good, now), TypeError));

  const rawMutations = [
    ["空物件", {}], ["null", null], ["陣列冒充報告", []],
    ["未知代碼", { ...raw, icon: [999] }], ["空代碼", { ...raw, icon: [] }],
    ["字串代碼", { ...raw, icon: ["77"] }], ["非整數代碼", { ...raw, icon: [77.5] }],
    ["重複代碼", { ...raw, icon: [77, 77] }], ["缺標記", { ...raw, icon: undefined }],
    ["缺報告時間", { ...raw, updateTime: undefined }], ["缺圖示時間", { ...raw, iconUpdateTime: undefined }],
    ["不可能曆日", { ...raw, updateTime: "2024-02-30T08:00:00+08:00" }],
    ["報告缺時區", { ...raw, updateTime: "2024-03-01T08:00:00" }],
    ["圖示缺時區", { ...raw, iconUpdateTime: "2024-02-29T20:00:00" }],
  ];
  for (const [label, body] of rawMutations) check(`上游天氣突變：${label} 明確 UpstreamError`, throws(() => parseWeather(body), UpstreamError));
  for (const [label, change] of [
    ["未知代碼", (x) => { x.records[0].icons = [999]; }], ["空代碼", (x) => { x.records[0].icons = []; }],
    ["非整數代碼", (x) => { x.records[0].icons = [50.1]; }], ["重複代碼", (x) => { x.records[0].icons = [77, 77]; }],
    ["多份報告", (x) => { x.records.push(clone(x.records[0])); }], ["空 records", (x) => { x.records = []; }],
    ["多餘溫度推斷", (x) => { x.records[0].temperature = 0; }], ["缺 report 時間", (x) => { delete x.records[0].report_updated_at; }],
    ["圖示時間錯曆日", (x) => { x.records[0].icon_updated_at = "2024-02-30T12:00:00.000Z"; }],
    ["報告時間未正規化", (x) => { x.records[0].report_updated_at = x.updated_at = "2024-03-01T08:00:00+08:00"; }],
    ["報告與 doc.updated_at 不符", (x) => { x.updated_at = x.fetched_at; }],
    ["圖示時間冒充 doc.updated_at", (x) => { x.updated_at = x.records[0].icon_updated_at; }],
    ["抓取時刻錯", (x) => { x.fetched_at = "bad"; }],
    ["報告超前取得時間超出容差", (x) => { x.updated_at = x.records[0].report_updated_at = "2024-03-01T00:10:00.001Z"; }],
    ["圖示超前取得時間超出容差", (x) => { x.records[0].icon_updated_at = "2024-03-01T00:10:00.001Z"; }],
    ["缺來源 URL", (x) => { delete x.source_url; }], ["錯官方入口", (x) => { x.live_url = "https://evil.test/"; }],
    ["錯來源名稱", (x) => { x.source_zh = "其他來源"; }], ["錯授權", (x) => { x.licence = "public domain"; }],
  ]) { const bad = clone(good); change(bad); reseal(bad); check(`天氣 schema 自證：${label} 即使重算 hash 都捉到`, !validateCitySnapshot(bad).ok); }
  const changed = clone(good); changed.records[0].icons = [50];
  check("天氣內容變咗但冇重算 hash 必定失敗", !validateCitySnapshot(changed).ok);
  const unknown = at(withIcons([999]));
  check("前端未知代碼安全停止，保留未識別提示而非晴天", unknown.status === "unknown" && unknown.scene === "off" && unknown.reason === "unknown-icon" && unknown.labels_zh[0].includes("999"));
  for (const [label, doc] of [["缺檔", null], ["錯種類", { ...good, kind: "flights" }], ["空標記", withIcons([])], ["重複標記", withIcons([77, 77])], ["字串標記", withIcons(["77"])], ["多份報告", { ...good, records: [good.records[0], good.records[0]] }], ["updated_at 不符", { ...good, updated_at: captured }]]) {
    check(`前端無效天氣：${label} 停止效果`, at(doc).status === "unavailable" && at(doc).scene === "off");
  }

  const fixtureBefore = await fingerprint(join(CITY_FIXTURE_DIR, "weather"));
  const snapshotBefore = digest(await readFile(join(CITY_SNAPSHOT_DIR, "weather.json")));
  const temporary = await mkdtemp(join(tmpdir(), "hkdm-weather-tests-"));
  const snapshotDir = join(temporary, "snapshots"), fixtureDir = join(temporary, "fixtures");
  const originalFetch = globalThis.fetch;
  const fixtureSettings = [process.env.HKDM_FIXTURES, process.env.HKDM_FIXTURE_DIR];
  await mkdir(snapshotDir); await mkdir(fixtureDir);
  try {
    let responseBody = clone(raw), requests = 0;
    globalThis.fetch = async (url) => {
      if (String(url) !== WEATHER_URL) throw new Error(`天氣測試禁止非指定 URL:${url}`);
      requests += 1;
      return new Response(JSON.stringify(responseBody), { headers: { "content-type": "application/json" } });
    };
    const refresh = (now) => refreshCitySnapshots({ kinds: ["weather"], snapshotDir, fixtureDir, fetcher: (kind) => fetchCitySnapshot(kind, { now }) });
    check("首次天氣擷取建立正式格式快照及同次 HTTP 錄影", (await refresh(captured))[0].status === "updated" && requests === 1 && (await readdir(join(fixtureDir, "weather"))).length === 1);
    const firstBytes = await readFile(join(snapshotDir, "weather.json"), "utf8"), firstFixture = await fingerprint(fixtureDir);
    const first = await readCitySnapshot("weather", { snapshotDir });
    responseBody.updateTime = "2024-03-01T08:30:00+08:00";
    const renewed = await refresh("2024-03-01T00:35:00.000Z");
    let renewedDoc = renewed[0].snapshot;
    check("相同圖示但新報告時刻必須判定 updated", renewed[0].status === "updated" && equal(renewedDoc.records[0].icons, [77]) && renewedDoc.records[0].report_updated_at === "2024-03-01T00:30:00.000Z" && renewedDoc.content_hash !== first.content_hash);
    check("新報告時刻同時換新快照及錄影，避免半新半舊", await readFile(join(snapshotDir, "weather.json"), "utf8") !== firstBytes && await fingerprint(fixtureDir) !== firstFixture);
    const beforeTemperatureBytes = await readFile(join(snapshotDir, "weather.json"), "utf8"), beforeTemperatureFixture = await fingerprint(fixtureDir);
    responseBody.temperature.data[1].value = 28.25;
    const warmer = await refresh("2024-03-01T00:36:00.000Z");
    check("報告及圖示不變，只有來源溫度改變仍更新快照與同次錄影", warmer[0].status === "updated" && warmer[0].snapshot.records[0].temperature.value === 28.25 && warmer[0].snapshot.updated_at === renewedDoc.updated_at && await readFile(join(snapshotDir, "weather.json"), "utf8") !== beforeTemperatureBytes && await fingerprint(fixtureDir) !== beforeTemperatureFixture);
    renewedDoc = warmer[0].snapshot;
    const saved = await readFile(join(snapshotDir, "weather.json"), "utf8"), savedFixture = await fingerprint(fixtureDir);
    const unchanged = await refresh("2024-03-01T00:40:00.000Z");
    check("只有擷取時間改變而報告、標記及溫度不變時判定 unchanged", unchanged[0].status === "unchanged" && unchanged[0].snapshot.fetched_at === "2024-03-01T00:36:00.000Z");
    check("unchanged 保留快照與錄影所有原 byte", await readFile(join(snapshotDir, "weather.json"), "utf8") === saved && await fingerprint(fixtureDir) === savedFixture);
    const retained = await refreshCitySnapshots({ kinds: ["weather"], snapshotDir, fixtureDir, fetcher: async () => { throw new UpstreamError("測試來源離線"); } });
    check("天氣 UpstreamError 才 retained，原檔與錄影不動", retained[0].status === "retained" && await readFile(join(snapshotDir, "weather.json"), "utf8") === saved && await fingerprint(fixtureDir) === savedFixture);
    check("天氣 TypeError 必須 hard fail，不能 retained", await rejects(() => refreshCitySnapshots({ kinds: ["weather"], snapshotDir, fixtureDir, fetcher: async () => { throw new TypeError("測試程式錯誤"); } }), TypeError));
    const malformed = clone(renewedDoc); malformed.records[0].icons = [999]; reseal(malformed);
    check("天氣 schema 錯即使重算 hash 也 hard fail", await rejects(() => refreshCitySnapshots({ kinds: ["weather"], snapshotDir, fixtureDir, fetcher: async () => malformed })) && await readFile(join(snapshotDir, "weather.json"), "utf8") === saved && await fingerprint(fixtureDir) === savedFixture);
    const missingDir = join(temporary, "missing-snapshots"), missingFixtures = join(temporary, "missing-fixtures");
    check("首次缺檔且上游失敗必須 hard fail，不建空快照", await rejects(() => refreshCitySnapshots({ kinds: ["weather"], snapshotDir: missingDir, fixtureDir: missingFixtures, fetcher: async () => { throw new UpstreamError("測試首次來源離線"); } }), UpstreamError) && await readCitySnapshot("weather", { snapshotDir: missingDir }) === null);
    check("成功或失敗後 HTTP 錄影環境都還原", process.env.HKDM_FIXTURES === fixtureSettings[0] && process.env.HKDM_FIXTURE_DIR === fixtureSettings[1]);
    globalThis.fetch = async () => { throw new Error("天氣重播測試禁止任何網絡"); };
    const replayedTmp = await replayCitySnapshot("weather", { snapshotDir, fixtureDir });
    check("新報告保存的臨時錄影零網絡重播完整配對", equal(replayedTmp, renewedDoc));
    check("有天氣快照的普通 loader 零網絡", (await loadCitySnapshot("weather", { snapshotDir, now: "2024-03-01T00:40:00.000Z" })).content_hash === renewedDoc.content_hash);
    const official = await readCitySnapshot("weather"), replayed = await replayCitySnapshot("weather");
    check("真實天文台錄影零網絡重播 content_hash 全同", replayed.content_hash === official.content_hash && cityContentHash(replayed) === official.content_hash);
    check("真實天文台錄影完整來源、溫度觀測、全部時間及標記與快照全同", equal(replayed, official));

    const citySource = await readFile(new URL("../src/data/_lib/city-feeds.js", import.meta.url), "utf8");
    const stateSource = await readFile(new URL("../src/components/weather-state.js", import.meta.url), "utf8");
    let sequence = 0;
    async function mutate(source, before, after) {
      if (source.split(before).length !== 2) throw new Error(`天氣源碼突變沒有精確命中:${before}`);
      const code = source.replace(before, after)
        .replace('from "jsdom"', `from ${JSON.stringify(pathToFileURL(createRequire(import.meta.url).resolve("jsdom")).href)}`)
        .replace('from "./http.js"', `from ${JSON.stringify(new URL("../src/data/_lib/http.js", import.meta.url).href)}`)
        .replace('from "../../components/weather-state.js"', `from ${JSON.stringify(new URL("../src/components/weather-state.js", import.meta.url).href)}`);
      const path = join(temporary, `weather-mutant-${sequence++}.mjs`);
      await writeFile(path, code); return import(pathToFileURL(path).href);
    }
    const firstIcon = await mutate(citySource, "icons: [...body.icon]", "icons: [body.icon[0]]");
    check("源碼突變：只取第一圖示被雙標記已知答案捉到", !equal(firstIcon.parseWeather({ ...raw, icon: [64, 50] }).icons, [64, 50]));
    const iconTime = await mutate(citySource, "report_updated_at = cityTimestamp(body.updateTime);", "report_updated_at = cityTimestamp(body.iconUpdateTime);");
    check("源碼突變：圖示時間冒充報告時間被獨立時刻答案捉到", iconTime.parseWeather(raw).report_updated_at !== report);
    const uncheckedIcon = await mutate(citySource, "body.icon.every((code) => Number.isInteger(code) && Object.hasOwn(WEATHER_ICONS, code))", "body.icon.every((code) => Number.isInteger(code))");
    check("源碼突變：移除未知標記閘被 999 測例捉到", !throws(() => uncheckedIcon.parseWeather({ ...raw, icon: [999] }), UpstreamError));
    const night = await mutate(stateSource, '77: {label_zh: "天色大致良好(只在晚間使用)", label_en: "Mainly Fine ( use only in night-time )", scene: "night"}', '77: {label_zh: "天色大致良好(只在晚間使用)", label_en: "Mainly Fine ( use only in night-time )", scene: "sunny"}');
    check("源碼突變：77 畫晴日太陽被夜間已知答案捉到", night.weatherState(good, captured).scene !== "night");
    const reportThreshold = await mutate(stateSource, "reportAge > 90 * 60_000", "reportAge > 91 * 60_000");
    check("源碼突變：報告時效調鬆一分鐘被 90 分鐘加 1ms 捉到", reportThreshold.weatherState(good, "2024-03-01T01:30:00.001Z").reason !== "report-old");
    const fetchedThreshold = await mutate(stateSource, "fetchedAge > 90 * 60_000", "fetchedAge > 91 * 60_000");
    check("源碼突變：擷取時效調鬆一分鐘被 90 分鐘加 1ms 捉到", fetchedThreshold.weatherState(capturedEarlier, "2024-03-01T01:30:00.001Z").reason !== "snapshot-old");
    const singleScene = await mutate(stateSource, 'if (icons.length > 1) return {...state, status: "transition", reason: "multiple-icons"};', "// mutant: wrongly choose a single scene for multiple icons");
    check("源碼突變：略過多標記轉變閘被 transition/off 已知答案捉到", singleScene.weatherState(transition, captured).status !== "transition" && singleScene.weatherState(transition, captured).scene !== "off");
    const firstStation = await mutate(citySource, 'body.temperature.data.filter((row) => row?.place === "香港天文台")', "body.temperature.data.slice(0, 1)");
    check("溫度源碼突變：誤取第一測站被獨立 HKO 第二列答案捉到", !equal(firstStation.parseWeather(raw).temperature, temperatureExpected));
    const uncheckedUnit = await mutate(citySource, 'Number.isFinite(observation.value) && observation.unit === "C"', "Number.isFinite(observation.value)");
    const fahrenheit = clone(raw); fahrenheit.temperature.data[1].unit = "F";
    check("溫度源碼突變：漏驗攝氏被 F 單位案例捉到", !throws(() => uncheckedUnit.parseWeather(fahrenheit), UpstreamError));
    const wrongObservationTime = await mutate(citySource, "recorded_at = cityTimestamp(body.temperature.recordTime);", "recorded_at = cityTimestamp(body.updateTime);");
    check("溫度源碼突變：報告時間冒充量度時間被三個獨立來源時刻捉到", wrongObservationTime.parseWeather(raw).temperature.recorded_at !== temperatureExpected.recorded_at);
    const duplicateStation = await mutate(citySource, 'upstream(stations.length === 1, "香港天文台溫度觀測缺少或重複");', 'upstream(stations.length > 0, "香港天文台溫度觀測缺少或重複");');
    const duplicate = clone(raw); duplicate.temperature.data.push(clone(duplicate.temperature.data[1]));
    check("溫度源碼突變：重複測站取第一個被重複列案例捉到", !throws(() => duplicateStation.parseWeather(duplicate), UpstreamError));
    const uncheckedAge = await mutate(stateSource, "[temperature.recorded_at, record.report_updated_at, doc.fetched_at].map(utcTime)", "[record.report_updated_at, doc.fetched_at].map(utcTime)");
    check("溫度源碼突變：漏驗量度時效被舊溫度配新報告案例捉到", uncheckedAge.weatherTemperature(good, "2024-03-01T01:28:00.001Z").status !== "stale");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temporary, { recursive: true, force: true });
  }
  check("天氣測試沒有改真實快照或錄影任何 byte", await fingerprint(join(CITY_FIXTURE_DIR, "weather")) === fixtureBefore && digest(await readFile(join(CITY_SNAPSHOT_DIR, "weather.json"))) === snapshotBefore);
}
