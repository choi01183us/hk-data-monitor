// 政府統計處(C&SD)開放數據 API 客戶端。
//
// 8 個指標共用呢一支。詳細實測結果見 findings.md 第 2 節。
//
// 呢個檔案存在嘅唯一理由,係統計處個 API 有五種「靜靜哋出錯數」嘅方式,
// 全部都回 status: Success,唔會報錯。最毒嗰個實測重現過:
//
//     向 210-06103 要 AGE:["15-24"](該表根本冇呢個 code)
//       -> Success、3 行、figure 3.8
//       -> 即係把總失業率 3.8% 當咗青年失業率貼出去,真值係 13.4%,差 3.5 倍
//
// SPEC 第 2 節硬規則第 4 條:「唔准估數……攞唔到就 fail。」
// 所以呢度嘅取態係:寧願 throw,都唔好回一個貌似合理嘅錯數。
//
// 對應嘅防線:
//   1. 每個 cv code 都對返 table_<id>_lang.json 嘅 cc_list 驗,驗唔到即刻 throw
//   2. 必填嘅 cv 維度冇填 -> throw(唔填會令幾個分類組溝埋,實測 18.9 變 18.8)
//   3. period.start 一定要明文寫 -> 唔寫只會回預設頻率,靜靜哋漏晒月度數據
//   4. 一個 query 可以回多過一種 freq,所以一定要逐行睇 freq 分流
//   5. 所有中文字串行 NFC(220-23011 有 U+F969 相容漢字,直接比對永遠 False)

import { fetchJson, fetchText, politePause } from "./http.js";

const API_URL = "https://www.censtatd.gov.hk/api/post.php";
const DATA_BASE = "https://www.censtatd.gov.hk/data";

/** 統計處只食 tc / en。實測 zh_tc / zh_hk / zh-tw / chi 全部 Fail。 */
const VALID_LANGS = new Set(["tc", "en"]);

export const CENSTATD_LICENCE = {
  licence: "政府統計處《知識產權公告》",
  licence_url: "https://www.censtatd.gov.hk/tc/page_31.html",
  source_zh: "政府統計處",
  source_en: "Census and Statistics Department, HKSAR Government",
};

/**
 * NFC 正規化。
 *
 * 220-23011 嘅 svDesc「第五十個百分數(港元)」入面個「數」係 U+F969
 * CJK COMPATIBILITY IDEOGRAPH,唔係正常嘅 U+6578,直接字串比對永遠 False。
 *
 * 用 NFC 唔用 NFKC:NFKC 會順手把全形括號 U+FF08/FF09 打成 ASCII,
 * 令中文標籤變得唔倫不類。
 */
export function nfc(value) {
  return typeof value === "string" ? value.normalize("NFC") : value;
}

/** 遞迴把物件入面所有字串正規化。 */
function nfcDeep(value) {
  if (typeof value === "string") return nfc(value);
  if (Array.isArray(value)) return value.map(nfcDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, nfcDeep(v)]));
  }
  return value;
}

// 同一次 build 入面同一張表嘅元資料只攞一次。
const metaCache = new Map();

/**
 * 攞一張表嘅元資料。
 *
 * comp.json  結構:合法 sv x 呈現方式、有咩維度、show_total、since、最後更新日期
 * lang.json  中文標籤:每個維度嘅合法 class code 全集、單位描述、註腳、來源
 */
export async function fetchTableMeta(tableId, lang = "tc") {
  if (!VALID_LANGS.has(lang)) {
    throw new Error(`統計處 lang 只食 tc / en,唔食 "${lang}"(實測 zh_tc 會 Fail)`);
  }
  const key = `${tableId}:${lang}`;
  if (metaCache.has(key)) return metaCache.get(key);

  const promise = (async () => {
    const { body: comp } = await fetchJson(`${DATA_BASE}/table_${tableId}_comp.json`);
    await politePause();
    const { body: labels } = await fetchJson(`${DATA_BASE}/${lang}/table_${tableId}_lang.json`);
    await politePause();
    return { comp: nfcDeep(comp), labels: nfcDeep(labels) };
  })();

  metaCache.set(key, promise);
  return promise;
}

/**
 * 邊啲 cv 維度係必填?
 *
 * 探路報告最初講「cv_position != '0' 就必填」,但我核對 310-31001 之後發現
 * 唔啱:佢嘅 CCYY 同 Q 兩個都係 cv_position "1",但兩個都係時間維度,
 * 由 period 參數話事,唔應該入 cv。
 *
 * 正確準則:lang.json 嘅 cv_list[維度].is_time_series !== "1" 先要填。
 */
export function requiredCvDimensions(meta) {
  const dimensions = Object.keys(meta.comp.table_component_ccg_list ?? {});
  return dimensions.filter((dim) => meta.labels.cv_list?.[dim]?.is_time_series !== "1");
}

/** 一個維度嘅合法 class code 全集(合併晒佢底下所有 class_code_group)。 */
export function legalClassCodes(meta, dimension) {
  const groups = meta.labels.cv_list?.[dimension]?.ccg_list ?? {};
  const codes = new Map();
  for (const group of Object.values(groups)) {
    for (const [code, info] of Object.entries(group.cc_list ?? {})) {
      // csv_tabular_class_code_desc 會寫「主板 : H 股」,def 只寫「H 股」。
      // 340-95003 嘅 MB-H 同 GEM-H 兩個 def 都叫「H 股」,靠 def 做圖例會出兩條同名線。
      codes.set(code, nfc(info.csv_tabular_class_code_desc || info.def_class_code_desc || code));
    }
  }
  return codes;
}

/** 一個 (sv, stat_pres) 組合嘅單位描述,例如「百萬港元」「港元」「(%)」。 */
export function statPresLabel(meta, sv, statPres) {
  return nfc(meta.labels.sv_list?.[sv]?.sp_list?.[statPres]?.def_stat_pres_desc ?? "");
}

/** 統計變項嘅中文名,例如「本地生產總值 - 以當時市價計算」。 */
export function statVarLabel(meta, sv) {
  return nfc(meta.labels.sv_list?.[sv]?.def_stat_desc ?? sv);
}

/** 表標題、註腳、來源。tb_src 係 HTML,而且含查詢電郵,要剝乾淨。 */
export function tableInfo(meta) {
  return {
    title: nfc(meta.labels.tb_title ?? ""),
    footnote: stripHtml(meta.labels.tb_fn ?? ""),
    // 只留機構名,剝走查詢電話同電郵 —— 學生唔需要,而且電郵擺上網會俾爬蟲收割。
    // tb_src 實例:「政府統計處國民收入統計組（一）一<br />(查詢電話 : …)」
    // 剝走查詢資料之後,尾巴仲會剩返個當破折號用嘅「一」,一併剪走。
    source: stripHtml(meta.labels.tb_src ?? "")
      .replace(/[(（]查詢[\s\S]*$/u, "")
      .replace(/[\s\u2013\u2014\-\u4E00]+$/u, "")
      .trim(),
    since: meta.comp.since ?? null,
    lastModified: meta.comp.last_modified_date ?? null,
  };
}

function stripHtml(html) {
  return nfc(
    String(html)
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * 打一次統計處 API。
 *
 * 一定要用 POST。GET 條 param 要 LZString 壓縮,塞未壓縮 JSON 落去會俾
 * Azure WAF 擋,回一版 HTML 403,loader 就會喺 JSON.parse 度爆。
 *
 * @param {object} query
 * @param {string} query.id      表號,例如 "310-31001"。唔係 scode/pcode。
 * @param {object} query.sv      {統計變項: [呈現方式, ...]}。打錯會即刻 Fail,唔使自己驗。
 * @param {object} query.cv      {維度: [class code, ...]}。打錯**唔會**報錯,所以我哋自己驗。
 * @param {object} query.period  {start: "YYYYMM"} —— 必填,唔寫會靜靜哋淨係回預設頻率。
 * @param {string} [lang="tc"]
 */
export async function queryCenstatd({ id, sv, cv = {}, period, lang = "tc" }) {
  if (!id || /^(scode|pcode)/i.test(id)) {
    throw new Error(
      `"${id}" 唔係表號。scode/pcode 係統計主題代碼,打入 API 會回 Fail。` +
        `去 ${DATA_BASE}/${lang}/all_web_tables.json 搵返真表號(頂層係 dict,key 就係表號)。`
    );
  }
  if (!period?.start || !/^\d{6}$/.test(String(period.start))) {
    throw new Error(
      `${id}:period.start 必填,格式 YYYYMM。` +
        `唔寫嘅話 API 只會回 comp.json 嘅 default_series_period 嗰種頻率 —— ` +
        `實測 510-60001 唔寫 period 回 51 行全部年度,一個月度數字都冇,而且唔會報錯。`
    );
  }

  const meta = await fetchTableMeta(id, lang);

  // 防線 1:必填嘅 cv 維度有冇填齊?
  const required = requiredCvDimensions(meta);
  const missing = required.filter((dim) => !Array.isArray(cv[dim]) || cv[dim].length === 0);
  if (missing.length > 0) {
    throw new Error(
      `${id}:cv 缺咗必填維度 ${missing.join("、")}。` +
        `唔填唔會報錯,但幾個分類組會溝埋一齊 —— ` +
        `實測四大行業「貿易及物流」會由真值 18.9 靜靜哋變成 18.8。`
    );
  }

  // 防線 2:逐個 cv code 對返 lang.json 嘅 cc_list 驗。
  for (const [dim, codes] of Object.entries(cv)) {
    const legal = legalClassCodes(meta, dim);
    if (legal.size === 0) {
      throw new Error(`${id}:表冇 "${dim}" 呢個維度。合法維度:${Object.keys(meta.comp.table_component_ccg_list ?? {}).join("、")}`);
    }
    for (const code of codes) {
      if (!legal.has(code)) {
        throw new Error(
          `${id}:維度 ${dim} 冇 "${code}" 呢個 class code。` +
            `API 對呢種錯**唔會報錯**,會靜靜哋回 Total 冒充。` +
            `合法值:${[...legal.keys()].slice(0, 20).join("、")}${legal.size > 20 ? ` …(共 ${legal.size} 個)` : ""}`
        );
      }
    }
  }

  const payload = new URLSearchParams({ query: JSON.stringify({ id, lang, sv, cv, period }) });
  const { body } = await fetchJson(API_URL, {
    method: "POST",
    body: payload,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    assertShape(json) {
      if (json?.header?.status?.name !== "Success") {
        const messages = json?.header?.status?.message ?? [json?.header?.status?.description];
        throw new Error(`統計處回 Fail:${[].concat(messages).join("；")}`);
      }
    },
  });
  await politePause();

  const dataSet = nfcDeep(body.dataSet ?? []);

  // 防線 3:status Success 唔代表攞到嘢。實測寫錯 code 會回 0 行或者淨係 Total。
  if (dataSet.length === 0) {
    throw new Error(`${id}:API 回 Success 但 dataSet 係空的。多數係 sv 同 cv 夾唔埋。`);
  }

  return { header: nfcDeep(body.header ?? {}), dataSet, meta };
}

/**
 * 逐行睇 freq 分流。
 *
 * 一寫 period 就會年度同高頻溝埋同一個 array 回:GDP 一次過回
 * {freq:"Y", period:"2024"} 同 {freq:"Q", period:"202403"}。
 * 淨係攞 period + figure 畫圖,會把全年同一季擺埋同一條線。
 */
export function pickFrequency(dataSet, freq) {
  const rows = dataSet.filter((row) => row.freq === freq);
  if (rows.length === 0) {
    const seen = [...new Set(dataSet.map((row) => row.freq))];
    throw new Error(`揀唔到 freq="${freq}" 嘅資料。今次回嘅頻率有:${seen.join("、") || "(冇)"}`);
  }
  return rows;
}

/**
 * 統計處嘅 period 轉成 SPEC 第 5 節要求嘅字串。
 *
 * SPEC:「所有 period 用字串……財政年度寫 2025-26,季度寫 2025-Q4,月度寫 2025-12」
 *
 * 統計處嘅表達方式(實測):
 *   Y    "2024"    -> "2024"
 *   Q    "202603"  -> "2026-Q1"   (期末月份,唔係季號)
 *   M    "202607"  -> "2026-07"
 *   M3M  "202607"  -> "2026-07"   (該 3 個月期間嘅最後一個月)
 *   H    "202506"  -> "2025-06"   (年中 06 / 年底 12)
 */
export function formatPeriod(freq, period) {
  const text = String(period);
  if (freq === "Y") return text;
  if (!/^\d{6}$/.test(text)) return text;
  const year = text.slice(0, 4);
  const month = text.slice(4, 6);
  if (freq === "Q") return `${year}-Q${Math.round(Number(month) / 3)}`;
  return `${year}-${month}`;
}

/** 統計處嘅 freq 轉成 SPEC 嘅 frequency 值。 */
export function toSpecFrequency(freq) {
  return { Y: "annual", Q: "quarterly", M: "monthly", M3M: "monthly", H: "biannual" }[freq] ?? "irregular";
}

/**
 * figure 轉數值。
 *
 * 冇數嗰陣 API 回空字串,唔係 0。SPEC 第 2 節硬規則第 4 條唔准估數,
 * 所以一律轉 null,由畫面自己決定點顯示(斷線,唔係插到零)。
 *
 * sd_value 唔係空就代表呢格有特別狀態:
 *   "" 正常 / "-" 不適用 / "N.A." 沒有數字 / "n.y.a." 暫時沒有數字
 *   "r" 修訂數字 / "p" 臨時數字 / "[*1]".."[*11]" 因各種理由不予公布
 * 只有 r(修訂)同 p(臨時)係「有數但有註」,其餘一律當冇數。
 */
const VALUE_BEARING_FLAGS = new Set(["", "r", "p", "a"]);

export function toValue(row) {
  const flags = String(row.sd_value ?? "").split(",").map((f) => f.trim());
  if (!flags.every((flag) => VALUE_BEARING_FLAGS.has(flag))) return null;
  if (row.figure === "" || row.figure === null || row.figure === undefined) return null;
  const number = Number(row.figure);
  return Number.isFinite(number) ? number : null;
}
