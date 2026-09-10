import {label} from "../src/components/display-text.js";

// Exercises the published data and classroom materials through their real UI,
// after the main runner proves disconnection. Numeric transform oracles and
// their mutations live in test-public-expenditure-views and the manual tests.
export async function testBudgetClassroomOffline({page, base, check, workerStatus, readRenderedAttachment}) {
  console.log("\n[預算課堂離線] 已填公共十組及老師材料");
  for (const locale of ["zh-HK", "en-GB"]) {
    const suffix = locale === "en-GB" ? "?lang=en-GB" : "";
    const englishOnly = async () => locale !== "en-GB" || !/[\u3400-\u9fff]/.test(await page.locator("main").innerText());
    const response = await page.goto(base + "indicators/public_expenditure_policy_groups" + suffix, {waitUntil: "load"});
    await page.waitForSelector('g[aria-label="bar"] rect');
    const data = await readRenderedAttachment("public_expenditure_policy_groups");
    const status = await workerStatus();
    check(locale + " 公共三年30點由離線快取載入，非空骨架",
      response?.status() === 200 && status?.fromCache === true && data.manual_status === "filled" &&
      data.series.length === 30 && data.series.every(({value}) => Number.isFinite(value)) && await englishOnly());
    const picker = page.locator("main form select").first();
    const options = await picker.locator("option").evaluateAll((nodes) => nodes.map(({value, textContent}) => ({value, label: textContent})));
    check(locale + " 三個年度及兩組增減可選", options.length === 5);
    const results = [];
    for (const option of options) {
      await picker.selectOption(option.value);
      // Wait for both downstream reactive cells, chart and citation, to settle.
      const years = option.label.match(/\d{4}-\d{2}/g) ?? [];
      const change = /增減|: change/.test(option.label);
      const expectedTitles = data.category_order.map((category) => {
        const latest = data.series.find((p) => p.category === category && p.period === years[0]).value;
        const value = change ? latest - data.series.find((p) => p.category === category && p.period === years[1]).value : latest;
        return `${label(category, {locale})}\n${value.toLocaleString("en-GB")} ${locale === "en-GB" ? "HK$" : "港元"}`;
      }).sort();
      await page.waitForFunction(({years, change}) => {
        const citation = document.querySelector(".citation-preview")?.value ?? "";
        return years.every((year) => citation.split("\n")[0].includes(year)) &&
          /名義增減|nominal change/i.test(citation.split("\n")[0]) === change;
      }, {years, change: /增減|: change/.test(option.label)});
      await page.waitForFunction((expected) => {
        const shown = Array.from(document.querySelectorAll('g[aria-label="bar"] title'), (n) => n.textContent).sort();
        return JSON.stringify(shown) === JSON.stringify(expected);
      }, expectedTitles);
      const citation = await page.locator(".citation-preview").inputValue();
      const chartTitles = await page.locator('g[aria-label="bar"] title').allTextContents();
      results.push({label: option.label,
        ten: JSON.stringify(chartTitles.sort()) === JSON.stringify(expectedTitles),
        years: years.length > 0 && years.every((year) => citation.includes(year)),
        source: citation.includes("c_appendices_b.pdf") && /港元|HK\$/.test(citation),
        error: await page.locator(".observablehq--error").count()});
    }
    check(locale + " 五個圖各有十組，引用跟隨年度並附港元及原PDF",
      results.length === 5 && results.every((r) => r.ten && r.years && r.source && !r.error), JSON.stringify(results));
    await page.locator(".data-table > summary").click();
    const shown = await page.locator(".data-table__value").allTextContents();
    check(locale + " 資料表保留30個完整港元值，不用圖上縮寫代替",
      shown.length === 30 && shown.every((text, i) => Number(text.replace(/[,\s]/g, "")) === [...data.series].reverse()[i].value));

    const teacherResponse = await page.goto(base + "learn/teacher-guide" + suffix, {waitUntil: "load"});
    await page.waitForSelector(".teacher-guide");
    const teacherStatus = await workerStatus();
    check(locale + " 老師材料首次離線可讀：三課節、十二例及紙本角色卡",
      teacherResponse?.status() === 200 && teacherStatus?.fromCache === true &&
      await page.locator(".teacher-lesson").count() === 3 && await page.locator(".teacher-example").count() === 12 &&
      await page.locator(".teacher-role-card").count() === 1 &&
      await page.locator(".teacher-guide input, .teacher-guide textarea").count() === 0 && await englishOnly() &&
      await page.locator(".observablehq--error").count() === 0);
  }
}
