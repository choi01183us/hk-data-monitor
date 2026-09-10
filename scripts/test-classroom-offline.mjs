// Called by test-offline.mjs after its network-disconnection proof and before
// reconnecting. These three pages have not been visited while online.
import {EXPECTED_MONEY_RECIPIENT_HINTS} from "./test-money-flow.mjs";

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
      const hintResults = [];
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
        await page.locator(".money-check").click();
        const recipientFeedback = (await page.locator(".money-feedback > div > p").first().innerText()).trim();
        const recipientPrefix = locale === "en-GB" ? "Recipient: " : "收款者：";
        hintResults.push({id, wrongRejected: (await status.innerText()).trim() === wrongText,
          correctHint: recipientFeedback === recipientPrefix + EXPECTED_MONEY_RECIPIENT_HINTS[locale][id]});
        results.push({id, clean, correct, cleared, localised});
      }
      check(locale + " 四種金流逐題答對且收款者正確，換題及改答案清除舊結果",
        results.every((result) => result.clean && result.correct && result.cleared && result.localised), JSON.stringify(results));
      check(locale + " 四題錯收款者實際顯示該題提示，貸款及資助唔借新股提示",
        hintResults.every((result) => result.wrongRejected && result.correctHint), JSON.stringify(hintResults));

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
      const teacherSections = page.locator(".assessment-teacher");
      const allTeacherSectionsClosed = async () => await teacherSections.evaluateAll((sections) =>
        sections.length === 2 && sections.every((section) => !section.open));
      check(locale + " 評議頁離線顯示五題及公開準則，答案與班級記錄各自收起",
        assessmentResponse?.status() === 200 && assessmentStatus?.fromCache === true &&
        await page.locator(".assessment-question").count() === 5 &&
        await allTeacherSectionsClosed() &&
        await page.locator("#assessment-rubric").isVisible() &&
        await page.locator(".assessment-page input, .assessment-page textarea").count() === 0 &&
        (locale !== "en-GB" || await englishOnly()) && await noObservableError());

      await teacherSections.evaluateAll((sections) => sections.forEach((section) => {section.open = true;}));
      await page.emulateMedia({media: "print"});
      check(locale + " 瀏覽器預設列印只顯示學生題目，即使兩個教師區已展開",
        await page.locator(".assessment-student").isVisible() &&
        await page.locator(".assessment-answers").isHidden() &&
        await page.locator(".assessment-record").isHidden() &&
        await page.locator(".assessment-answer-guide").isHidden() &&
        await page.locator(".assessment-public-rubric").isHidden() &&
        await page.locator(".worksheet-print-controls").isHidden());
      await page.emulateMedia({media: "screen"});

      await page.evaluate(() => {
        window.__hkdmClassroomPrintProbe = {original: window.print, calls: []};
        window.print = () => window.__hkdmClassroomPrintProbe.calls.push({
          mode: document.documentElement.dataset.worksheetPrint,
          open: Array.from(document.querySelectorAll(".assessment-teacher"), (section) => section.open),
        });
      });
      const printResults = [];
      // Mixed open/closed states catch implementations that restore only the first
      // details. An open answers section must never leak into student/rubric print.
      for (const [mode, initialStates] of [["student", [true, false]], ["rubric", [true, true]], ["teacher", [false, true]]]) {
        await teacherSections.evaluateAll((sections, states) => {
          sections.forEach((section, index) => {section.open = states[index];});
        }, initialStates);
        await page.locator('[data-print-sheet="' + mode + '"]').click();
        const printCall = await page.evaluate(() => window.__hkdmClassroomPrintProbe.calls.at(-1));
        await page.emulateMedia({media: "print"});
        const questionsVisible = await page.locator(".assessment-student").isVisible();
        const answersVisible = await page.locator(".assessment-answer-guide").isVisible();
        const rubricVisible = await page.locator("#assessment-rubric").isVisible();
        const recordVisible = await page.locator(".assessment-class-table").isVisible();
        const correctContent = mode === "student"
          ? questionsVisible && !answersVisible && !rubricVisible && !recordVisible
          : mode === "rubric"
            ? !questionsVisible && !answersVisible && rubricVisible && !recordVisible
            : !questionsVisible && answersVisible && rubricVisible && recordVisible;
        await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
        await page.emulateMedia({media: "screen"});
        const restored = await page.evaluate((states) =>
          !document.documentElement.hasAttribute("data-worksheet-print") &&
          Array.from(document.querySelectorAll(".assessment-teacher")).every((section, index) => section.open === states[index]), initialStates);
        const expectedPrintStates = mode === "teacher" ? [true, true] : initialStates;
        printResults.push({mode, correctContent, restored,
          called: printCall?.mode === mode && JSON.stringify(printCall.open) === JSON.stringify(expectedPrintStates)});
      }
      check(locale + " 題目／準則／教師三種列印隔離內容，印後恢復每個區原來狀態",
        printResults.every((result) => result.correctContent && result.restored && result.called), JSON.stringify(printResults));
      await restorePrint();

      // A direct deep link starts a fresh document. A same-document hash change
      // intentionally preserves the teacher sections opened during print tests.
      await page.goto(base + "learn/classroom" + suffix, {waitUntil: "load"});
      await page.goto(base + "learn/assessment" + suffix + "#assessment-rubric", {waitUntil: "load"});
      await page.waitForSelector('[data-print-sheet="teacher"]');
      check(locale + " 評議準則深連結可讀四面向，唔會展開答案或班級記錄",
        await page.locator("#assessment-rubric").isVisible() &&
        await page.locator(".assessment-criterion").count() === 4 &&
        await allTeacherSectionsClosed() && await page.locator(".assessment-answer-guide").isHidden() &&
        (locale !== "en-GB" || await englishOnly()) && await noObservableError());

      // Follow the actual pupil-facing memo link, rather than only testing a URL.
      await page.goto(base + "learn/budget-memo" + suffix, {waitUntil: "load"});
      await page.locator('a[href*="assessment"][href$="#assessment-rubric"]').click();
      await page.waitForSelector('[data-print-sheet="teacher"]');
      check(locale + " 學生由備忘互評入口開準則，仍然收起小測答案",
        await page.locator("#assessment-rubric").isVisible() &&
        await allTeacherSectionsClosed() && await page.locator(".assessment-answer-guide").isHidden() &&
        await page.locator("html").getAttribute("lang") === locale);

      // Teacher links only open their own containing details. A later rubric
      // hash change does not silently alter either teacher section's state.
      await page.evaluate(() => {window.location.hash = "assessment-class-record";});
      await page.waitForFunction(() => document.querySelector(".assessment-record")?.open === true);
      const recordOnly = await page.locator(".assessment-answers").evaluate((section) => !section.open);
      await page.evaluate(() => {window.location.hash = "assessment-rubric";});
      await page.waitForFunction(() => window.location.hash === "#assessment-rubric");
      check(locale + " 教師班級記錄深連結只開記錄，回準則唔會開小測答案",
        recordOnly && await page.locator(".assessment-answers").evaluate((section) => !section.open) &&
        await page.locator(".assessment-record-context").isVisible() &&
        (locale !== "en-GB" || await englishOnly()));
    }
    check("課堂雙語離線互動全程沒有 JavaScript 錯誤", errors.length === 0, errors.join("\n"));
  } finally {
    await restorePrint();
    page.off("pageerror", onError);
  }
}
