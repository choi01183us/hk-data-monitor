// Official captions checked against both HKO icon tables. Scenes are restrained
// illustrations, not a reconstruction of rainfall, local visibility or lunar phase.
// https://www.hko.gov.hk/textonly/v2/explain/wxicon_c.htm
// https://www.weather.gov.hk/en/textonly/explain/wxicon.htm
export const WEATHER_ICONS = Object.freeze(Object.fromEntries(Object.entries({
  50: {label_zh: "陽光充沛", label_en: "Sunny", scene: "sunny"},
  51: {label_zh: "間有陽光", label_en: "Sunny Periods", scene: "partly-cloudy"},
  52: {label_zh: "短暫陽光", label_en: "Sunny Intervals", scene: "partly-cloudy"},
  53: {label_zh: "間有陽光幾陣驟雨", label_en: "Sunny Periods with A Few Showers", scene: "sun-shower"},
  54: {label_zh: "短暫陽光有驟雨", label_en: "Sunny Intervals with Showers", scene: "sun-shower"},
  60: {label_zh: "多雲", label_en: "Cloudy", scene: "cloudy"},
  61: {label_zh: "密雲", label_en: "Overcast", scene: "cloudy"},
  62: {label_zh: "微雨", label_en: "Light Rain", scene: "rain"},
  63: {label_zh: "雨", label_en: "Rain", scene: "rain"},
  64: {label_zh: "大雨", label_en: "Heavy Rain", scene: "rain"},
  65: {label_zh: "雷暴", label_en: "Thunderstorms", scene: "cloudy"},
  70: {label_zh: "天色良好(只在農曆第一日晚間使用)", label_en: "Fine ( use only in night-time on 1st of the Lunar Month )", scene: "night"},
  71: {label_zh: "天色良好(只在農曆第二日至第六日晚間使用)", label_en: "Fine ( use only in night-time on 2nd to 6th of the Lunar Month )", scene: "night"},
  72: {label_zh: "天色良好(只在農曆第七日至第十三日晚間使用)", label_en: "Fine ( use only in night-time during 7th to 13th of Lunar Month )", scene: "night"},
  73: {label_zh: "天色良好(只在農曆第十四日至第十七日晚間使用)", label_en: "Fine ( use only in night-time during 14th to 17th of Lunar Month )", scene: "night"},
  74: {label_zh: "天色良好(只在農曆第十八日至第二十四日晚間使用)", label_en: "Fine ( use only in night-time during 18th to 24th of Lunar Month )", scene: "night"},
  75: {label_zh: "天色良好(只在農曆第二十五日至第三十日晚間使用)", label_en: "Fine ( use only in night-time during 25th to 30th of Lunar Month )", scene: "night"},
  76: {label_zh: "大致多雲(只在晚間使用)", label_en: "Mainly Cloudy ( use only in night-time )", scene: "night-cloudy"},
  77: {label_zh: "天色大致良好(只在晚間使用)", label_en: "Mainly Fine ( use only in night-time )", scene: "night"},
  80: {label_zh: "大風", label_en: "Windy", scene: "off"},
  81: {label_zh: "乾燥", label_en: "Dry", scene: "off"},
  82: {label_zh: "潮濕", label_en: "Humid", scene: "off"},
  83: {label_zh: "霧", label_en: "Fog", scene: "fog"},
  84: {label_zh: "薄霧", label_en: "Mist", scene: "fog"},
  85: {label_zh: "煙霞", label_en: "Haze", scene: "off"},
  90: {label_zh: "熱", label_en: "Hot", scene: "off"},
  91: {label_zh: "暖", label_en: "Warm", scene: "off"},
  92: {label_zh: "涼", label_en: "Cool", scene: "off"},
  93: {label_zh: "冷", label_en: "Cold", scene: "off"}
}).map(([code, definition]) => [code, Object.freeze(definition)])));

function utcTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19) ? parsed : NaN;
}

/** A station observation has its own timestamp; it is not a Hong Kong-wide mean. */
export function weatherTemperature(doc, now = Date.now()) {
  const currentTime = typeof now === "number" ? now : typeof now === "string" ? Date.parse(now) : NaN;
  if (!Number.isFinite(currentTime)) throw new TypeError("Weather temperature requires a valid device time");
  const unavailable = {status: "unavailable", value: null, recorded_at: null};
  if (doc?.kind !== "weather" || !Array.isArray(doc.records) || doc.records.length !== 1) return unavailable;
  const record = doc.records[0], temperature = record?.temperature;
  if (temperature?.station !== "香港天文台" || temperature?.unit !== "C" || !Number.isFinite(temperature?.value)) return unavailable;
  const timestamps = [temperature.recorded_at, record.report_updated_at, doc.fetched_at].map(utcTime);
  if (timestamps.some((value) => !Number.isFinite(value)) || doc.updated_at !== record.report_updated_at) return unavailable;
  const stale = doc.build?.stale === true || timestamps.some((value) => currentTime - value > 90 * 60_000 || currentTime - value < -5 * 60_000);
  return {status: stale ? "stale" : "current", value: temperature.value, recorded_at: temperature.recorded_at};
}

/** now accepts epoch milliseconds or an ISO timestamp string. No browser or network state. */
export function weatherState(doc, now = Date.now()) {
  const currentTime = typeof now === "number" ? now : typeof now === "string" ? Date.parse(now) : NaN;
  if (!Number.isFinite(currentTime)) throw new TypeError("Weather state requires a valid device time");
  const base = {
    status: "unavailable", scene: "off", icons: [], labels_zh: [], labels_en: [],
    updated_at: doc?.updated_at ?? null, fetched_at: doc?.fetched_at ?? null,
    icon_updated_at: null, report_updated_at: null, reason: "missing-data"
  };
  if (doc?.kind !== "weather" || !Array.isArray(doc.records) || doc.records.length !== 1) return base;
  const record = doc.records[0];
  if (!record || !Array.isArray(record.icons) || record.icons.length === 0 ||
      record.icons.some((code) => !Number.isInteger(code)) || new Set(record.icons).size !== record.icons.length) {
    return {...base, reason: "invalid-data"};
  }
  const icons = [...record.icons];
  const state = {
    ...base, icons, icon_updated_at: record.icon_updated_at ?? null, report_updated_at: record.report_updated_at ?? null,
    labels_zh: icons.map((code) => WEATHER_ICONS[code]?.label_zh ?? `未識別天氣標記（${code}）`),
    labels_en: icons.map((code) => WEATHER_ICONS[code]?.label_en ?? `Unrecognised weather icon (${code})`)
  };
  const reportTime = utcTime(record.report_updated_at);
  const fetchedTime = utcTime(doc.fetched_at);
  if (!Number.isFinite(reportTime) || !Number.isFinite(fetchedTime) ||
      !Number.isFinite(utcTime(record.icon_updated_at)) || doc.updated_at !== record.report_updated_at) {
    return {...state, reason: "invalid-data"};
  }
  // The icon may legitimately be older than the latest report. Its timestamp is
  // displayed, but freshness depends on the report and capture times separately.
  const reportAge = currentTime - reportTime;
  const fetchedAge = currentTime - fetchedTime;
  const reason = reportAge < -5 * 60_000 || fetchedAge < -5 * 60_000 ? "clock-skew" :
    reportAge > 90 * 60_000 ? "report-old" : fetchedAge > 90 * 60_000 ? "snapshot-old" :
    doc.build?.stale === true ? "build-stale" : null;
  if (reason) return {...state, status: "stale", reason};
  if (icons.some((code) => !Object.hasOwn(WEATHER_ICONS, code))) return {...state, status: "unknown", reason: "unknown-icon"};
  // HKO can supply multiple icons for a change in weather. Preserve all labels;
  // never choose a first icon or invent a severity order for the illustration.
  if (icons.length > 1) return {...state, status: "transition", reason: "multiple-icons"};
  return {...state, status: "current", scene: WEATHER_ICONS[icons[0]].scene, reason: "current"};
}
