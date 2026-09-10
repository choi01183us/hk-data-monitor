# 香港數據監測站 · hk-data-monitor

純靜態、離線優先、繁體中文嘅香港公開數據網站,畀香港中學生(主力中三至中四)用。

配合三個課堂活動:**模擬社會體驗**、**資源裁定會議(分餅)**、**青年預算備忘**。

規格見 [`SPEC.md`](SPEC.md) —— **改嘢之前先讀佢**。任何指令同規格有衝突,停低問,唔好自行決定。

---

## 快速開始

```bash
npm ci
npm run dev          # http://localhost:3000,改完即刻見到
```

| 指令 | 做乜 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm run build` | 砌靜態站入 `dist/`,順埋生成 service worker |
| `npm run build:offline` | 資料用 repo 快照；首次建置仍需下載 Framework 套件。CI 設 HKDM_OFFLINE=1 |
| `npm run refresh` | 重抓全部 API 指標。有變動先寫檔 |
| `npm run refresh:city` | 更新政府公報及前一日客機紀錄；快照及錄影同次保存 |
| `npm run validate` | 驗全部快照同 `manual/` 符合 SPEC 第 5 節(零網絡,`build` 開頭會自動跑) |
| `npm run test:checks` | **檢查器自證**:故意整壞嘢,確認啲閘真係會嘈(零網絡) |
| `npm run test:offline` | 離線行為測試(本專案 Playwright + Chromium；缺工具會失敗) |
| `npm run fixtures` | 重錄上游回應做離線測試用嘅 fixture |
| `node tools/serve-dist.mjs` | 喺 `:8787/hk-data-monitor/` 模擬 GitHub Pages,驗離線同子路徑 |
| `node scripts/explore-table.mjs 310-31001` | 探統計處一張表有咩 sv / cv 代碼 |

---

## 離線驗證工具

`playwright` 1.61.1 只用作開發測試，版本列入 package-lock，唔會加入網站資源。
先 `npm ci`，再 `npx --no-install playwright install chromium`（Linux CI 加 `--with-deps`）。
`npm run build` 後執行 `npm run test:offline`；缺套件或 Chromium 必須失敗，唔用 SKIP 當通過。
CI 喺上載同一份 `dist/` 前實跑離線測試；`BASE_PATH=/` 可驗根網域，預設為 `/hk-data-monitor/`。

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
docs/架構.md                 **三層防護邊層防乜 + 量度工具要自證** —— 開工前睇一眼
docs/手機驗收清單.md          改完 UI 要喺真機跑一次
docs/課堂試用記錄.md          老師與小組學生試用嘅空白記錄
docs/部署.md                 部署上 GitHub Pages 嘅步驟
docs/分階段指令.md            開發流程(第 0 至 6 步)

src/
  index.md                   首頁指標卡
  indicators/<id>.md         每個指標一版(全部係同一個模板)
  components/                共用元件:圖表、錨點、來源頁腳、資料表
  data/<id>.json.js          data loader —— 每個得三行,設定喺 _lib/indicators.js
  data/_lib/                 抓取、正規化、schema 驗證
  data/_snapshots/<id>.json  **入咗 git 嘅資料**。fail-soft 就係靠佢
  data/_fixtures/*.json.gz   錄低嘅上游回應。test:checks 靠佢零網絡跑完整 transform
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

## 三層防護

Fixture 重播防**程式碼**回歸、不變式檢查防**上游數據**漂移、fail-soft 防**可用性**。
三層唔重疊,而且 **fixture 唔保護上游漂移**(錄影同快照一齊更新,會一齊郁)。
細節見 [`docs/架構.md`](docs/架構.md) —— 呢份唔睇好易以為「fixture 綠燈 = 數據啱」。

**合規唔等於數啱**:schema 驗證只答格式,唔答個數。實測人口換算 ×1000 → ×1001、
失業率 `pin` 改成男性,兩個 schema 都完全過到,靠對返快照嘅 `content_hash` 先捉到。

## 六個踩過嘅坑

呢啲全部係「**唔會報錯,淨係會錯**」嗰類。詳情同實測證據喺 `findings.md`。

### 1. 統計處 API 有五種靜靜哋出錯數嘅方式,全部回 `status: Success`

最毒嗰個:向一張冇年齡維度嘅表要 `AGE:["15-24"]`,佢回 `Success`、3 行、`figure 3.8` ——
即係**把總失業率當青年失業率貼咗出去**,真值係 13.4%,差 3.5 倍,零錯誤訊息。

所以 `src/data/_lib/censtatd.js` 逐個 cv code 對返 `table_<id>_lang.json` 驗,驗唔到就 throw。
**唔好信 `status: Success`。**

### 2. Fail-soft **只**覆蓋「攞唔到數」

SPEC 第 7 節嘅 fail-soft 係為咗網絡／HTTP／上游格式變 —— 嗰啲下星期再抓有機會好返。

**schema 驗證失敗、cv code 寫錯、換算寫錯係程式碼錯,一律 hard fail。**
用 error 類型分(`UpstreamError` vs 其他),唔用 message 分。

點解要分:實測過 loader 寫漏 `source_url`,fail-soft 吞咗,build 綠燈,
而個站出緊上星期嘅快照 —— 冇人會發現。

### 3. `observable build` 見到快取就唔會再跑 loader

`build` 用 `useStale` 模式。改完 loader 直接 build,出嘅係舊數,而且**冇任何提示**。
所以 `npm run build` 一定要先 `rm -rf src/.observablehq/cache`(已經寫咗入 package.json)。

仲有一層更陰功嘅:快照有 **6 日新鮮期**,期間 loader **完全唔會執行** ——
即係改壞咗 transform,`npm run build` 唔會知,CI 用 `HKDM_OFFLINE=1` 更加永遠唔會知。

三道閘一齊擋:
1. `build` 開頭 `npm run validate` —— 驗現有快照同 `manual/`(零網絡)
2. `test:checks` 用 `src/data/_fixtures/` 重播一次完整 transform,再對返快照
   (零網絡、重播所有自動指標；另驗城市快照)
3. schema 錯誤 hard fail,唔行 fail-soft(見上面第 2 條)

### 4. 「2000-01」係 2000 年 1 月定 2000–01 年度?

單睇字串分唔到,兩種喺 SPEC 第 5 節都合法。曾經因為當咗年月,
**政府收入 30 年數據得 12 年上到圖,其餘靜靜哋掉走**,圖表冇報錯。

而家由成條 series 判斷(財政年度序列一定有 `YY > 12` 嘅期數),轉唔到日期一律 throw。

### 5. `navigator.onLine` 斷晒網都回 `true`

實測確認。所以離線判斷唔可以靠佢,要靠 service worker 真正嘅網絡結果。

而且 GitHub Pages 對每個檔送 `max-age=600`(改唔到),worker 個 `fetch()` 會俾瀏覽器
HTTP 快取答咗 —— network-first 靜靜哋變 browser-cache-first。導航一定要 `cache: "reload"`。

### 6. Framework 唔會把冇被引用嘅檔案複製入 dist

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
