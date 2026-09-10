import {label} from "../src/components/display-text.js";

// Original-value checks live in the manual guard and its mutation tests. This
// verifies that the built page retains each category, figure and source offline.
export async function testHousingOffline({page, base, check, workerStatus, readRenderedAttachment}) {
  console.log("\n[公屋輪候離線] 三個口徑、單季圖及完整引用");
  const viewport = page.viewportSize();
  await page.setViewportSize({width: 390, height: 844});
  for (const locale of ["zh-HK", "en-GB"]) {
    const suffix = locale === "en-GB" ? "?lang=en-GB" : "";
    const response = await page.goto(base + "indicators/phr_waiting_time" + suffix, {waitUntil: "load"});
    await page.waitForSelector('g[aria-label="bar"] rect');
    const data = await readRenderedAttachment("phr_waiting_time");
    const status = await workerStatus();
    const latest = data.series.filter((p) => p.period === data.coverage.end);
    const expected = latest.map((p) => `${label(p.category, {locale})}\n${p.value.toFixed(1)} ${locale === "en-GB" ? "years" : "年"}`).sort();
    const shown = (await page.locator('g[aria-label="bar"] title').allTextContents()).sort();
    check(locale + " 三類最新輪候數據由離線快取回答，圖示與原始值相符",
      response?.status() === 200 && status?.fromCache === true && data.manual_status === "filled" &&
      latest.length === 3 && JSON.stringify(shown) === JSON.stringify(expected));
    const axis = await page.evaluate(() => {
      const fits = (node, container) => {
        const box = node.getBoundingClientRect(), frame = container.getBoundingClientRect();
        return box.left >= frame.left - 0.5 && box.right <= frame.right + 0.5;
      };
      // 先以內含、剛好貼邊、左溢出、右溢出四個已知答案驗量度本身。
      const fixture = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      fixture.setAttribute("width", "100"); fixture.setAttribute("height", "20");
      fixture.style.cssText = "position:fixed;left:0;top:0;width:100px;height:20px;max-width:none";
      const rect = document.createElementNS(fixture.namespaceURI, "rect");
      rect.setAttribute("height", "10"); fixture.append(rect); document.body.append(fixture);
      const answers = [[10, 80], [0, 100], [-2, 50], [52, 50]].map(([x, width]) => {
        rect.setAttribute("x", x); rect.setAttribute("width", width); return fits(rect, fixture);
      });
      fixture.remove();
      const labels = [...document.querySelectorAll('g[aria-label="y-axis tick label"] text')];
      return {answers, labels: labels.map((node) => ({text: node.textContent, fits: fits(node, node.closest("svg"))}))};
    });
    const axisText = (text) => text.replace(/\s/g, "");
    check(locale + " 手機圖三個分類完整且不裁切（四個量度已知答案自證）",
      JSON.stringify(axis.answers) === JSON.stringify([true, true, false, false]) && axis.labels.length === 3 &&
      axis.labels.every((item) => item.fits) && latest.every((point) => axis.labels.some((item) => axisText(item.text) === axisText(label(point.category, {locale})))));
    await page.locator(".data-table > summary").click();
    const table = await page.locator(".data-table__value").allTextContents();
    check(locale + " 資料表保留每個原始小數，沒有合併三種輪候定義",
      table.length === data.series.length && table.every((text, i) => Number(text.trim()) === [...data.series].reverse()[i].value));
    const picker = page.locator('.citation-picker');
    await picker.locator("summary").click();
    const periods = picker.locator("select").nth(0);
    await periods.selectOption(data.coverage.end);
    const categories = picker.locator("select").nth(1);
    const options = await categories.locator("option").evaluateAll((nodes) => nodes.map(({value}) => value));
    let complete = options.length === 3;
    for (const value of options) {
      await categories.selectOption(value);
      const citation = await page.locator(".citation-preview").inputValue();
      const title = await categories.locator("option:checked").textContent();
      const point = latest.find((p) => label(p.category, {locale}) === title.trim());
      complete &&= !!point && citation.includes(String(point.value)) && citation.includes(data.coverage.end) &&
        citation.includes("hb.gov.hk/") && citation.includes(data.updated_at) &&
        (locale === "en-GB" ? /12 months/.test(citation) : /12\s*個月/.test(citation));
    }
    check(locale + " 每個分類引用帶數值、季度、來源日期及過去12個月口徑", complete);
    const text = await page.locator("main").innerText();
    check(locale + " 公屋頁語言完整、無程式錯誤及不再顯示待填",
      await page.locator(".observablehq--error").count() === 0 &&
      (locale !== "en-GB" || !/[\u3400-\u9fff]/.test(text)) &&
      !/數據未填|Data not yet entered/.test(text));
    await page.goto(base + suffix, {waitUntil: "load"});
    const card = page.locator('.indicator-card[href*="phr_waiting_time"]');
    await card.waitFor();
    check(locale + " 首頁有公屋卡並寫清綜合輪候口徑",
      await card.count() === 1 && (await card.innerText()).includes(label("綜合輪候時間(含簡約公屋)", {locale})));
  }
  if (viewport) await page.setViewportSize(viewport);
}
