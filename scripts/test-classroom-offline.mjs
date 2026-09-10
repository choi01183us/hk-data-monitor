// Called by test-offline.mjs after its network-disconnection proof and before
// reconnecting. These three pages have not been visited while online.
export async function testClassroomOffline({page, context, base, check, workerStatus}) {
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on("pageerror", onError);
  const englishOnly = async () => !/[\u3400-\u9fff]/.test(await page.locator("#observablehq-main").innerText());
  const storage = async () => ({
    ...await page.evaluate(() => ({
      local: Object.fromEntries(Object.entries(localStorage).sort()),
      session: Object.fromEntries(Object.entries(sessionStorage).sort()),
      cookie: document.cookie,
    })),
    cookies: await context.cookies(),
  });
  const noObservableError = async () => await page.locator(".observablehq--error").count() === 0;
  const correctCases = [
    ["loan", "company", "repay"],
    ["new-shares", "company", "disclose"],
    ["secondary", "seller", "market-risk"],
    ["grant", "company", "accountability"],
  ];
  const restorePrint = async () => {
    await page.evaluate(() => {
      if (!window.__hkdmClassroomPrintProbe) return;
      window.dispatchEvent(new Event("afterprint"));
      window.print = window.__hkdmClassroomPrintProbe.original;
      delete window.__hkdmClassroomPrintProbe;
    });
    await page.emulateMedia({media: "screen"});
  };

  try {
    console.log("\n[課堂離線] 三條任務、金流練習及學生／教師列印");
    const precached = await page.evaluate(async (base) => {
      const results = [];
      for (const slug of ["classroom", "money-flow", "assessment"]) {
        const response = await caches.match(new URL("learn/" + slug, base).href);
        results.push([slug, response?.status === 200]);
      }
      return results;
    }, base);
    check("三個新課堂頁首次導航前已存在預快取", precached.every(([, found]) => found), JSON.stringify(precached));

    for (const locale of ["zh-HK", "en-GB"]) {
      const suffix = locale === "en-GB" ? "?lang=en-GB" : "";
      const correctText = locale === "en-GB" ? "Both are correct. Now explain your reasoning." : "兩項都啱。接住解釋你嘅理由。";
      const partialText = locale === "en-GB" ? "Choose both a recipient and a responsibility before checking." : "請先選擇收款者同責任，再核對解說。";
      const wrongText = locale === "en-GB" ? "Some concepts need another look. Follow the flow below, then try again." : "仲有概念要釐清。對照下方資金流向，再試一次。";
      const baseline = await storage();

      const classroomResponse = await page.goto(base + "learn/classroom" + suffix, {waitUntil: "load"});
      await page.waitForSelector(".classroom-route");
      const classroomStatus = await workerStatus();
      const routeSteps = await page.locator(".classroom-steps").evaluateAll((lists) => lists.map((list) => list.querySelectorAll("li").length));
      check(locale + " 三條路線離線顯示完整步驟、交件要求及語言",
        classroomResponse?.status() === 200 && classroomStatus?.fromCache === true &&
        routeSteps.length === 3 && routeSteps.every((count) => count === 4) &&
        await page.locator(".classroom-output").count() === 3 &&
        await page.locator("html").getAttribute("lang") === locale &&
        (locale !== "en-GB" || await englishOnly()) && await noObservableError());

      const moneyResponse = await page.goto(base + "learn/money-flow" + suffix, {waitUntil: "load"});
      await page.waitForSelector(".money-case input");
      const moneyStatus = await workerStatus();
      check(locale + " 四個金流情境離線載入且沒有預選答案",
        moneyResponse?.status() === 200 && moneyStatus?.fromCache === true &&
        await page.locator(".money-case-nav [data-case]").count() === 4 &&
        await page.locator(".money-case input:checked").count() === 0 &&
        await page.locator('[data-case="loan"]').getAttribute("aria-pressed") === "true" &&
        (locale !== "en-GB" || await englishOnly()) && await noObservableError());

      const status = page.locator(".money-status");
      const feedback = page.locator(".money-feedback");
      await page.locator(".money-check").click();
      const emptyRejected = (await status.innerText()).trim() === partialText && await feedback.isHidden();
      await page.locator('input[name="money-recipient"][value="company"]').check();
      await page.locator(".money-check").click();
      const partialRejected = (await status.innerText()).trim() === partialText && await feedback.isHidden();
      await page.locator('input[name="money-responsibility"][value="gift"]').check();
      await page.locator(".money-check").click();
      const wrongRejected = (await status.innerText()).trim() === wrongText && await feedback.isVisible();
      await page.locator('input[name="money-recipient"][value="exchange"]').check();
      const changedCleared = await feedback.isHidden() && (await status.innerText()).trim() !== correctText;
      check(locale + " 空白、單項及錯誤答案不判正確，修改會收起解說",
        emptyRejected && partialRejected && wrongRejected && changedCleared);

      const results = [];
      for (const [id, recipient, responsibility] of correctCases) {
        await page.locator('[data-case="' + id + '"]').click();
        const clean = await page.locator(".money-case input:checked").count() === 0 &&
          (await status.innerText()).trim() === "" && await feedback.isHidden() &&
          await page.locator('[data-case="' + id + '"]').getAttribute("aria-pressed") === "true";
        await page.locator('input[name="money-recipient"][value="' + recipient + '"]').check();
        await page.locator('input[name="money-responsibility"][value="' + responsibility + '"]').check();
        await page.locator(".money-check").click();
        const recipientLabel = locale === "en-GB"
          ? recipient === "seller" ? "The investor selling existing shares" : "The company"
          : recipient === "seller" ? "出售現有股票嘅投資者" : "公司";
        const correct = (await status.innerText()).trim() === correctText &&
          await feedback.isVisible() &&
          (await page.locator(".money-flow-diagram strong").innerText()).trim() === recipientLabel;
        const localised = locale !== "en-GB" || await englishOnly();
        await page.locator('input[name="money-recipient"][value="exchange"]').check();
        const cleared = await feedback.isHidden() && (await status.innerText()).trim() !== correctText;
        results.push({id, clean, correct, cleared, localised});
      }
      check(locale + " 四種金流逐題答對且收款者正確，換題及改答案清除舊結果",
        results.every((result) => result.clean && result.correct && result.cleared && result.localised), JSON.stringify(results));

      await page.reload({waitUntil: "load"});
      await page.waitForSelector(".money-case input");
      check(locale + " 重新載入清除練習選擇，沒有儲存答案或 cookie",
        await page.locator(".money-case input:checked").count() === 0 &&
        (await page.locator(".money-status").innerText()).trim() === "" &&
        await page.locator(".money-feedback").isHidden() &&
        JSON.stringify(await storage()) === JSON.stringify(baseline));

      const assessmentResponse = await page.goto(base + "learn/assessment" + suffix, {waitUntil: "load"});
      await page.waitForSelector('[data-print-sheet="teacher"]');
      const assessmentStatus = await workerStatus();
      check(locale + " 評議頁離線顯示五題並預設收起教師答案",
        assessmentResponse?.status() === 200 && assessmentStatus?.fromCache === true &&
        await page.locator(".assessment-question").count() === 5 &&
        await page.locator(".assessment-teacher").evaluate((guide) => !guide.open) &&
        await page.locator(".assessment-page input, .assessment-page textarea").count() === 0 &&
        (locale !== "en-GB" || await englishOnly()) && await noObservableError());

      await page.locator(".assessment-teacher > summary").click();
      await page.emulateMedia({media: "print"});
      check(locale + " 瀏覽器預設列印只顯示學生題目，即使教師答案已展開",
        await page.locator(".assessment-student").isVisible() &&
        await page.locator(".assessment-teacher").isHidden() &&
        await page.locator(".assessment-answer-guide").isHidden() &&
        await page.locator(".worksheet-print-controls").isHidden());
      await page.emulateMedia({media: "screen"});

      await page.evaluate(() => {
        window.__hkdmClassroomPrintProbe = {original: window.print, calls: []};
        window.print = () => window.__hkdmClassroomPrintProbe.calls.push({
          mode: document.documentElement.dataset.worksheetPrint,
          open: document.querySelector(".assessment-teacher").open,
        });
      });
      const printResults = [];
      // Student printing must restore an already-open guide. Teacher printing must
      // temporarily open a closed guide and restore the closed state afterwards.
      for (const [mode, initiallyOpen] of [["student", true], ["teacher", false]]) {
        await page.locator(".assessment-teacher").evaluate((guide, open) => {guide.open = open;}, initiallyOpen);
        await page.locator('[data-print-sheet="' + mode + '"]').click();
        const printCall = await page.evaluate(() => window.__hkdmClassroomPrintProbe.calls.at(-1));
        await page.emulateMedia({media: "print"});
        const correctContent = mode === "student"
          ? await page.locator(".assessment-student").isVisible() && await page.locator(".assessment-teacher").isHidden()
          : await page.locator(".assessment-student").isHidden() &&
            await page.locator(".assessment-answer-guide").isVisible() &&
            await page.locator("#assessment-rubric").isVisible() &&
            await page.locator(".assessment-class-table").isVisible();
        await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
        await page.emulateMedia({media: "screen"});
        const restored = await page.evaluate((open) =>
          !document.documentElement.hasAttribute("data-worksheet-print") &&
          document.querySelector(".assessment-teacher").open === open, initiallyOpen);
        printResults.push({mode, correctContent, restored, called: printCall?.mode === mode && printCall.open === true});
      }
      check(locale + " 學生／教師列印按鈕隔離內容，列印後恢復原來展開狀態",
        printResults.every((result) => result.correctContent && result.restored && result.called), JSON.stringify(printResults));
      await restorePrint();

      await page.goto(base + "learn/assessment" + suffix + "#assessment-rubric", {waitUntil: "load"});
      await page.waitForSelector('[data-print-sheet="teacher"]');
      await page.waitForFunction(() => document.querySelector(".assessment-teacher")?.open === true);
      check(locale + " 評分表深層連結打開教師指引，展開內容完整翻譯",
        await page.locator("#assessment-rubric").isVisible() &&
        await page.locator(".assessment-criterion").count() === 4 &&
        (locale !== "en-GB" || await englishOnly()) && await noObservableError());
    }
    check("課堂雙語離線互動全程沒有 JavaScript 錯誤", errors.length === 0, errors.join("\n"));
  } finally {
    await restorePrint();
    page.off("pageerror", onError);
  }
}
