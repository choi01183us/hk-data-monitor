// 離線提示橫額 —— SPEC 第 8 節:
//   「離線時頁面頂顯示一條 banner:『目前為離線快取,數據截至 YYYY-MM-DD』」
//
// 由 observablehq.config.js 嘅 head script 掛上去,所以 13 版指標頁唔使逐版接線。
// postbuild 會把呢個檔抄入 dist 根。
//
// ⚠️ navigator.onLine 靠唔住 —— 實測過主機完全去唔到,佢照樣回 true。
//    所以真正嘅判斷準則係「呢一版係咪由 service worker 嘅快取答」,
//    而頁面自己讀唔到 navigation response 嘅 header,唯有問返 worker。
//    onLine 只做輔助:佢話「離線」通常真係離線,佢話「在線」就唔可以信。

(function () {
  "use strict";

  var BANNER_ID = "hkdm-offline-banner";
  var english = document.documentElement.lang === "en-GB";

  function formatDate(iso) {
    if (!iso) return null;
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return iso;
    if (english) return new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Hong_Kong"}).format(new Date(iso + "T00:00:00Z"));
    return match[1] + " 年 " + Number(match[2]) + " 月 " + Number(match[3]) + " 日";
  }

  function ensureBanner() {
    var existing = document.getElementById(BANNER_ID);
    if (existing) return existing;

    var banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.setAttribute("role", "status");
    banner.hidden = true;
    banner.innerHTML =
      '<span class="hkdm-offline-banner__dot" aria-hidden="true"></span>' +
      '<span class="hkdm-offline-banner__text"></span>' +
      '<button type="button" class="hkdm-offline-banner__close" aria-label="收起提示">×</button>';

    banner.querySelector(".hkdm-offline-banner__close").setAttribute("aria-label", english ? "Dismiss offline message" : "收起提示");
    banner.querySelector(".hkdm-offline-banner__close").addEventListener("click", function () {
      banner.hidden = true;
    });

    // 擺喺 body 最頭,position: sticky,所以會浮喺內容之上但唔會遮住嘢
    document.body.insertBefore(banner, document.body.firstChild);
    return banner;
  }

  function show(dataAsOf) {
    var banner = ensureBanner();
    var date = formatDate(dataAsOf);
    banner.querySelector(".hkdm-offline-banner__text").textContent = english
      ? (date ? "Showing the offline cache. The earliest data-as-of date across published datasets is " + date + ". Check each card for its statistical period." : "Showing the offline cache.")
      : (date ? "目前為離線快取；全站數據截至日期最早為 " + date + "。各項統計期請看資料卡。" : "目前為離線快取。");
    banner.hidden = false;
  }

  function hide() {
    var banner = document.getElementById(BANNER_ID);
    if (banner) banner.hidden = true;
  }

  var lastKnownDataAsOf = null;

  function askWorker() {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
    navigator.serviceWorker.controller.postMessage({ type: "hkdm:status", url: location.href });
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (event) {
      if (!event.data || event.data.type !== "hkdm:status") return;
      lastKnownDataAsOf = event.data.dataAsOf || lastKnownDataAsOf;
      if (event.data.fromCache) show(lastKnownDataAsOf);
    });

    // controller 要等 SW 接管咗先有。第一次入站係冇 controller 嘅(頁面由網絡載嘅),
    // 嗰陣本來就唔使出 banner。
    if (navigator.serviceWorker.controller) askWorker();
    else navigator.serviceWorker.addEventListener("controllerchange", askWorker);
    // ⚠️ 唔可以喺 controllerchange 度 location.reload():第一次安裝
    //    clients.claim() 就會觸發佢,變成雙重載入,一個唔覺意就係 reload 循環。
  }

  // 網絡狀態變化嘅輔助訊號
  window.addEventListener("offline", function () {
    show(lastKnownDataAsOf);
  });
  window.addEventListener("online", function () {
    hide();
    askWorker();
  });

  if (navigator.onLine === false) show(lastKnownDataAsOf);
})();
