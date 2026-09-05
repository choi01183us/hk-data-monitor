# hk-data-monitor — 專案規格

> 呢份文件放喺 repo 根目錄。每次開新 session，先讀晒呢份先動手。
> 如果任何指令同呢份規格有衝突，停低問，唔好自行決定。

---

## 1. 專案目的

一個純靜態、離線優先、繁體中文的香港數據探索網站，畀香港中學生（中一至中六，主力中三至中四）用。

配合三個課堂活動：

- **模擬社會體驗**：學生扮角色做理財決策，需要真實薪金／租金／物價數據做背景
- **資源裁定會議（分餅）**：學生喺有限資源下決定政府錢點分，需要真實政府開支結構
- **青年預算備忘**：學生寫財政建議書遞交政府，需要引用官方數字

由一個人用 Claude Code 開發同維護。呢個係最重要嘅約束——任何令維護成本上升嘅設計都要拒絕。

---

## 2. 硬規則（不可協商）

1. **零後端。** 純靜態輸出，可以部署喺 GitHub Pages / Cloudflare Pages。唔可以引入需要長期運行的伺服器、資料庫、或需要付費的服務。
2. **零個人資料。** 網站唔收集、唔儲存任何使用者資料。無帳戶、無登入、無 analytics cookie。
3. **每個數字必須有出處。** 任何顯示畀學生睇的數字，都要喺同一頁見到來源機構、來源連結、數據截至日期。無出處的數字唔可以出現。
4. **唔准估數。** 如果一個 API 攞唔到數，寧願個指標唔出現，都唔好用估算值、預設值、或訓練資料入面記得的數字填補。攞唔到就 fail，並喺 build log 講清楚。
5. **繁體中文優先。** 介面預設 zh-HK，香港用語。英文係可選第二語言，唔係預設。
6. **build 時抓數，唔係執行時抓數。** 所有數據喺 build 過程抓落靜態 JSON。瀏覽器唔應該喺執行時 call 任何外部 API。

---

## 3. 技術棧

| 項目 | 選擇 | 備註 |
|---|---|---|
| 框架 | Observable Framework | MIT，靜態站生成器，data loader 喺 build time 執行 |
| 圖表 | Observable Plot | 主力。複雜互動先考慮 ECharts |
| 地圖 | MapLibre GL + 香港開放地圖 | 只喺第二階段用。MVP 唔做地圖 |
| 部署 | Cloudflare Pages 或 GitHub Pages | 二揀一，唔好兩邊都整 |
| 排程 | GitHub Actions | 定期重抓數據並 commit |
| 語言 | TypeScript / JavaScript；data loader 可用 Python | 避免引入額外 runtime 依賴 |

**唔好引入**：React、Next.js、任何 CSS framework、任何 state management library、任何需要 build 之外的 tooling。Observable Framework 自己有齊。

---

## 4. Repo 結構

```
hk-data-monitor/
├── SPEC.md                      # 本文件
├── observablehq.config.js
├── src/
│   ├── index.md                 # 首頁：指標卡列表
│   ├── indicators/              # 每個指標一頁
│   │   └── <indicator_id>.md
│   ├── components/              # 共用元件
│   │   ├── indicator-card.js
│   │   ├── source-footer.js     # 顯示來源／連結／截至日期
│   │   └── anchor.js            # 「相當於每名市民幾多錢」換算
│   ├── data/                    # data loaders
│   │   ├── <indicator_id>.json.js
│   │   └── _lib/                # 共用抓取／正規化函式
│   └── lang/
│       ├── zh-HK.json
│       └── en.json
├── manual/                      # 人手維護的數據（PDF-only 來源）
│   ├── README.md                # 講明每個檔點更新、幾時更新
│   └── <indicator_id>.json
├── .github/workflows/
│   └── refresh-data.yml
└── public/
    ├── manifest.json
    └── sw.js
```

---

## 5. 資料 schema

每個指標輸出一個 JSON，格式固定：

```json
{
  "indicator_id": "govt_expenditure_by_policy_area",
  "name_zh": "政府開支（按政策組別）",
  "name_en": "Government expenditure by policy area group",
  "unit_zh": "百萬港元",
  "unit_en": "HK$ million",
  "source_zh": "財經事務及庫務局",
  "source_en": "Financial Services and the Treasury Bureau",
  "source_url": "https://data.gov.hk/...",
  "licence": "data.gov.hk Terms of Use",
  "updated_at": "2026-09-04",
  "data_version": "2026.09.1",
  "frequency": "annual",
  "acquisition": "api",
  "series": [
    { "period": "2025-26", "category": "教育", "value": 110000 }
  ]
}
```

規則：

- `acquisition` 只有三個值：`api`（自動抓）、`manual`（人手抄，放喺 `manual/`）、`derived`（由其他指標計出嚟）
- `data_version` 每次數據內容有變就遞增。格式 `YYYY.MM.序號`
- `updated_at` 係**數據本身的截至日期**，唔係 build 日期。兩者唔同，唔好混淆
- 所有 `period` 用字串，唔好用 Date object。財政年度寫 `2025-26`，季度寫 `2025-Q4`，月度寫 `2025-12`

---

## 6. MVP 資料來源（12 個指標）

⚠️ **以下連結同表號來自研究，未逐個實測。動手寫 loader 之前，先做探路（見 prompts 第 0 步），實測結果為準。如果實測同下表唔同，改下表，唔好夾硬跟。**

| # | indicator_id | 指標 | 來源 | 預期格式 |
|---|---|---|---|---|
| 1 | `govt_expenditure` | 政府開支（按政策組別） | data.gov.hk《政府開支預算》 | CSV (ZIP) |
| 2 | `govt_revenue` | 政府收入結構 | 立法會資料研究組 ISSF | PDF → manual |
| 3 | `fiscal_reserves` | 財政儲備 | 庫務署月度財務狀況 | HTML → manual |
| 4 | `four_key_industries` | 四大行業佔 GDP | 統計處 scode80 | web_table JSON |
| 5 | `gdp` | GDP 及人均 GDP | 統計處 table 310-31001 | web_table JSON |
| 6 | `unemployment` | 失業率（含 15–24 歲） | 統計處 table 210-06101 | web_table JSON |
| 7 | `median_wage` | 每月工資中位數 | 統計處 scode200 | web_table JSON |
| 8 | `population_pyramid` | 人口（性別 × 年齡） | 統計處 table 110-01002 | web_table JSON / CSV |
| 9 | `cpi` | 綜合消費物價指數 | 統計處 table b1060001 | CSV / JSON |
| 10 | `household_income` | 住戶入息中位數 | 統計處 scode500 | web_table JSON |
| 11 | `phr_waiting_time` | 公屋輪候時間 | 房屋局 | HTML → manual |
| 12 | `hkex_listings` | 上市公司數目／市值 | 統計處 table 340-95003 | CSV / JSON |

**PDF / HTML-only 的處理方式**：唔好寫 PDF parser。一律人手抄一次，寫成 `manual/<id>.json`，`acquisition: "manual"`，並喺 `manual/README.md` 記低下次幾時要更新、去邊度抄。呢啲數據多數一年更新一次，人手成本可接受；自動化 PDF 解析嘅維護成本會爆。

---

## 7. 資料更新機制

- GitHub Actions 每星期一次，重跑所有 `acquisition: "api"` 的 loader
- **Fail-soft**：任何一個 loader 抓唔到數，保留 repo 入面上一版 JSON，唔好覆蓋、唔好清空、唔好用空陣列頂替。喺 build log 明確列出邊個 loader 失敗、原因係乜
- 全部 loader 都失敗 → build 應該仍然成功（用晒舊數據），但要喺 Actions summary 標紅
- `manual/` 的檔案 Actions 永遠唔碰
- 每次數據有實際變動先 commit。無變動唔好留空 commit

---

## 8. 離線策略

- Service worker 預先快取 app shell + 全部指標 JSON
- 離線時頁面頂顯示一條 banner：「目前為離線快取，數據截至 YYYY-MM-DD」
- 加 PWA manifest，可以「加到主畫面」
- 全部 JSON 加埋應該遠細於 5 MB。如果超出，減指標或減歷史年份，唔好改用 lazy loading

---

## 9. 教學層要求

- 每個指標頁除咗圖，要有一個**對比錨點**：例如「呢筆開支相當於每名香港市民 $X」。錨點計算寫喺 `components/anchor.js`，用當年人口做分母
- 預設圖表用折線或長條。**唔好用**圓餅圖比較超過 5 類、唔好用 3D、唔好用雙 Y 軸——中學生睇圖表的常見誤讀多數由呢幾樣引起
- 每個圖下面要有「資料表」摺疊區，顯示原始數字（同時服務無障礙）
- 手機優先。學生多數用手機或學校平板

---

## 10. Plug-in 契約（第二階段，MVP 唔做）

接入現有課堂互動平台：

1. 平台以 URL 參數傳入 `token`
2. 數據站認 participant（只認 token，唔攞、唔存任何身份資料）
3. 學生完成探索任務後，POST 結果返平台：
   ```json
   { "token": "...", "task_id": "...", "answers": [...], "completed_at": "..." }
   ```
4. 數據站本身唔儲存任何 answer

---

## 11. 明確唔做

- 政府開支按十八區拆分 — **呢個數據唔存在**。香港財政帳目按政策組別同總目編製，唔係按地理區。唔好嘗試砌、唔好估、唔好用其他數據冒充
- 恒生指數每日數據 — 無官方免費 API，第三方來源有再發佈條款風險
- 貧窮率 — 官方已停止定期發佈，最新數據停留喺 2020 年，用咗會誤導
- CSDI 3D 建築物 — 技術太重，唔值得
- 即時／實時數據、用戶帳戶、AI 摘要、全部政府部門數據
