import { mkdtemp, readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { UpstreamError, fetchText } from "../src/data/_lib/http.js";
import {
  CITY_FIXTURE_DIR, CITY_SNAPSHOT_DIR, cityTimestamp, previousHongKongDate, cityBuildMetadata,
  parseNews, parseFlights, flightUrl, fetchCitySnapshot, cityContentHash,
  validateCitySnapshot, readCitySnapshot, replayCitySnapshot, refreshCitySnapshots, loadCitySnapshot,
} from "../src/data/_lib/city-feeds.js";

const clone = (x) => structuredClone(x);
const throws = (fn, type = Error) => { try { fn(); return false; } catch (e) { return e instanceof type; } };
async function rejects(fn, type = Error) { try { await fn(); return false; } catch (e) { return e instanceof type; } }
async function fingerprint(directory) {
  const result = [];
  async function walk(path, prefix = "") {
    for (const name of (await readdir(path)).sort()) {
      const absolute = join(path, name), relative = prefix + name;
      try { const bytes = await readFile(absolute); result.push([relative, createHash("sha256").update(bytes).digest("hex")]); }
      catch (e) { if (e.code !== "EISDIR") throw e; await walk(absolute, relative + "/"); }
    }
  }
  await walk(directory); return JSON.stringify(result);
}

export async function testCityFeeds(check) {
  console.log("\n[城市快照] 時區已知答案、來源口徑、突變及同次錄影重播");
  check("城市時間已知答案：香港 9/9 00:30 = UTC 9/8 16:30", cityTimestamp("2026-09-09T00:30:00+08:00") === "2026-09-08T16:30:00.000Z");
  check("城市時間已知答案：RSS 9/9 07:33:04 +0800 = UTC 9/8 23:33:04", cityTimestamp("Wed, 09 Sep 2026 07:33:04 +0800") === "2026-09-08T23:33:04.000Z");
  check("城市日期已知答案：香港新年 00:30 嘅昨日係上一年 12/31", previousHongKongDate("2026-01-01T00:30:00+08:00") === "2025-12-31");
  check("城市日期已知答案：閏年 3/1 嘅昨日係 2/29", previousHongKongDate("2024-03-01T00:00:00+08:00") === "2024-02-29");
  for (const bad of ["2026-02-30T00:00:00Z", "2026-09-09T25:00:00Z", "2026-09-09T00:00:00", "Wed, 08 Sep 2026 07:33:04 +0800", "2026-09-09T00:00:00+14:30"]) {
    check(`城市時間突變拒絕 ${bad}`, throws(() => cityTimestamp(bad)));
  }

  const url = "https://www.info.gov.hk/gia/general/202609/09/P2026090900151.htm";
  const xml = `<rss version="2.0"><channel><title>香港特區政府新聞公報</title><language>zh-HK</language><pubDate>Wed, 09 Sep 2026 09:06:34 GMT</pubDate><lastBuildDate>Tue, 12 Jul 2016 11:00:00 GMT</lastBuildDate><item><title><![CDATA[科技 & 家庭 <資料>]]></title><guid>${url}</guid><link>${url}</link><pubDate>Wed, 09 Sep 2026 07:33:04 +0800</pubDate><description><![CDATA[<script>bad()</script><img src="https://example.test/pixel">全文]]></description></item></channel></rss>`;
  const news = parseNews(xml);
  check("新聞 CDATA 保留標題純文字，唔帶全文／圖像", news[0].title === "科技 & 家庭 <資料>" && Object.keys(news[0]).sort().join() === "published_at,title,url");
  check("新聞只用 item 時刻，忽略錯誤 channel 時刻", news[0].published_at === "2026-09-08T23:33:04.000Z");
  check("新聞 XML entities 正確解碼", parseNews(xml.replace("<![CDATA[科技 & 家庭 <資料>]]>", "科技 &amp; 家庭 &#x9999;&#28207;"))[0].title === "科技 & 家庭 香港");
  for (const [label, bad] of [
    ["錯語言", xml.replace("zh-HK", "en")], ["錯來源", xml.replace("香港特區政府新聞公報", "另一來源")],
    ["惡意連結", xml.replaceAll("https://www.info.gov.hk", "https://evil.test")],
    ["script URL", xml.replaceAll(url, "javascript:alert(1)")], ["連結帳密", xml.replaceAll("https://www.info.gov.hk", "https://x:y@www.info.gov.hk")],
    ["假 https 主機", xml.replaceAll("https://www.info.gov.hk", "https://www.info.gov.hk.evil.test")],
    ["DOCTYPE", '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + xml],
    ["XML 截斷", xml.slice(0, -6)], ["重複發布時刻", xml.replace("</item>", "<pubDate>Wed, 09 Sep 2026 07:33:04 +0800</pubDate></item>")],
    ["標題元素", xml.replace("<![CDATA[科技 & 家庭 <資料>]]>", "<script>bad()</script>")],
    ["冇項目", xml.replace(/<item>[\s\S]*<\/item>/, "")],
    ["錯日期", xml.replace("Wed, 09 Sep 2026 07:33:04 +0800", "Wed, 30 Feb 2026 07:33:04 +0800")],
  ]) check(`新聞突變：${label} 屬上游失敗`, throws(() => parseNews(bad), UpstreamError));

  const row = { time: "00:05", flight: [{ no: "CX 880", airline: "CPA" }, { no: "AA 8933", airline: "AAL" }], status: "啟航 00:05", statusCode: null, destination: ["LAX"], origin: ["LAX"], terminal: "" };
  const body = (arrival = false) => [
    { date: "2026-09-07", arrival, cargo: false, list: [{ ...clone(row), time: "23:55", destination: ["FRA"], origin: ["FRA"] }], lastUpdatedTime: "2026-09-09T09:00:00+08:00" },
    { date: "2026-09-08", arrival, cargo: false, list: [clone(row)], lastUpdatedTime: "2026-09-09T09:00:00+08:00" },
    { date: "2026-09-09", arrival, cargo: false, list: [clone(row)], lastUpdatedTime: "2026-09-09T09:00:00+08:00" },
  ];
  const flight = parseFlights(body(), "2026-09-08", "departure");
  check("航班已知答案：只揀要求日期，唔攤平鄰日紀錄", flight.records.length === 1 && flight.records[0].time === "00:05" && flight.records[0].airports.join() === "LAX");
  check("航班共享編號係同一列，保留全部共享號", flight.records.length === 1 && flight.records[0].flights.map((x) => x.no).join() === "CX 880,AA 8933");
  check("航班 statusCode null 合法，冇估狀態", flight.records[0].statusCode === null && flight.records[0].status === "啟航 00:05");
  const blank = body(); blank[1].list[0].status = "";
  check("航班空白 status 合法，唔補『準時』", parseFlights(blank, "2026-09-08", "departure").records[0].status === "");
  check("抵港用 origin 並保留方向", parseFlights(body(true), "2026-09-08", "arrival").records[0].direction === "arrival");
  const alterations = [
    ["錯方向", (b) => { b[1].arrival = true; }], ["貨機冒充客機", (b) => { b[1].cargo = true; }],
    ["null 紀錄", (b) => { b[1].list = [null]; }],
    ["要求日期缺少", (b) => b.splice(1, 1)], ["日期群重複", (b) => b.push(clone(b[1]))],
    ["空航班清單", (b) => { b[1].list = []; }], ["時間錯", (b) => { b[1].list[0].time = "24:61"; }],
    ["冇機場", (b) => { b[1].list[0].destination = []; }], ["地名冒充代碼", (b) => { b[1].list[0].destination = ["洛杉磯"]; }],
    ["冇航班編號", (b) => { b[1].list[0].flight = []; }], ["錯代碼", (b) => { b[1].list[0].flight[0].airline = "<script>"; }],
    ["重複一列", (b) => b[1].list.push(clone(b[1].list[0]))], ["更新時間缺時區", (b) => { b[1].lastUpdatedTime = "2026-09-09T09:00:00"; }],
  ];
  for (const [label, alter] of alterations) { const bad = body(); alter(bad); check(`航班突變：${label} 屬上游失敗`, throws(() => parseFlights(bad, "2026-09-08", "departure"), UpstreamError)); }
  check("空航班回應唔當零", throws(() => parseFlights([], "2026-09-08", "departure"), UpstreamError));
  check("未知方向係程式錯，hard fail", throws(() => flightUrl("2026-09-08", "both")) && !throws(() => flightUrl("2026-09-08", "both"), UpstreamError));

  const now = "2026-09-09T01:10:00.000Z";
  const goodNews = await fetchCitySnapshot("news", { now, getText: async () => ({ text: xml }) });
  const beforeEnv = process.env.HKDM_FIXTURES;
  process.env.HKDM_FIXTURES = "replay";
  let goodFlights;
  try { goodFlights = await fetchCitySnapshot("flights", { now, getJson: async (u) => ({ body: body(new URL(u).searchParams.get("arrival") === "true") }) }); }
  finally { if (beforeEnv === undefined) delete process.env.HKDM_FIXTURES; else process.env.HKDM_FIXTURES = beforeEnv; }
  check("兩個正常城市 schema 都通過", validateCitySnapshot(goodNews).ok && validateCitySnapshot(goodFlights).ok);
  check("快照年齡已知答案：剛好六小時唔標舊，超一毫秒標舊", !cityBuildMetadata(goodNews, "2026-09-09T07:10:00.000Z").build.stale && cityBuildMetadata(goodNews, "2026-09-09T07:10:00.001Z").build.stale);
  check("航班香港跨日即標舊，唔繼續冒充昨日", cityBuildMetadata(goodFlights, "2026-09-09T16:00:00.000Z").build.stale);
  check("年齡提示唔改原快照內容 hash 或取得時刻", cityBuildMetadata(goodNews, "2026-09-09T12:00:00.000Z").fetched_at === goodNews.fetched_at && cityContentHash(cityBuildMetadata(goodNews, "2026-09-09T12:00:00.000Z")) === goodNews.content_hash);
  for (const [label, base, change] of [
    ["缺來源", goodNews, (x) => { delete x.source_url; }], ["錯授權", goodNews, (x) => { x.licence = "public domain"; }],
    ["空紀錄", goodNews, (x) => { x.records = []; }], ["帶全文", goodNews, (x) => { x.records[0].description = "全文"; }],
    ["錯新聞截至時間", goodNews, (x) => { x.updated_at = x.fetched_at; }], ["錯日", goodFlights, (x) => { x.requested_date = "2026-09-09"; }],
    ["只得離港", goodFlights, (x) => { x.records = x.records.filter((r) => r.direction === "departure"); }],
    ["原定日期不符", goodFlights, (x) => { x.records[0].scheduled_date = "2026-09-07"; }],
    ["抓取時間錯", goodFlights, (x) => { x.fetched_at = "bad"; }],
  ]) { const bad = clone(base); change(bad); bad.content_hash = cityContentHash(bad); check(`schema 自證：${label} 即使重算 hash 都捉到`, !validateCitySnapshot(bad).ok); }
  const wrongHash = clone(goodNews); wrongHash.records[0].title = "改錯標題";
  check("內容突變冇更新 hash 必定失敗", !validateCitySnapshot(wrongHash).ok);

  const fixtureBefore = await fingerprint(CITY_FIXTURE_DIR);
  const snapshotBefore = await fingerprint(CITY_SNAPSHOT_DIR);
  const temporary = await mkdtemp(join(tmpdir(), "hkdm-city-tests-"));
  const snapshotDir = join(temporary, "snapshots"), fixtureDir = join(temporary, "fixtures");
  await mkdir(snapshotDir); await mkdir(fixtureDir);
  try {
    await refreshCitySnapshots({ kinds: ["news"], snapshotDir, fixtureDir, fetcher: async () => goodNews });
    check("首次成功確實建立快照", (await readCitySnapshot("news", { snapshotDir })).content_hash === goodNews.content_hash);
    const saved = await readFile(join(snapshotDir, "news.json"), "utf8");
    const settings = [process.env.HKDM_FIXTURES, process.env.HKDM_FIXTURE_DIR];
    const retained = await refreshCitySnapshots({ kinds: ["news"], snapshotDir, fixtureDir, fetcher: async () => { throw new UpstreamError("測試網絡失敗"); } });
    check("上游失敗保留上一版原 byte 及時刻", retained[0].status === "retained" && await readFile(join(snapshotDir, "news.json"), "utf8") === saved);
    check("錄影設定喺失敗之後正確還原", process.env.HKDM_FIXTURES === settings[0] && process.env.HKDM_FIXTURE_DIR === settings[1]);
    check("程式錯硬失敗，唔裝成成功保留", await rejects(() => refreshCitySnapshots({ kinds: ["news"], snapshotDir, fixtureDir, fetcher: async () => { throw new TypeError("程式壞咗"); } }), TypeError));
    check("首次抓唔到資料硬失敗，冇假空快照", await rejects(() => refreshCitySnapshots({ kinds: ["flights"], snapshotDir, fixtureDir, fetcher: async () => { throw new UpstreamError("測試網絡失敗"); } }), UpstreamError) && await readCitySnapshot("flights", { snapshotDir }) === null);
    const updated = clone(goodNews); updated.records[0].title += "更新"; updated.content_hash = cityContentHash(updated);
    const marker = join(fixtureDir, "news", "previous-marker"); await writeFile(marker, "原錄影");
    const beforePartial = await fingerprint(fixtureDir);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("第一次回應已成功，但其後整份來源失敗", { headers: { "content-type": "text/plain" } });
    try {
      const outcome = await refreshCitySnapshots({ kinds: ["news"], snapshotDir, fixtureDir, fetcher: async () => {
        await fetchText("https://example.test/city-first-response");
        throw new UpstreamError("第二次請求失敗");
      } });
      check("首個 HTTP 成功後整體失敗，唔留半新錄影", outcome[0].status === "retained" && await fingerprint(fixtureDir) === beforePartial && await readFile(join(snapshotDir, "news.json"), "utf8") === saved);
    } finally { globalThis.fetch = originalFetch; }
    check("快照提交失敗會回復整組舊錄影", await rejects(() => refreshCitySnapshots({ kinds: ["news"], snapshotDir, fixtureDir, fetcher: async () => updated, beforeCommit: async () => { throw new Error("磁碟提交測試"); } })) && await readFile(marker, "utf8") === "原錄影" && await readFile(join(snapshotDir, "news.json"), "utf8") === saved);
    const timeOnly = { ...goodNews, fetched_at: "2026-09-09T02:00:00.000Z" };
    check("只有抓取時刻改變唔覆寫資料或原錄影", (await refreshCitySnapshots({ kinds: ["news"], snapshotDir, fixtureDir, fetcher: async () => timeOnly }))[0].status === "unchanged" && await readFile(marker, "utf8") === "原錄影");
    check("新 schema 錯硬失敗，舊檔不動", await rejects(() => refreshCitySnapshots({ kinds: ["news"], snapshotDir, fixtureDir, fetcher: async () => ({ ...goodNews, source_url: "bad" }) })) && await readFile(join(snapshotDir, "news.json"), "utf8") === saved);
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("測試禁止外部網絡"); };
    try {
      check("有快照嘅普通 loader 零網絡", (await loadCitySnapshot("news", { snapshotDir })).content_hash === goodNews.content_hash);
      for (const kind of ["news", "flights"]) {
        const original = await readCitySnapshot(kind);
        const replayed = await replayCitySnapshot(kind);
        check(`真實 ${kind} 錄影重播內容 hash 同快照相同`, replayed.content_hash === original.content_hash);
        check(`真實 ${kind} 重播完整來源／時刻／紀錄同快照相同`, JSON.stringify(replayed) === JSON.stringify(original));
      }
    } finally { globalThis.fetch = oldFetch; }

    const source = await readFile(new URL("../src/data/_lib/city-feeds.js", import.meta.url), "utf8");
    let seq = 0;
    async function mutate(before, after) {
      if (source.split(before).length !== 2) throw new Error(`城市源碼突變冇精確命中:${before}`);
      const code = source.replace(before, after)
        .replace('from "jsdom"', `from ${JSON.stringify(pathToFileURL(createRequire(import.meta.url).resolve("jsdom")).href)}`)
        .replace('from "./http.js"', `from ${JSON.stringify(new URL("../src/data/_lib/http.js", import.meta.url).href)}`);
      const path = join(temporary, `mutant-${seq++}.mjs`); await writeFile(path, code); return import(pathToFileURL(path).href);
    }
    const timezone = await mutate("ms + 8 * 3600_000", "ms + 0 * 3600_000");
    check("源碼突變：UTC 當香港日期被跨年已知答案捉到", timezone.previousHongKongDate("2026-01-01T00:30:00+08:00") !== "2025-12-31");
    const firstGroup = await mutate("const groups = body.filter((g) => g.date === requestedDate);", "const groups = [body[0]];");
    check("源碼突變：response[0] 會被要求日期範例捉到", firstGroup.parseFlights(body(), "2026-09-08", "departure").records[0].airports.join() !== "LAX");
    const shares = await mutate("flights: r.flight.map(({ no, airline })", "flights: r.flight.slice(0, 1).map(({ no, airline })");
    check("源碼突變：漏共享航班被已知答案捉到", shares.parseFlights(body(), "2026-09-08", "departure").records[0].flights.length !== 2);
    const host = await mutate('u.hostname === "www.info.gov.hk"', "true");
    check("源碼突變：移除來源主機閘被惡意連結測例捉到", !throws(() => host.parseNews(xml.replaceAll("https://www.info.gov.hk", "https://evil.test")), UpstreamError));
    const broadCatch = await mutate("if (!(error instanceof UpstreamError) || !previous) throw error;", "if (!previous) throw error;");
    check("源碼突變：吞晒程式錯會被 hard fail 測例捉到", !await rejects(() => broadCatch.refreshCitySnapshots({ kinds: ["news"], snapshotDir, fixtureDir, fetcher: async () => { throw new TypeError("程式壞咗"); } }), TypeError));
  } finally { await rm(temporary, { recursive: true, force: true }); }
  check("城市測試冇改已提交快照及錄影任何 byte", await fingerprint(CITY_FIXTURE_DIR) === fixtureBefore && await fingerprint(CITY_SNAPSHOT_DIR) === snapshotBefore);
}
