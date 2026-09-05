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

  pages: [
    {
      name: "指標",
      pages: [
        { name: "人均本地生產總值", path: "/indicators/gdp" },
        { name: "香港人口", path: "/indicators/population" },
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

  head: () =>
    [
      // Framework 冇 lang 設定,唯有自己改。影響螢幕閱讀器同中文字型選擇。
      `<script>document.documentElement.lang="zh-HK";</script>`,
      `<meta name="color-scheme" content="light dark">`,
      // 用 data: URI 而唔係一個檔案 —— 保持「零第三方、零額外請求」,
      // 順便省返個 favicon.ico 404。
      `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%230f172a"/><path d="M6 22 L12 14 L17 18 L26 7" fill="none" stroke="%2338bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      )}">`,
      `<meta name="description" content="畀香港中學生用嘅公開數據網站。全部數字都有出處、有更新日期,離線都睇到。">`,
      // 零追蹤:明文叫爬蟲唔好幫我哋建立任何使用者側寫(呢個站本身都冇資料可收)。
      `<meta name="referrer" content="no-referrer">`,
    ].join(""),

  footer: () =>
    [
      `<p>資料來自香港政府各部門嘅公開數據,授權條款逐個指標列喺該頁。`,
      `本網站程式碼以 MIT 授權開源。</p>`,
      `<p><strong>本網站唔收集任何個人資料</strong> —— 冇帳戶、冇 cookie、冇分析工具。`,
      `<a href="./about/privacy">私隱說明</a></p>`,
    ].join(""),
};
