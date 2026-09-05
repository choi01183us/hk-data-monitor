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
