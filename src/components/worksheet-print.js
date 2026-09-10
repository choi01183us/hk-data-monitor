import {html} from "npm:htl";
import {t} from "./locale.js";

// The default browser print command always prints the pupil sheet only.
// A deliberate teacher print temporarily opens the guide and restores its UI afterwards.
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
    const guide = document.querySelector(".assessment-teacher");
    const wasOpen = guide?.open;
    document.documentElement.dataset.worksheetPrint = mode;
    if (guide && mode === "teacher") guide.open = true;
    restore = () => {
      delete document.documentElement.dataset.worksheetPrint;
      if (guide) guide.open = wasOpen;
    };
    try { window.print(); } catch (error) { reset(); throw error; }
  };
  window.addEventListener("afterprint", reset);
  window.addEventListener("hashchange", openLinkedGuide);
  openLinkedGuide();
  invalidation?.then(() => { reset(); window.removeEventListener("afterprint", reset); window.removeEventListener("hashchange", openLinkedGuide); });
  return html`<div class="worksheet-print-controls">
    <button type="button" class="classroom-button" data-print-sheet="student" onclick=${() => print("student")}>${t("列印學生題目", "Print pupil questions")}</button>
    <button type="button" class="classroom-button classroom-button-secondary" data-print-sheet="teacher" onclick=${() => print("teacher")}>${t("列印教師指引與評分表", "Print teacher guide and rubric")}</button>
  </div>`;
}
