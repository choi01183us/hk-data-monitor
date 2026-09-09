// Observable Framework 設定。
//
// 幾個踩過／查過嘅位,寫低免得下次再撞:
//
// 1. `base` 喺 1.13.4 差唔多冇作用 —— Framework 出嘅連結全部係相對路徑
//    (./ 同 ../),所以部署去 GitHub Pages 嘅子路徑 /hk-data-monitor/ 唔使特別設定。
//
// 2. `observable build` 用 useStale 模式:見到 src/.observablehq/cache/ 有嘢
//    就**唔會**再跑 data loader,即係改完 loader 都出舊數,而且唔會有任何提示。
//    所以 package.json 嘅 build script 一定要先 rm 個 cache。
//
// 3. 中文標題嘅 anchor id 會變空 —— slugify 對純漢字會回空字串,
//    連續幾個中文標題就會出 id=""、"-1"、"-2",TOC 深層連結會壞。
//    所以 .md 入面嘅小標題一律寫成 <h2 id="英文-id">中文標題</h2>。
//
// 4. 內建搜尋用 MiniSearch,佢會把一串漢字當成**一個** token,只做前綴比對,
//    即係搜「房屋」搵唔到標題叫「香港房屋數據」嘅頁。
//    補救:每頁 front matter 寫 keywords,用空格分開詞語(權重 x4)。

export default {
  title: "香港數據監測站",
  root: "src",
  output: "dist",

  // GitHub Pages 專案站住喺 /<repo>/ 子路徑。
  // ⚠️ 喺 1.13.4 度 `base` 幾乎冇作用 —— Framework 出嘅連結全部本身就係相對路徑
  //    (./ 同 ../),唯一用到 base 嘅係 404.html 嗰個 <base href>。
  //    所以唔設都唔會爛,設咗就連 404 版嘅相對連結都啱。
  // ⚠️ base: "" 會掟錯(base must start with slash)。CI 嗰邊會補條斜線,
  //    因為 actions/configure-pages 對自訂網域出嘅 base_path 就係空字串。
  base: process.env.BASE_PATH || "/",

  pages: [
    {
      name: "主題探索",
      pages: [
        { name: "香港城市觀察", path: "/explore/city" },
        { name: "科技與香港", path: "/explore/technology" },
        { name: "本地研發總開支", path: "/indicators/rd_expenditure" },
        { name: "住戶上網率", path: "/indicators/household_internet" },
      ],
    },
    {
      name: "學習路線",
      pages: [
        { name: "香港人點生活", path: "/learn/hong-kong" },
        { name: "公共資源點分", path: "/learn/public-finance" },
        { name: "寫青年預算備忘", path: "/learn/budget-memo" },
      ],
    },
    {
      name: "公共財政",
      pages: [
        { name: "政府經常開支", path: "/indicators/govt_expenditure" },
        { name: "政府收入", path: "/indicators/govt_revenue" },
        { name: "財政儲備", path: "/indicators/fiscal_reserves" },
      ],
    },
    {
      name: "經濟同人口",
      pages: [
        { name: "人均本地生產總值", path: "/indicators/gdp" },
        { name: "香港人口", path: "/indicators/population" },
        { name: "四大行業佔 GDP 比重", path: "/indicators/four_key_industries" },
        { name: "商品進口貨值", path: "/indicators/goods_imports" },
        { name: "商品整體出口貨值", path: "/indicators/goods_exports" },
        { name: "港口貨物吞吐量", path: "/indicators/port_cargo" },
        { name: "上市公司數目", path: "/indicators/hkex_listings" },
      ],
    },
    {
      name: "就業同物價",
      pages: [
        { name: "失業率", path: "/indicators/unemployment" },
        { name: "每月工資中位數", path: "/indicators/median_wage" },
        { name: "住戶每月入息中位數", path: "/indicators/household_income" },
        { name: "通脹率", path: "/indicators/cpi" },
      ],
    },
    {
      name: "人手數據",
      pages: [
        { name: "公共經常開支(十個政策組別)", path: "/indicators/public_expenditure_policy_groups" },
        { name: "公屋輪候時間", path: "/indicators/phr_waiting_time" },
      ],
    },
    {
      name: "關於",
      pages: [
        { name: "資料來源同授權", path: "/about/sources" },
        { name: "私隱", path: "/about/privacy" },
      ],
    },
  ],

  // 中學生多數用手機或學校平板(SPEC 第 9 節「手機優先」),
  // 側欄預設收埋,唔好一開就食咗半個螢幕。
  sidebar: true,
  toc: false,
  pager: false,
  search: true,

  // 唔用 Framework 預設嘅 Google Fonts —— SPEC 第 2 節第 2 條要求零第三方請求。
  // 空陣列即係完全唔載外部字型,一律用系統字。
  globalStylesheets: [],

  style: "style.css",

  // head 收到 { title, data, path }。path 例如 "/index"、"/indicators/gdp"。
  head: ({ path }) => {
    // 由頁面深度計返站點根嘅相對路徑。
    // 唔可以寫死 "/sw.js" —— GitHub Pages 專案站住喺 /hk-data-monitor/ 子路徑,
    // 而 "/" 係 user.github.io 根目錄,屬於另一個 repo。
    // 又唔可以寫死 "./sw.js" —— 喺 /indicators/gdp 會變成 /indicators/sw.js。
    const depth = Math.max(0, path.split("/").length - 2);
    const root = depth === 0 ? "./" : "../".repeat(depth);

    return [
      // Framework 冇 lang 設定,唯有自己改。影響螢幕閱讀器同中文字型選擇。
      `<script>document.documentElement.lang="zh-HK";</script>`,
      `<meta name="color-scheme" content="light dark">`,
      `<meta name="theme-color" content="#0f172a">`,
      // 用 data: URI 而唔係一個檔案 —— 保持「零第三方、零額外請求」,
      // 順便省返個 favicon.ico 404。
      `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%230f172a"/><path d="M6 22 L12 14 L17 18 L26 7" fill="none" stroke="%2338bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      )}">`,
      `<meta name="description" content="畀香港中學生用嘅公開數據網站。全部數字都有出處、有更新日期,離線都睇到。">`,
      // 零追蹤:明文叫爬蟲唔好幫我哋建立任何使用者側寫(呢個站本身都冇資料可收)。
      `<meta name="referrer" content="no-referrer">`,

      // ⚠️ manifest 同 sw 都係用 JS 掛,唔用 <link>/<script src>。
      //    Framework 會把 head 入面 link[href] / script[src] 當成 file attachment:
      //    加雜湊、搬去 _file/、而且檔案唔存在就直接 build fail。
      //    manifest 一搬去 _file/,佢個 start_url / scope 就會相對 _file/ 解析,
      //    整個 PWA 嘅範圍就錯晒。所以呢度砌字串,Framework 唔會掂。
      `<script>
(function(){
  var root = ${JSON.stringify(root)};
  var link = document.createElement("link");
  link.rel = "manifest";
  link.href = root + "manifest.webmanifest";
  document.head.appendChild(link);

  var banner = document.createElement("script");
  banner.src = root + "offline-banner.js";
  banner.defer = true;
  document.head.appendChild(banner);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function(){
      navigator.serviceWorker.register(root + "sw.js", { scope: root }).catch(function(){});
    });
  }
})();
</script>`,
    ].join("");
  },

  footer: () =>
    [
      `<p>資料來自香港政府各部門嘅公開數據,授權條款逐個指標列喺該頁。`,
      `本網站程式碼以 MIT 授權開源。</p>`,
      `<p><strong>本網站唔收集任何個人資料</strong> —— 冇帳戶、冇 cookie、冇分析工具。`,
      `<a href="./about/privacy">私隱說明</a></p>`,
    ].join(""),
};
