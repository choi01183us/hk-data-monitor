// 定時城市快照：抓取只喺 Node/build 端；新聞與航班唔冒充統計指標。
import { JSDOM } from "jsdom";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchText, fetchJson, UpstreamError, withFixtureTransaction, politePause } from "./http.js";

const DATA_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const CITY_SNAPSHOT_DIR = join(DATA_DIR, "_city_snapshots");
export const CITY_FIXTURE_DIR = join(DATA_DIR, "_city_fixtures");
export const CITY_KINDS = Object.freeze(["news", "flights"]);
export const NEWS_URL = "https://www.info.gov.hk/gia/rss/general_zh.xml";
const FLIGHT_BASE = "https://www.hongkongairport.com/flightinfo-rest/rest/flights/past";
const CONFIG = Object.freeze({
  news: {
    source_zh: "香港特區政府新聞處",
    source_url: "https://data.gov.hk/tc-data/dataset/hk-isd-gnmis-gnmis",
    live_url: "https://www.info.gov.hk/gia/general/ctoday.htm",
    licence: "data.gov.hk 使用條款；香港特區政府版權所有",
    licence_url: "https://data.gov.hk/tc/terms-and-conditions",
  },
  flights: {
    source_zh: "香港機場管理局",
    source_url: "https://data.gov.hk/tc-data/dataset/aahk-team1-flight-info",
    live_url: "https://www.hongkongairport.com/tc/flights/departures/passenger.page",
    licence: "data.gov.hk 使用條款；香港機場管理局版權所有",
    licence_url: "https://data.gov.hk/tc/terms-and-conditions",
  },
});
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function assert(value, message) { if (!value) throw new Error(message); }
function upstream(value, message) { if (!value) throw new UpstreamError(message); }
function kindConfig(kind) { assert(CITY_KINDS.includes(kind), `未知城市快照種類:${kind}`); return CONFIG[kind]; }
function plain(value, max = 600) { return typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value); }
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

/** 嚴驗時區同曆日，唔接受 Date.parse 將 2 月 30 日自動推入 3 月。 */
export function cityTimestamp(value) {
  assert(typeof value === "string", "缺少時間字串");
  let m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|[+-]\d{2}:\d{2})$/);
  if (!m) {
    const r = value.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/);
    assert(r, `時間缺時區或格式改變:${value}`);
    const iso = `${r[4]}-${String(MONTHS.indexOf(r[3]) + 1).padStart(2, "0")}-${r[2]}T${r[5]}:${r[6]}:${r[7]}${r[8].slice(0, 3)}:${r[8].slice(3)}`;
    const result = cityTimestamp(iso);
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay()];
    assert(weekday === r[1], "發布日期星期與曆日不符");
    return result;
  }
  const [, year, month, day, hour, minute, second, , zone] = m;
  assert(validDate(`${year}-${month}-${day}`) && +hour < 24 && +minute < 60 && +second < 60, `無效曆日或時間:${value}`);
  if (zone !== "Z") assert(+zone.slice(1, 3) <= 14 && +zone.slice(4) < 60 && !(+zone.slice(1, 3) === 14 && +zone.slice(4)), "無效時區");
  const ms = Date.parse(value);
  assert(Number.isFinite(ms), "時間無法解析");
  return new Date(ms).toISOString();
}

export function previousHongKongDate(now = new Date().toISOString()) {
  const ms = Date.parse(cityTimestamp(now));
  return new Date(ms + 8 * 3600_000 - 86400_000).toISOString().slice(0, 10);
}

export function flightUrl(requestedDate, direction) {
  assert(validDate(requestedDate), "航班要求日期無效");
  assert(["arrival", "departure"].includes(direction), "航班方向無效");
  return `${FLIGHT_BASE}?date=${requestedDate}&arrival=${direction === "arrival"}&cargo=false&lang=zh_HK`;
}

function newsUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "www.info.gov.hk" && !u.port && !u.username && !u.password && !u.search && !u.hash && /^\/gia\/general\/\d{6}\/\d{2}\/P\d+(?:p)?\.htm$/.test(u.pathname);
  } catch { return false; }
}

export function parseNews(xml) {
  upstream(typeof xml === "string" && xml.length < 2_000_000 && !/<!DOCTYPE|<!ENTITY/i.test(xml), "新聞 XML 太大或含不支援宣告");
  let document;
  try { document = new JSDOM(xml, { contentType: "application/xml" }).window.document; }
  catch (cause) { throw new UpstreamError("新聞 XML 無法解析", { cause }); }
  const root = document.documentElement;
  upstream(root.tagName === "rss" && root.getAttribute("version") === "2.0", "新聞 RSS 根結構改變");
  const channels = [...root.children].filter((x) => x.tagName === "channel");
  upstream(channels.length === 1, "新聞 channel 數目改變");
  const channel = channels[0];
  const field = (element, name) => {
    const children = [...element.children].filter((x) => x.tagName === name);
    upstream(children.length === 1, `新聞欄位 ${name} 缺少或重複`);
    upstream(children[0].children.length === 0, `新聞欄位 ${name} 唔應該含元素`);
    return children[0].textContent.trim();
  };
  upstream(field(channel, "language") === "zh-HK", "新聞語言唔係 zh-HK");
  upstream(field(channel, "title") === "香港特區政府新聞公報", "新聞來源名稱改變");
  const items = [...channel.children].filter((x) => x.tagName === "item");
  upstream(items.length > 0 && items.length <= 2000, "新聞 RSS 冇有效項目或項目過多");
  const seen = new Set();
  const records = items.map((item) => {
    const title = field(item, "title");
    const url = field(item, "link");
    upstream(plain(title) && newsUrl(url) && field(item, "guid") === url, "新聞標題、原文連結或識別碼無效");
    let published_at;
    try { published_at = cityTimestamp(field(item, "pubDate")); }
    catch (cause) { throw new UpstreamError("新聞發布時間無效", { cause }); }
    upstream(!seen.has(url), "新聞原文連結重複");
    seen.add(url);
    return { title, url, published_at };
  });
  return records.sort((a, b) => b.published_at.localeCompare(a.published_at) || a.url.localeCompare(b.url));
}

export function parseFlights(body, requestedDate, direction) {
  flightUrl(requestedDate, direction); // 程式設定錯 hard fail。
  upstream(Array.isArray(body) && body.length > 0, "航班回應冇日期群");
  upstream(body.every((g) => g && validDate(g.date) && g.arrival === (direction === "arrival") && g.cargo === false && Array.isArray(g.list)), "航班日期群、方向或客貨口徑改變");
  const groups = body.filter((g) => g.date === requestedDate);
  upstream(groups.length === 1, "航班要求日期缺少或重複，唔借鄰日資料");
  const group = groups[0];
  upstream(group.list.length > 0 && group.list.length <= 3000, "要求日期冇航班紀錄或紀錄過多");
  let updated_at;
  try { updated_at = cityTimestamp(group.lastUpdatedTime); }
  catch (cause) { throw new UpstreamError("航班來源更新時刻無效", { cause }); }
  const seen = new Set();
  const records = group.list.map((r) => {
    upstream(r && typeof r === "object" && !Array.isArray(r), "航班紀錄唔係物件");
    const airports = r[direction === "arrival" ? "origin" : "destination"];
    upstream(typeof r.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time), "航班原定時間無效");
    upstream(Array.isArray(airports) && airports.length > 0 && airports.every((x) => /^[A-Z]{3}$/.test(x)), "航班機場代碼缺少或格式改變");
    upstream(Array.isArray(r.flight) && r.flight.length > 0 && r.flight.every((x) => plain(x?.no, 30) && /^[A-Z0-9]{2,3} \d{1,5}[A-Z]?$/.test(x.no) && /^[A-Z0-9]{2,3}$/.test(x.airline)), "航班編號格式改變");
    upstream(typeof r.status === "string" && r.status.length <= 300 && (r.statusCode === null || typeof r.statusCode === "string"), "航班狀態格式改變");
    const key = JSON.stringify([r.time, r.flight, airports]);
    upstream(!seen.has(key), "相同航班紀錄重複");
    seen.add(key);
    return { direction, scheduled_date: requestedDate, time: r.time, airports: [...airports], flights: r.flight.map(({ no, airline }) => ({ no, airline })), status: r.status, statusCode: r.statusCode };
  });
  return { records, updated_at };
}

/** 抓取／來源回應時刻唔係內容變化；內容一樣就保留整份原檔同原錄影。 */
export function cityContentHash(doc) {
  const { fetched_at, updated_at, content_hash, build, ...content } = doc;
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
function seal(doc) { const output = { ...doc, content_hash: cityContentHash(doc) }; const result = validateCitySnapshot(output); assert(result.ok, `城市快照 schema:${result.errors.join("；")}`); return output; }

export function validateCitySnapshot(doc) {
  const errors = [];
  const check = (yes, message) => { if (!yes) errors.push(message); };
  if (!doc || typeof doc !== "object" || !CITY_KINDS.includes(doc.kind)) return { ok: false, errors: ["城市快照種類無效"] };
  for (const [key, value] of Object.entries(CONFIG[doc.kind])) check(doc[key] === value, `${key} 來源設定不符`);
  for (const key of ["fetched_at", "updated_at"]) { try { check(cityTimestamp(doc[key]) === doc[key], `${key} 必須係 ISO UTC`); } catch { errors.push(`${key} 時間無效`); } }
  check(Array.isArray(doc.records) && doc.records.length > 0, "records 必須有實際資料");
  const records = Array.isArray(doc.records) ? doc.records : [];
  check(doc.content_hash === cityContentHash(doc), "content_hash 同快照內容不符");
  check(Number.isFinite(Date.parse(doc.fetched_at)) && Date.parse(doc.updated_at) <= Date.parse(doc.fetched_at) + 5 * 60000, "來源更新時刻超前抓取時刻");
  if (doc.kind === "news") {
    const seen = new Set();
    for (const r of records) {
      check(plain(r?.title) && newsUrl(r?.url), "新聞標題或安全連結無效");
      try { check(cityTimestamp(r?.published_at) === r.published_at, "新聞發布時間未正規化"); } catch { errors.push("新聞發布時間無效"); }
      check(!seen.has(r?.url), "新聞連結重複"); seen.add(r?.url);
      check(Object.keys(r ?? {}).sort().join() === "published_at,title,url", "新聞只保留標題連結時間");
    }
    check(records.every((r, i) => i === 0 || records[i - 1]?.published_at >= r?.published_at), "新聞未按發布時間排序");
    check(doc.updated_at === records[0]?.published_at, "新聞截至時間唔係最新公報時間");
  } else {
    check(validDate(doc.requested_date), "航班要求日期無效");
    try { check(validDate(doc.requested_date) && doc.requested_date === previousHongKongDate(doc.fetched_at), "航班要求日期必須係抓取時香港前一日"); }
    catch { errors.push("航班抓取時間無效"); }
    check(records.some((r) => r?.direction === "arrival") && records.some((r) => r?.direction === "departure"), "航班必須有抵港同離港兩份資料");
    const seen = new Set();
    for (const r of records) {
      check(["arrival", "departure"].includes(r?.direction) && r.scheduled_date === doc.requested_date, "航班方向或原定日期錯誤");
      check(typeof r?.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time), "航班時間無效");
      check(Array.isArray(r?.airports) && r.airports.length > 0 && r.airports.every((x) => /^[A-Z]{3}$/.test(x)), "航班機場代碼無效");
      check(Array.isArray(r?.flights) && r.flights.length > 0 && r.flights.every((x) => plain(x?.no, 30) && /^[A-Z0-9]{2,3} \d{1,5}[A-Z]?$/.test(x.no) && /^[A-Z0-9]{2,3}$/.test(x.airline)), "航班編號無效");
      check(typeof r?.status === "string" && r.status.length <= 300 && (r.statusCode === null || typeof r.statusCode === "string"), "航班狀態無效");
      const key = JSON.stringify([r?.direction, r?.time, r?.flights, r?.airports]);
      check(!seen.has(key), "航班紀錄重複"); seen.add(key);
    }
  }
  return { ok: errors.length === 0, errors };
}

export async function readCitySnapshot(kind, { snapshotDir = CITY_SNAPSHOT_DIR } = {}) {
  kindConfig(kind);
  let doc;
  try { doc = JSON.parse(await readFile(join(snapshotDir, `${kind}.json`), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  const result = validateCitySnapshot(doc);
  assert(doc.kind === kind && result.ok, `城市快照 ${kind} 損壞:${result.errors.join("；")}`);
  return doc;
}

async function withFixtureSettings(mode, directory, fn) {
  const previous = [process.env.HKDM_FIXTURES, process.env.HKDM_FIXTURE_DIR];
  process.env.HKDM_FIXTURES = mode;
  process.env.HKDM_FIXTURE_DIR = directory;
  try { return await fn(); }
  finally {
    for (const [key, value] of [["HKDM_FIXTURES", previous[0]], ["HKDM_FIXTURE_DIR", previous[1]]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

export async function fetchCitySnapshot(kind, { now, requestedDate, getText = fetchText, getJson = fetchJson } = {}) {
  const config = kindConfig(kind);
  // 生產用真實完成時間；重播由已提交快照提供原有抓取時間。
  const startedAt = now ?? new Date().toISOString();
  if (kind === "news") {
    const { text } = await getText(NEWS_URL);
    const records = parseNews(text);
    return seal({ kind, ...config, fetched_at: now ?? new Date().toISOString(), updated_at: records[0].published_at, records });
  }
  const date = requestedDate ?? previousHongKongDate(startedAt);
  const arrival = parseFlights((await getJson(flightUrl(date, "arrival"))).body, date, "arrival");
  await politePause();
  const departure = parseFlights((await getJson(flightUrl(date, "departure"))).body, date, "departure");
  const fetchedAt = now ?? new Date().toISOString();
  // 若抓取跨香港午夜，上一日目標已變，保留舊快照等下次排程。
  upstream(date === previousHongKongDate(fetchedAt), "抓取跨香港午夜，要求日期已改變");
  return seal({ kind, ...config, requested_date: date, fetched_at: fetchedAt, updated_at: [arrival.updated_at, departure.updated_at].sort().at(-1), records: [...arrival.records, ...departure.records] });
}

export async function replayCitySnapshot(kind, { snapshotDir = CITY_SNAPSHOT_DIR, fixtureDir = CITY_FIXTURE_DIR } = {}) {
  const previous = await readCitySnapshot(kind, { snapshotDir });
  assert(previous, `城市快照 ${kind} 未存在`);
  return withFixtureSettings("replay", join(fixtureDir, kind), () => fetchCitySnapshot(kind, { now: previous.fetched_at, requestedDate: previous.requested_date }));
}

async function promote(kind, fresh, stage, snapshotDir, fixtureDir, beforeCommit) {
  await mkdir(snapshotDir, { recursive: true }); await mkdir(fixtureDir, { recursive: true });
  const snapshotPath = join(snapshotDir, `${kind}.json`);
  const newSnapshot = join(snapshotDir, `.${kind}-${process.pid}.tmp`);
  const destination = join(fixtureDir, kind);
  const backup = join(fixtureDir, `.${kind}-${process.pid}.old`);
  await writeFile(newSnapshot, JSON.stringify(fresh, null, 2) + "\n");
  let backedUp = false, promoted = false;
  try {
    try { await rename(destination, backup); backedUp = true; } catch (e) { if (e.code !== "ENOENT") throw e; }
    await rename(stage, destination); promoted = true;
    await beforeCommit?.(); // 測試檔案提交失敗時回復錄影；正式流程冇此 callback。
    await rename(newSnapshot, snapshotPath);
  } catch (error) {
    if (promoted) await rm(destination, { recursive: true, force: true });
    if (backedUp) await rename(backup, destination);
    await rm(newSnapshot, { force: true });
    throw error;
  }
  if (backedUp) await rm(backup, { recursive: true, force: true });
}

/** 同一 process 須順序呼叫：HTTP 錄影設定及交易係既有全域狀態。 */
export async function refreshCitySnapshots({ kinds = CITY_KINDS, snapshotDir = CITY_SNAPSHOT_DIR, fixtureDir = CITY_FIXTURE_DIR, fetcher = fetchCitySnapshot, beforeCommit } = {}) {
  const results = [];
  for (const kind of kinds) {
    kindConfig(kind);
    const previous = await readCitySnapshot(kind, { snapshotDir });
    await mkdir(fixtureDir, { recursive: true });
    const stage = await mkdtemp(join(fixtureDir, `.${kind}-stage-`));
    try {
      const fresh = await withFixtureSettings("record", stage, () => withFixtureTransaction(() => fetcher(kind)));
      const validity = validateCitySnapshot(fresh);
      assert(fresh.kind === kind && validity.ok, `城市快照 schema:${validity.errors.join("；")}`);
      if (fresh.content_hash === previous?.content_hash) results.push({ kind, status: "unchanged", snapshot: previous });
      else {
        await promote(kind, fresh, stage, snapshotDir, fixtureDir, beforeCommit);
        results.push({ kind, status: "updated", snapshot: fresh });
      }
    } catch (error) {
      if (!(error instanceof UpstreamError) || !previous) throw error;
      console.error(`[城市快照 ${kind}] 抓取失敗，保留 ${previous.fetched_at} 快照：${error.message}`);
      results.push({ kind, status: "retained", snapshot: previous, error: error.message });
    } finally { await rm(stage, { recursive: true, force: true }); }
  }
  return results;
}

/** 正常 build 用已提交快照；只喺首次缺檔時抓取，排程另行明確 refresh。 */
export async function loadCitySnapshot(kind, options = {}) {
  const previous = await readCitySnapshot(kind, options);
  if (previous) return cityBuildMetadata(previous, options.now);
  assert(process.env.HKDM_OFFLINE !== "1", `離線 build 缺少城市快照 ${kind}`);
  return cityBuildMetadata((await refreshCitySnapshots({ ...options, kinds: [kind] }))[0].snapshot, options.now);
}

/** 年齡提示係 build 當刻判斷，唔冒充最近刷新失敗記錄，亦唔落磁碟。 */
export function cityBuildMetadata(doc, now = new Date().toISOString()) {
  const oldAge = Date.parse(cityTimestamp(now)) - Date.parse(doc.fetched_at) > 6 * 3600_000;
  const oldDate = doc.kind === "flights" && doc.requested_date !== previousHongKongDate(now);
  return { ...doc, build: { stale: oldAge || oldDate, reason: oldDate ? "航班原定日期已非香港前一日" : oldAge ? "快照已超過六小時" : "" } };
}
