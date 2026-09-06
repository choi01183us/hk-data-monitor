# findings.md — 第 0 步探路實測結果

> 實測日期：2026-09-04／05。全部結果由實際 HTTP 請求得出，唔係文件推斷。
> 抽查方法：每條 `verdict: api` 嘅 endpoint 都獨立重跑過，並且核對 byte 數。
>
> **呢份唔係中間產物，係資產。** 半年後要更新數據、或者邊個來源死咗要換，睇返呢份。

## 總結

| | 數目 |
|---|---|
| 可以自動抓（`api`） | **10** |
| 要人手抄（`manual`） | **2** |
| 攞唔到（`unavailable`） | 0 |

**SPEC 第 6 節 12 行入面，只有第 5 行（`gdp`）同第 12 行（`hkex_listings`）嘅表號係完全啱嘅。**
其餘 10 行都要改。SPEC 第 6 節自己都寫咗「實測結果為準」，所以下面呢張表取代佢。

好消息：SPEC 估有 3 個要人手抄，實測**得返 1 個半**（政府收入同財政儲備都有現成 machine-readable 來源）。

---

## 1. 修正後嘅來源表（取代 SPEC 第 6 節）

| # | indicator_id | 指標 | SPEC 寫 | **實測正確來源** | verdict |
|---|---|---|---|---|---|
| 1 | `govt_expenditure` | 政府經常開支（4 類） | data.gov.hk《政府開支預算》CSV(ZIP) | **FSTB CSV** `fin-stats_recurrent-exp_a_tc.csv` | api |
| 1b | `govt_expenditure_policy_groups` | 開支（10 個政策組別） | *SPEC 冇列* | budget.gov.hk 附錄B **PDF** | manual |
| 2 | `govt_revenue` | 政府收入結構 | 立法會 ISSF PDF → manual | **FSTB CSV** `fin-stats_govt-revenue_c_tc.csv` | **api**（升級） |
| 3 | `fiscal_reserves` | 財政儲備 | 庫務署 HTML → manual | **庫務署 JSON** `press_release_{年度}_c.json` | **api**（升級） |
| 4 | `four_key_industries` | 四大行業佔 GDP | 統計處 `scode80` | 統計處表 **`655-82101`** | api |
| 5 | `gdp` | GDP 及人均 GDP | 統計處 `310-31001` | ✅ **冇錯** | api |
| 6 | `unemployment` | 失業率（含 15–24 歲） | 統計處 `210-06101` | 統計處表 **`210-06401`** | api |
| 7 | `median_wage` | 每月工資中位數 | 統計處 `scode200` | 統計處表 **`220-23011`** | api |
| 8 | `population` | 人口（性別 × 年齡） | 統計處 `110-01002` | **`110-01001`**（5 歲組）／`110-01002`（逐歲） | api |
| 9 | `cpi` | 綜合消費物價指數 | 統計處 `b1060001` | 統計處表 **`510-60001`** | api |
| 10 | `household_income` | 住戶入息中位數 | 統計處 `scode500` | 統計處表 **`130-06102`**（+ `130-06806` 十八區） | api |
| 11 | `phr_waiting_time` | 公屋輪候時間 | 房屋局 HTML → manual | ✅ hb.gov.hk HTML | manual |
| 12 | `hkex_listings` | 上市公司數目／市值 | 統計處 `340-95003` | ✅ 表號啱，但**來源機構要標 HKEX** | api |

### 點解錯

- **`scode80` / `scode200` / `scode500` 唔係表號**，係「統計主題」代碼。打入 API 直接 `Fail: Table ID (scode80) is not defined`。
  （`scode200` 仲要指錯主題 —— 工資喺 `scode210`，唔係 200。）
- **`b1060001` 係刊物編號**，唔係表號。佢個頁面只有 PDF。
- **`210-06101` 冇年齡維度。** `table_210-06101_comp.json` 嘅維度只有 `CCYY / M3M / SEX`。
  SPEC 明文要「含 15–24 歲」，呢個表**做唔到**。要用 `210-06401`。

---

## 2. 政府統計處 API（8 個指標共用）

**呢個係整個專案最重要嘅一段。** 統計處有一支冇公開宣傳嘅 JSON API：

```bash
curl -sS -X POST "https://www.censtatd.gov.hk/api/post.php" \
  --data-urlencode 'query={"id":"310-31001","lang":"tc","sv":{"CURPGDP":["Raw_hkd_d"]},"cv":{},"period":{"start":"196101"}}'
```

回應：`{header: {status, title, tablenote, source, count}, dataSet: [...]}`，`dataSet` 係 long format，一格數字一行。

### 元資料靜態檔（發現表號同合法代碼用）

| 檔案 | 內容 |
|---|---|
| `/data/tc/all_web_tables.json` | 全站 **580 個表**嘅目錄。**頂層係 dict，key = 表號**（唔係 array） |
| `/data/table_<id>_comp.json` | 表結構：合法 sv × 呈現方式、cv 維度、`cv_position`、`show_total`、`default_series_period` |
| `/data/tc/table_<id>_lang.json` | 中文標籤：`cv_list.<維度>.ccg_list[*].cc_list`（合法 cv code 全集）、註腳、來源 |
| `/data/tc/sd_lang.json` | 特殊符號字典（數字代碼 → 符號），用嚟解 MDT CSV，唔係解 API |

### ⚠️ 五個會「靜靜哋出錯數」嘅陷阱（全部實測重現過）

呢啲全部回 `status: Success`，唔會報錯，所以 **loader 唔可以信 `status`**。

1. **`cv` 唔填** → 回嘅數會把幾個分類組溝埋。實測四大行業「貿易及物流」由真值 **18.9 變成 18.8**，而且完全冇 `IND` 標籤欄，分唔清邊個係邊個。
2. **`cv` code 打錯字** → Success，靜靜哋 fallback 落 Total。
3. **向錯嘅表要啱嘅 code（最毒）** → 向 `210-06103` 要 `AGE:["15-24"]`（該表冇呢個 code），回 Success、3 行、`figure: 3.8`。
   **即係把總失業率 3.8% 當咗青年失業率貼出去 —— 真值係 13.4%，差 3.5 倍，零錯誤訊息。**
4. **`period` 唔寫** → 只回 `comp.json` 嘅 `default_series_period`。實測 `510-60001` 唔寫 period 回 51 行全部年度，**一個月度數字都冇**。
5. **`period` 寫咗** → 年度同高頻**溝埋同一個 array** 回。GDP 一次過回 `freq:"Y" period:"2024"` 同 `freq:"Q" period:"202403"`。淨係攞 `period + figure` 畫圖會把全年同一季擺埋同一條線。

**→ 硬規矩（已寫入 `src/data/_lib/censtatd.js`）：**
- 每個 cv code 都要對返 `table_<id>_lang.json` 嘅 `cc_list` 驗，驗唔到就 `throw`
- 永遠明文寫 `period.start`
- 逐行睇 `freq`，唔好假設一個 query 得一種頻率
- `comp.json` 入面 `cv_position != "0"` 嘅維度先係必填（`130-06102` 冇非時間維度，`cv:{}` 合法）
- `sv` 打錯會即刻 `Fail`，所以 sv 唔使自己驗

### 其他實測結論

- **`lang` 只食 `tc` / `en`。** `zh_tc`、`zh_hk`、`zh-tw`、`chi` 全部 Fail。
- **用 POST，唔好用 GET。** GET 條 `param` 要 `LZString.compressToEncodedURIComponent` 壓縮；塞未壓縮 JSON 會俾 Azure WAF 擋，回 **HTML 403**（loader 會喺 `JSON.parse` 爆）。POST 完全唔使掂呢樣。
- **`stat_pres` 代碼含 `%` 字元**（`Prop_1dp_%_n`），成個 query 一定要 urlencode。
- **U+F969 相容漢字陷阱。** `220-23011` 嘅 `svDesc`「第五十個百分**數**」個「數」係 U+F969，唔係 U+6578，直接字串比對永遠 False。
  **解法：所有由 API 攞返嘅中文字串一律 `normalize("NFC")`。** 唔好用 NFKC（會順手把全形括號打成 ASCII）。
  呢類相容漢字係逐個表隨機出現嘅，唔可以「試過一個表冇事就當全站冇事」。
- **唔好行 MDT CSV 備援路線。** 冇數嗰陣寫成 `0.0000000000` 或 `-1.0000000000`，當真數會插出假點；而且冇中文標籤；`210-06401` 嘅 CSV 仲會把重疊嘅年齡組溝埋（`15-19, 20-24, 15-24` 同時出現，double count）。
- **禮貌**：每個請求之間 `sleep 1`。曾經有人撞過間歇性 WAF 403，要 retry + backoff，唔好當 403 係「條 URL 錯」。

---

## 3. CORS：SPEC 第 2 節第 6 條係硬性正確

帶 `Origin: https://example.com` 掃過 6 個 host：

| host | CORS |
|---|---|
| censtatd.gov.hk | ❌ 零個 `access-control-*`；`OPTIONS` 回 405 |
| fstb.gov.hk / try.gov.hk / data.gov.hk / hb.gov.hk | ❌ 全部冇 |
| **api.hkma.gov.hk** | ✅ 唯一例外，有 `Access-Control-Allow-Origin` |

**→ 瀏覽器 runtime fetch 一定死。build time 抓數係唯一做法。**
啱好夾 SPEC 第 2 節第 6 條同離線優先設計。呢點應該寫入架構決定，唔好將來有人「順手」改成前端抓。

---

## 4. 授權：**三份唔同文件，唔可以當一份**

SPEC 第 5 節個 schema 例子寫死 `"licence": "data.gov.hk Terms of Use"` —— **唔夠，要逐個指標一個**。

| 授權 | 適用指標 | 關鍵條款 |
|---|---|---|
| **政府統計處《知識產權公告》**<br>`https://www.censtatd.gov.hk/tc/page_31.html` | 8 個 C&SD 指標 | 商業／非商業都可以，要註明來源、知識產權擁有人，**同任何修改** |
| **data.gov.hk 使用條款**<br>`https://data.gov.hk/tc/terms-and-conditions` | `govt_expenditure`、`govt_revenue`、`fiscal_reserves` | 商業／非商業都可以，但**多一條彌償（indemnify）條款** |
| **budget.gov.hk 版權告示**<br>`https://www.budget.gov.hk/2026/chi/important.html` | 附錄B PDF（10 組政策開支） | ⚠️ **窄好多**：只准「個人參考或教育用途」，**複製本不能轉售或商業分發**；圖片要預先批准 |
| **hb.gov.hk** | `phr_waiting_time` | ⚠️ **冇開放數據授權頁**。全部 12 個指標入面授權最弱嗰個 |

> 統計處嗰份要求「指出任何修改」—— 所以如果我哋把「百萬港元」換算成「億元」，畫面上要寫明換算過。

---

## 5. 兩個要人手抄嘅（`manual/`）

### 5a. `govt_expenditure_policy_groups` — 10 個政策組別開支

- 來源：`https://www.budget.gov.hk/{YYYY}/chi/pdf/c_appendices_b.pdf`（附錄B）
- 更新：每年 2 月尾預算案之後
- 抄邊度：第II部（經常開支）page 7/8、第III部（開支總額）page 9/10
- 每份 PDF 只有 3 個年度（上年實際／本年修訂／下年預算）

**⚠️ 口徑陷阱（對「分餅」活動致命）**：附錄B 同時有兩套數 ——
「**公共**開支」（包埋房委會等營運基金）同「**政府**開支」（只計政府帳目）。
房屋一項：政府 1,226 百萬 vs 公共 22,635 百萬，**差 18 倍**。
揀錯會令學生以為政府幾乎冇使錢喺房屋。**兩套都要抄，畫面要寫明用緊邊套。**

SPEC 第 6 節明文寫「唔好寫 PDF parser。一律人手抄一次」，所以就算 PDF 有真文字層抽得到，都照 `manual` 行。

### 5b. `phr_waiting_time` — 公屋輪候時間

- 來源：`https://www.hb.gov.hk/tc/publications/housing/cwt/index.html`（**房屋局**，唔係房委會）
- 更新：每季
- 數字藏喺中文散文段落，冇表格、冇 CSV/JSON

**⚠️ 要拍板**：官方同時公布兩個定義唔同嘅數字 ——
`CWT`（**綜合**輪候時間，含簡約公屋）**4.8 年** vs `AWT`（只計傳統公屋）**5.5 年**。
差 0.7 年，中學生好易撈亂。兩個都出就要喺畫面寫清楚分別。

陰性證據（確認真係冇 API）：`data.gov.hk` 嘅 `package_list` 有 **3,816 個 dataset**，grep `wait` 只中 7 個（入境處管制站、社署安老院舍／日間／康復服務、醫管局急症室及專科門診），**一個都唔係公屋**。

---

## 6. 建議嘅開發次序

1. **`gdp`（310-31001）做第一條通路。** SPEC 12 行入面唯一完全冇錯嗰個，而且 sv 簡單（`CURPGDP`）、cv 空、年度資料 1961–2025 一條線畫得。
2. **`population`（110-01001）行第二。** 因為佢係 SPEC 第 9 節「對比錨點」（相當於每名市民幾多錢）嘅**分母**，其他指標要等佢。
3. 跟住 `govt_expenditure` → `govt_revenue` → `fiscal_reserves`（三個課堂活動最需要嘅財政數據）。
4. `unemployment`、`median_wage`、`household_income`、`cpi`（模擬社會體驗要嘅生活數據）。
5. `four_key_industries`。
6. `hkex_listings` 排最尾 —— 同三個課堂活動關聯最弱。

---

## 7. 仲要負責人拍板嘅事

| # | 事項 | 選項 |
|---|---|---|
| 1 | `median_wage` 口徑 | 所有僱員 $21,200 **定** 全職僱員 $22,200（2025）。建議「所有僱員」，但成條序列鎖死唔准中途轉 |
| 2 | `phr_waiting_time` | CWT 4.8 年／AWT 5.5 年／兩個都出 |
| 3 | `population` | 包唔包外傭 |
| 4 | `household_income` | 加唔加 `130-06806`（十八區）—— 2025 年中西區 $45,000 對觀塘 $24,900，現成嘅貧富差距教材 |
| 5 | 開支口徑 | 公共開支 定 政府開支（見 5a） |

---

## 8. 已拍板嘅決定(2026-09-05)

| 事項 | 決定 | 影響 |
|---|---|---|
| 資料來源 | **SPEC 第 6 節為主**,另保留 World Bank 做少量「國際比較」指標;天文台剔走 | WB 轉接器已由 `src/data/_lib/` 移走(git 歷史仲有),留待國際比較階段按 SPEC 第 5 節重寫 |
| 部署 | **GitHub Pages**(SPEC 第 3 節「二揀一」) | 抓數同上線同用 GitHub Actions,唔使多開戶口同 secret |
| Repo | **獨立 repo**,唔再係 gravity 嘅子目錄 | gravity 嘅 `.gitignore` 已加 `hk-data-monitor/`,同 `remotion-app/` 一樣 |

### SPEC 之外加咗嘅嘢(要負責人知)

1. **`src/data/_snapshots/`** —— SPEC 第 4 節冇畫呢個目錄,但第 7 節嘅 fail-soft 需要一個
   入咗 git 嘅「上一版 JSON」。唔可以用 Framework 自己個 cache:
   `observable build` 係 `useStale` 模式,見到 cache 就唔會再跑 loader,
   即係改完 loader 都出舊數而且冇提示;clean build 之後亦乜都冇。
   用 `_` 開頭跟返 SPEC 自己 `src/data/_lib/` 嘅寫法。

2. **schema 加咗幾個欄位** —— `licence_url`、`content_hash`、`fetched_at`、`build`、
   `coverage`、`latest`、`category`、`question_zh`、`chart`、`anchors`、`notes_zh`、
   `source_note_zh`、`unit_short_zh`。逐個理由寫喺 `src/data/_lib/schema.js` 頂。
   最要緊嗰兩個:`licence_url`(硬規則第 3 條要撳得入去睇條款原文,一個名撳唔到)、
   `content_hash`(`data_version` 係 `YYYY.MM.序號`,要有嘢判斷「內容有冇變」先加得序號)。

3. **`gdp` 只做人均,唔做總額** —— SPEC 第 5 行寫「GDP 及人均 GDP」,
   但總額單位係「百萬港元」(3,186,526)、人均係「港元」(444,044),差 7 個數量級,
   而 schema 得一個 `unit_zh`。夾硬擺埋一齊就一定要用雙 Y 軸,直接違反 SPEC 第 9 節。
   建議 SPEC 第 6 節第 5 行拆成 `gdp`(人均)同 `gdp_total`(總額)兩個指標。

### 第 1 步驗收記錄

- `npm run build` 出到靜態檔,4 版,0 個 console error
- 指標頁見到圖、來源連結、數據截至日期(2026-08-14)、授權、`data_version`
- **零第三方請求**(Playwright 實測 `externalReqs: []`),`<html lang="zh-HK">`
- 資料表 65 行,錨點 3 個(每個都有算式)
- **fail-soft 實測過**:故意把表號改壞 → loader exit 0、舊快照 byte 對 byte 冇變、
  照出 65 點、畫面出「上一次成功更新」提示連技術原因
- **冪等實測過**:連跑兩次 `HKDM_REFRESH=1`,第二次報 `unchanged`,檔案冇郁 → 唔會有空 commit
- **驗證閘實測過**:刪走 `source_url` → `npm run validate` 準確報「缺少 SPEC 第 5 節必要欄位 source_url」

### 第 3 步驗收記錄(2026-09-05)

11 個可自動抓嘅指標全部接通,每個都經 Playwright 實測:大字、錨點、圖、資料表、來源、零第三方請求、零 console error。

| 指標 | 對應活動 | 圖 | 實測金絲雀 |
|---|---|---|---|
| `govt_expenditure` | 分餅、預算備忘 | 4 線 + 總額 | 分類相加 = 總額(誤差 < 0.2%) |
| `govt_revenue` | 分餅、預算備忘 | 6 線 + 總額 | 同上;地價收入 2026-27 只係 2017-18 高峰嘅 11% |
| `fiscal_reserves` | 預算備忘 | 單線(月度) | 儲備 ÷ 12 個月平均開支 ≈ 9.9 個月 |
| `gdp` | 三個都用 | 單線 | — |
| `population` | 全站錨點分母 | 單線 | Total = 男+女(每期,誤差 < 0.5%)|
| `unemployment` | 模擬社會 | 雙線 | 青年 11.2% ≠ 整體 3.7%(冇中「冒充 Total」)|
| `median_wage` | 模擬社會 | 雙線(兩個口徑並列) | — |
| `household_income` | 模擬社會 | 單線 | — |
| `cpi` | 模擬社會 | 單線(月度) | 537 點齊,「2005-06」冇被當成財政年度 |
| `four_key_industries` | 預算備忘 | 4 線 | 貿易及物流 2024 = 18.9(cv 填錯會變 18.8)|
| `hkex_listings` | (關聯最弱) | 雙線 | — |

**捉到嘅 bug(全部係「唔報錯、淨係錯」嗰類)**:
- `toDate("2000-01")` 把財政年度當成年月 → 政府收入 30 年得 12 年上到圖,其餘靜靜哋掉走。
  而家由成條 series 判斷係咪財政年度(一定有 YY > 12 嘅期數),轉唔到日期就 throw。
- 人口不變式第一版驗「來源自己一致唔一致」,突變測試(pin 改成男性)完全捉唔到;改成驗最終 series。
- `Number("")` 係 0 唔係 NaN,冇數嘅格會被當成 0 —— 一律用 `toValue()`。
- 多分類指標嘅大字靜靜哋淨係揀咗 series 最尾嗰個分類(失業率出「4%」唔講係邊組)。

### 第 4 步驗收記錄(2026-09-05)

`manual/` 兩個指標嘅骨架已起好,數值全部留 `null` 等人手填:

| 檔 | 抄邊度 | 幾時抄 | 要拍板 |
|---|---|---|---|
| `phr_waiting_time.json` | hb.gov.hk 公屋輪候網頁 | 每季 | CWT / AWT 兩個定義都預留咗位,兩條線並列 |
| `govt_expenditure_policy_groups.json` | 預算案附錄 B PDF 第 II 部 | 每年 2 月尾 | 已鎖死用「政府開支」口徑,寫咗喺 `basis_zh` |

**設計上嘅硬規矩**:
- 未填數(全部 `null`)-> `manual_status: "todo"` -> **首頁唔會出佢張卡、頁面唔會畫圖**。
  跟 SPEC 第 2 節第 4 條:寧願個指標唔出現,都唔用估算值頂住。
- `maxAgeMs: 0` —— 人手改完 `manual/` 即刻生效,唔會俾六日快照期蓋住。
- `expected_totals` 令十個組別相加要等於 PDF 自己寫嘅總額,對唔上就 build fail。
- 探路員讀到嘅數字(CWT 4.8 年、AWT 5.5 年)**冇填入去** —— 未經負責人核對嘅數唔可以當數據。

**檢查器自證(`npm run test:checks`,52 項,全部離線)**:

呢個 script 係因為兩次真實失敗先加嘅:

1. 人口不變式第一版驗「來源自己一致唔一致」。把 pin 由 Total 改成男性 —— **完全捉唔到**,
   男性人口照樣當成「香港人口」出街。改成驗最終 series 先有用。
2. 分類相加原本用 **0.2% 相對誤差**。一個 1,000 百萬元嘅抄錯只係 0.167% 偏差,靜靜哋過關。
   實測兩份 FSTB 檔 30 個年度全部**零誤差**,所以改成絕對誤差(容忍 1 百萬元,純粹防浮點)。
   而家捉得到細至 2 百萬元嘅抄錯。

已知捉唔到嘅:兩個分類調轉位(相加一樣)。靠 `category_order` 鎖死次序 + 人手核對。
呢個限制明文寫咗喺測試入面,唔係漏咗。

### 仲未做(按分階段指令)
- 第 5 步:`refresh-data.yml`、service worker、PWA manifest、離線 banner
- 第 6 步:GitHub Pages 部署

---

## 9. 對比度量度(2026-09-06)

### 量咗乜、結果

`--theme-foreground-muted` 同 `--theme-foreground-faint` 兩個 token 加深咗
(見 `src/style.css` 頂部嘅註解)。改之前踩得最低嗰個係 `.anchor__basis` **4.1:1** ——
就係要學生自己驗算嗰條算式。

| 範圍 | 結果 |
|---|---|
| 淺色模式,3 版,**54 種**文字色彩組合 | 全部 ≥ 4.5,最低 **4.74:1** |
| 深色模式,3 版,**55 種**文字色彩組合 | 全部 ≥ 4.5,最低 **4.91:1** |
| 圖表軸刻度文字(2 版) | 淺色 **16.71:1**、深色 **12.43:1** |

量咗嘅 3 版:首頁、`indicators/govt_revenue`、`indicators/unemployment`(全站共 17 版)。

軸刻度用 `--theme-foreground`(全前景色)唔係 muted,所以改 token 對佢哋冇影響,
佢哋本身已經遠遠過關。但係 **10px**,細字喺手機易唔易讀係另一回事,列入手機驗收清單。

### ⚠️ 未量嘅 —— 唔可以當「WCAG AA 達標」

**準確講法係「已量嘅 109 種文字組合全部符合 AA」,唔係「個站符合 AA」。**

未量:

- **其餘 14 版**(其他指標頁、`about/*`、404)
- **SVG 入面除軸刻度以外嘅文字** —— 圖例標籤、tooltip
- **離線橫額** —— 要離線狀態先出現
- **非文字對比(WCAG 1.4.11)** —— 圖表線色、邊框、focus 指示、表單控件
- **其他 viewport 闊度** —— 只量咗 390px。對比度本身同闊度無關,
  但版面一變,同一個元素可能疊喺唔同背景上面
- **真機** —— 全部喺 Chromium 量。iOS Safari 嘅色彩管理可能有出入

其餘 14 版同 SVG 其他文字排咗入後備清單,唔係而家做。

### 量度工具本身出過四次錯

呢一項嘅過程值得記低,因為佢直接支持 `docs/架構.md` 嗰條「量度工具要自證」:

1. `| tail -46` 食晒輸出 —— 睇落似 script 掛咗
2. regex 當 `color(srgb 0.195 …)` / `oklch(…)` 係 0–255 嘅 rgb,除以 255 之後全部變接近 0
   → 大量 `1:1`,**如果照報就係 56 個假警報**
3. 疊色次序反轉 —— `--hk-surface` 係「前景色 4% 透明」,攞咗原始 RGB 冇疊落底,
   淺色模式報咗 `rgb(26,26,26)` 做背景
4. 量軸刻度嗰陣,`body` 喺深色主題係透明,fallback 寫死白色 → 深色模式報「白底」

四次都係**工具講嘅嘢同現實唔同**,唔係產品有事。最後用四組已知答案自證
(黑字白底 21、`#767676` 白底 4.54、`#777` 白底 4.48、白字黑底 21)全中先信。

---

## 10. World Bank —— 正式剔走(2026-09-06)

### 決定

**唔入 MVP,亦唔入第二階段。**

### 三個理由

1. 三個課堂活動(模擬社會體驗、資源裁定會議、青年預算備忘)**全部係香港本地脈絡**。
   「香港人均 GDP 排世界第幾」答唔到「政府啲錢應該點分」。
2. 多一個來源家族 = 第四份授權、第四個轉接器、第四種失敗模式。
   SPEC 第 1 節寫明任何令維護成本上升嘅設計要拒絕。
3. 優先次序:分餅嘅數據仲係空,十一月要用。

### 復原路徑

`src/data/_lib/worldbank.js` 喺 commit `e4ee3aa` **之前**仍然喺 git 歷史入面。
但佢係舊 schema(`unit` / `source` / `date`),要按 SPEC 第 5 節重寫先用得。

```bash
git show e4ee3aa^:src/data/_lib/worldbank.js
```

### 重開條件

個站入過課室之後,如果**實際觀察到**學生問「香港同其他地方比點」,先重新考慮。
唔係靠估。

### 過程記錄

2026-09-05 曾經拍板「SPEC 為主 + 保留 WB 做國際比較」。之後**冇實作,亦冇報告過冇實作** ——
係項目擁有人自己喺對數階段揀返出嚟嘅。呢個係第二單「冇報告嘅偏離」
(第一單係人口指標由金字塔降級做總人口),所以 SPEC 第 2 節第 7 條
(偏離要即時報)由「應該寫」升格做必寫。
