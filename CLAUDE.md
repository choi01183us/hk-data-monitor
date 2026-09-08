# hk-data-monitor — 工作指引

## 開場一定要做

1. **讀 `SPEC.md`** —— 佢係凍結總綱。開頭明文寫:「如果任何指令同呢份規格有衝突,停低問,唔好自行決定。」
2. **讀 `findings.md`** —— 第 0 步探路嘅實測結果。**SPEC 第 6 節嘅 12 個來源入面,有 10 個係錯嘅**,
   正確嘅表號同 endpoint 全部喺 findings.md。SPEC 自己都寫咗「實測結果為準」。
3. **讀 `docs/架構.md`** —— 三層防護邊層防乜。唔睇好易以為「fixture 綠燈 = 數據啱」,
   但 fixture 同快照係一齊更新嘅,上游漂移兩邊會一齊郁。
4. 要改人手數據就讀 `manual/README.md`。

呢個 repo **唔屬於** gravity(重力樂園)—— 2026-09-05 抽咗出嚟做獨立 git repo,
因為要用 GitHub Actions 同 Pages。gravity 嘅 `.gitignore` 已經排除咗佢。

## 技術棧

Observable Framework 1.13.4 + Observable Plot。**冇 React、冇 CSS framework、冇測試框架、冇額外 runtime 依賴**
(SPEC 第 3 節)。純 vanilla ESM。

## 指令

```bash
npm run dev            # 開發伺服器
npm run build          # 砌站 + 生成 service worker
npm run build:offline  # 唔上網砌(CI 用)
npm run refresh        # 重抓全部 API 指標
npm run validate       # 驗快照符合 SPEC 第 5 節
npm run test:checks    # 檢查器自證 + fixture 重播 + 教學換算／引用(零網絡)
npm run test:offline   # 離線行為測試(要 Playwright,冇就 SKIP)
npm run fixtures       # 重錄上游回應做 fixture
```

改完 `server`/loader **一定要真係跑一次**。`npm run validate` 只驗資料,唔驗行為。

## 最容易搞錯嘅六件事

1. **統計處 API 有五種錯法係回 `status: Success` 唔報錯嘅。**
   最毒:向錯嘅表要啱嘅 code,會攞到總數冒充分項(總失業率 3.7% 當青年失業率 11.2%)。
   加新指標前一定要 `node scripts/explore-table.mjs <表號>`,唔好靠估 cv code。

2. **`observable build` 見到 `src/.observablehq/cache/` 就唔會再跑 loader。**
   改完 loader 直接 build 會出舊數而且冇提示。`npm run build` 已經幫你 `rm -rf` 咗個 cache。

3. **`src/data/_snapshots/` 先係「上一版資料」,唔係 Framework 個 cache。**
   fail-soft(SPEC 第 7 節)靠佢。呢個目錄入咗 git,唔可以加落 `.gitignore`。
   `src/data/_fixtures/` 係同一次抓取嘅另一面(transform **之前**嘅上游回應),
   兩者要一齊 commit,否則 `test:checks` 嘅「重播對快照」會爆。

4. **Fail-soft 只覆蓋「攞唔到數」。** schema 錯、cv code 錯、換算錯 = 程式碼錯,
   一律 hard fail。用 error 類型分(`UpstreamError`),唔好用 message 分。
   加新錯誤類型嘅預設行為係 hard fail —— 呢個係刻意嘅安全預設。

5. **「2000-01」有歧義**:可以係 2000 年 1 月,亦可以係 2000–01 財政年度。
   圖表期數用 `isFiscalPeriodSeries()` 由**成條 series** 判斷,唔好逐個字串估。
   單點人口換算 `anchorPerCapita()` 由呼叫者明文傳 `fiscal: true/false`。
   年度／財年冇同年6月人口就省略錨點,唔借上一年分母。

6. **Framework 唔會 copy 冇被引用嘅檔案入 `dist/`。**
   `sw.js` / manifest / 圖示全部靠 `scripts/postbuild.mjs`,而且一定要喺 build **之後**跑
   (`observable build` 開頭會 `rm -rf dist`)。

## 加指標嘅次序

探表 → 寫 registry 設定 → `src/data/<id>.json.js`(三行)→ `src/indicators/<id>.md`(套模板)
→ 加入 `observablehq.config.js` 同 `src/index.md` → build → validate → 更新 `findings.md`。

## 合規唔等於數啱

Schema 驗證只答「格式啱唔啱」。實測人口換算 ×1000 → ×1001、失業率 `pin` 改成男性,
兩個 schema 都**完全過到**,靠「重播結果嘅 `content_hash` 對返已 commit 嘅快照」先捉到。
所以驗完 schema 唔代表驗完。

## 檢查器要自證

`npm run test:checks` 存在嘅原因係捉到過兩次「檢查器本身冇用」:

- 人口不變式第一版驗「來源自己一致唔一致」,把 pin 由 Total 改成男性**完全捉唔到**
- 分類相加用 0.2% 相對誤差,一個 1,000 百萬元嘅抄錯只係 0.167% 偏差,靜靜哋過關

**加新檢查器就要加突變測試。** 冇突變測試嘅檢查器,同冇檢查器一樣,而且更差 ——
佢會令你以為驗過。

**量度工具亦一樣。** 出第一個數之前先對三至四個已知答案自證(例如黑字白底 = 21、
`#767676` 白底 = 4.54)。已經有四次量度工具自己壞咗,其中一次差啲報咗 56 個假警報。
未自證過嘅量度結果,唔准寫入報告或者 commit message。詳見 `docs/架構.md`。

## 硬規矩(SPEC 第 2 節,不可協商)

零後端 · 零個人資料 · 每個數字必須有出處 · **唔准估數**(攞唔到就 fail,唔准用預設值或者
訓練資料入面記得嘅數字填補)· 繁體中文優先 · build 時抓數唔係執行時抓數。
