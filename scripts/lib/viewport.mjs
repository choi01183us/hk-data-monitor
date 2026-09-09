// Framework 1.13.4 固定輸出 maximum-scale=1，會阻止手機以雙指放大網頁。
// 只處理實測過的框架標記；框架改格式就 hard fail，唔靜靜地猜 HTML。
const RESTRICTED = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">';
const ACCESSIBLE = '<meta name="viewport" content="width=device-width, initial-scale=1">';

export function normalizeBrowserViewport(html) {
  if (typeof html !== "string") throw new Error("viewport 正規化需要 HTML 字串");
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0])
    .filter((tag) => /\bname\s*=\s*(?:"viewport"|'viewport'|viewport)(?=\s|\/?>)/i.test(tag));
  if (tags.length !== 1) throw new Error(`HTML 必須有唯一 viewport 標記，實際 ${tags.length} 個`);
  const tag = tags[0];
  if (tag === ACCESSIBLE) return html;
  if (tag !== RESTRICTED) throw new Error("viewport 標記與已知框架格式不同，請核對後更新正規化規則");
  return html.replace(RESTRICTED, ACCESSIBLE);
}
