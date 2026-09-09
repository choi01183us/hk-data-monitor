// Presentation only. Source identifiers, category keys and numerical records remain unchanged.
export function canonicalLocale(value) {
  if (value === undefined || value === null || value === "") return "zh-HK";
  if (value === "zh-HK" || value === "en-GB") return value;
  throw new Error(`Unsupported language: ${String(value)}`);
}

export function isEnglish() {
  return typeof document !== "undefined" && document.documentElement.lang === "en-GB";
}

/** Both versions are authored at the call site; missing English is a programming error. */
export function t(zh, en) {
  if (typeof zh !== "string" || typeof en !== "string" || (zh.trim() && !en.trim())) {
    throw new Error("Authored Chinese and British English text are required");
  }
  return isEnglish() ? en : zh;
}

/** Switch only the language parameter; retain every other query parameter and the fragment. */
export function languageHref(href, locale) {
  const chosen = canonicalLocale(locale);
  const target = new URL(href);
  if (!["http:", "https:"].includes(target.protocol)) throw new Error("Language links must use HTTP or HTTPS");
  target.searchParams.delete("lang");
  if (chosen === "en-GB") target.searchParams.set("lang", chosen);
  return target.href;
}

/** Only rewrite local page links inside this site's root; downloads and external links stay exact. */
export function localHref(href, {locale = isEnglish() ? "en-GB" : "zh-HK", baseUrl, siteRoot} = {}) {
  canonicalLocale(locale);
  if (typeof href !== "string" || !href || href.startsWith("#")) return href;
  if (!baseUrl || !siteRoot) return href;
  let target, root;
  try { target = new URL(href, baseUrl); root = new URL(siteRoot, baseUrl); } catch { return href; }
  const rootPath = root.pathname.endsWith("/") ? root.pathname : `${root.pathname}/`;
  if (!["http:", "https:"].includes(target.protocol) || target.origin !== root.origin || !target.pathname.startsWith(rootPath)) return href;
  const leaf = target.pathname.split("/").pop();
  if (leaf.includes(".") && !leaf.endsWith(".html")) return href;
  // Query-bearing application links keep their own semantics. Only recognised language values change.
  const languages = target.searchParams.getAll("lang");
  if (languages.length > 1 || (languages.length === 1 && !["zh-HK", "en-GB"].includes(languages[0]))) return href;
  return languageHref(target.href, locale);
}
