import {html} from "npm:htl";
import {t} from "./locale.js";

// The default browser print command always prints the pupil sheet only.
// Rubric printing excludes both the questions and answers. A deliberate teacher
// print opens both teacher sections and restores every details state afterwards.
export function worksheetPrintControls({invalidation} = {}) {
  let restore = null;
  const reset = () => { restore?.(); restore = null; };
  const openLinkedGuide = () => {
    const id = window.location.hash.slice(1);
    const target = id && document.getElementById(id);
    const guide = target && target.closest(".assessment-teacher");
    if (guide) guide.open = true;
  };
  const print = (mode) => {
    reset();
    const details = Array.from(document.querySelectorAll(".assessment-page details"));
    const previousStates = details.map((section) => [section, section.open]);
    document.documentElement.dataset.worksheetPrint = mode;
    if (mode === "teacher") {
      for (const section of details) {
        if (section.matches(".assessment-teacher")) section.open = true;
      }
    }
    restore = () => {
      delete document.documentElement.dataset.worksheetPrint;
      for (const [section, wasOpen] of previousStates) section.open = wasOpen;
    };
    try { window.print(); } catch (error) { reset(); throw error; }
  };
  window.addEventListener("afterprint", reset);
  window.addEventListener("hashchange", openLinkedGuide);
  openLinkedGuide();
  invalidation?.then(() => { reset(); window.removeEventListener("afterprint", reset); window.removeEventListener("hashchange", openLinkedGuide); });
  return html`<div class="worksheet-print-controls">
    <button type="button" class="classroom-button" data-print-sheet="student" onclick=${() => print("student")}>${t("列印學生題目", "Print pupil questions")}</button>
    <button type="button" class="classroom-button classroom-button-secondary" data-print-sheet="rubric" onclick=${() => print("rubric")}>${t("列印評議準則", "Print assessment rubric")}</button>
    <button type="button" class="classroom-button classroom-button-secondary" data-print-sheet="teacher" onclick=${() => print("teacher")}>${t("列印教師指引、準則與記錄", "Print teacher guide, rubric and record")}</button>
  </div>`;
}
