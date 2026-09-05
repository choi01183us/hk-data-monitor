# 香港數據監測站 · hk-data-monitor

純靜態、離線優先、繁體中文嘅香港公開數據網站,畀香港中學生(主力中三至中四)用。

配合三個課堂活動:**模擬社會體驗**、**資源裁定會議(分餅)**、**青年預算備忘**。

規格見 [`SPEC.md`](SPEC.md) —— **改嘢之前先讀佢**。任何指令同規格有衝突,停低問,唔好自行決定。

---

## 快速開始

```bash
npm install
npm run dev          # http://localhost:3000,改完即刻見到
```

| 指令 | 做乜 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm run build` | 砌靜態站入 `dist/`,順埋生成 service worker |
| `npm run build:offline` | 同上,但完全唔上網(用 repo 入面嘅快照)。CI 用呢個 |
| `npm run refresh` | 重抓全部 API 指標。有變動先寫檔 |
| `npm run validate` | 驗全部快照符合 SPEC 第 5 節 schema |
| `npm run test:checks` | **檢查器自證**:故意整壞嘢,確認啲閘真係會嘈 |
| `node tools/serve-dist.mjs` | 喺 `:8787/hk-data-monitor/` 模擬 GitHub Pages,驗離線同子路徑 |
| `node scripts/explore-table.mjs 310-31001` | 探統計處一張表有咩 sv / cv 代碼 |

---

## 個站點運作

```
政府 API ──(GitHub Actions,每週一次)──▶ src/data/_snapshots/*.json ──▶ 靜態站 ──▶ 瀏覽器
              抓數喺呢度發生                    入咗 git,fail-soft 靠佢
```

瀏覽器**唔會**直接打政府 API。原因有三個,三個都成立:

1. 實測過統計處、財經事務及庫務局、庫務署、data.gov.hk、房屋局**全部冇 CORS header** —— 前端根本 fetch 唔到
2. SPEC 第 2 節第 6 條明文要求 build 時抓數
3. 咁樣學生嘅 IP 唔會俾任何第三方見到,亦都令離線可行

## 目錄

```
SPEC.md                      規格(凍結)
findings.md                  第 0 步探路實測結果 —— 半年後要更新數據就睇呢份
manual/README.md             人手抄數據嘅年度維護清單
docs/部署.md                 部署上 GitHub Pages 嘅步驟
docs/分階段指令.md            開發流程(第 0 至 6 步)

src/
  index.md                   首頁指標卡
  indicators/<id>.md         每個指標一版(全部係同一個模板)
  components/                共用元件:圖表、錨點、來源頁腳、資料表
  data/<id>.json.js          data loader —— 每個得三行,設定喺 _lib/indicators.js
  data/_lib/                 抓取、正規化、schema 驗證
  data/_snapshots/<id>.json  **入咗 git 嘅資料**。fail-soft 就係靠佢
  lang/                      介面字串
manual/<id>.json             人手抄嘅數據(Actions 永遠唔碰)
public/                      sw-template.js、manifest、圖示、離線橫額
scripts/                     postbuild、refresh、validate、test:checks、explore-table
```

## 加一個新指標

1. **先探表**,唔好靠估:
   ```bash
   node scripts/explore-table.mjs 130-06806
   ```
2. 喺 `src/data/_lib/indicators.js` 加一段設定(`CENSTATD_INDICATORS` 或 `FISCAL_INDICATORS`)
3. 起 `src/data/<id>.json.js` —— 抄現成嗰啲,三行
4. 起 `src/indicators/<id>.md` —— 抄現成嗰啲,全部一樣
5. 加入 `observablehq.config.js` 嘅 `pages` 同 `src/index.md` 嘅清單
6. `npm run build && npm run validate`
7. 更新 `findings.md`

---

## 五個踩過嘅坑

呢啲全部係「**唔會報錯,淨係會錯**」嗰類。詳情同實測證據喺 `findings.md`。

### 1. 統計處 API 有五種靜靜哋出錯數嘅方式,全部回 `status: Success`

最毒嗰個:向一張冇年齡維度嘅表要 `AGE:["15-24"]`,佢回 `Success`、3 行、`figure 3.8` ——
即係**把總失業率當青年失業率貼咗出去**,真值係 13.4%,差 3.5 倍,零錯誤訊息。

所以 `src/data/_lib/censtatd.js` 逐個 cv code 對返 `table_<id>_lang.json` 驗,驗唔到就 throw。
**唔好信 `status: Success`。**

### 2. `observable build` 見到快取就唔會再跑 loader

`build` 用 `useStale` 模式。改完 loader 直接 build,出嘅係舊數,而且**冇任何提示**。
所以 `npm run build` 一定要先 `rm -rf src/.observablehq/cache`(已經寫咗入 package.json)。

### 3. 「2000-01」係 2000 年 1 月定 2000–01 年度?

單睇字串分唔到,兩種喺 SPEC 第 5 節都合法。曾經因為當咗年月,
**政府收入 30 年數據得 12 年上到圖,其餘靜靜哋掉走**,圖表冇報錯。

而家由成條 series 判斷(財政年度序列一定有 `YY > 12` 嘅期數),轉唔到日期一律 throw。

### 4. `navigator.onLine` 斷晒網都回 `true`

實測確認。所以離線判斷唔可以靠佢,要靠 service worker 真正嘅網絡結果。

而且 GitHub Pages 對每個檔送 `max-age=600`(改唔到),worker 個 `fetch()` 會俾瀏覽器
HTTP 快取答咗 —— network-first 靜靜哋變 browser-cache-first。導航一定要 `cache: "reload"`。

### 5. Framework 唔會把冇被引用嘅檔案複製入 dist

`sw.js`、`manifest.webmanifest`、圖示全部唔會自己入到去,要 `scripts/postbuild.mjs` 出手。
而且 `observable build` 開頭會 `rm -rf dist`,所以呢步一定要喺 build **之後**。

manifest 亦都唔可以用 `<link rel="manifest">` 引用 —— Framework 會加雜湊搬去 `_file/`,
而 manifest 嘅 `scope` / `start_url` 係相對佢自己個 URL 解析嘅,一搬就錯晒。

---

## 授權

程式碼:[MIT](LICENSE)。

資料:**唔係一份授權,係三份**(統計處《知識產權公告》、data.gov.hk 使用條款、
budget.gov.hk 版權告示),鬆緊唔一樣,逐個指標記錄喺 JSON 同顯示喺該頁。
詳情見 `findings.md` 第 4 節同網站嘅「資料來源同授權」版。

## 私隱

唔收集任何個人資料 —— 冇帳戶、冇 cookie、冇分析工具、冇第三方請求(實測 0 個)。
見 [`PRIVACY.md`](PRIVACY.md)。
