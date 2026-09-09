import {html} from "npm:htl";
import {normalizeMapView, zoomMapView, panMapView, focusMapView, mapTransform} from "./map-view.js";

// 一個座標平面包含底圖、區界及 HTML 標記；操作只留在記憶體，唔改原始位置。
export function mapViewport({label = "香港互動地圖", resetLabel = "香港全景"} = {}) {
  let state = normalizeMapView(), selection = null, drag = null, suppressClick = false;
  const stage = html`<div class="map-stage"></div>`;
  const viewport = html`<div class="map-viewport" tabindex="0" role="group" aria-label=${`${label}；方向鍵移動，加減鍵縮放，Home 重設`}>${stage}</div>`;
  const level = html`<output class="map-zoom-level" aria-label="地圖放大倍率"></output>`;
  const status = html`<p class="map-selection" role="status"></p>`;
  const source = html`<div class="map-view-source"></div>`;
  const button = (text, action, name = text) => html`<button type="button" aria-label=${name} onclick=${action}>${text}</button>`;
  const zoom = (delta) => {state = zoomMapView(state, delta); paint();};
  const pan = (dx, dy) => {state = panMapView(state, dx, dy); paint();};
  const plus = button("＋ 放大", () => zoom(.5), "放大地圖");
  const minus = button("− 縮小", () => zoom(-.5), "縮小地圖");
  const reset = button(resetLabel, () => {state = normalizeMapView(); paint();});
  const locate = button("定位所選", () => {if (selection) {state = focusMapView(state, selection.x / 900, selection.y / 560); paint();}});
  const directions = [["←", .2, 0, "向西查看"], ["↑", 0, .2, "向北查看"], ["↓", 0, -.2, "向南查看"], ["→", -.2, 0, "向東查看"]].map(([text, dx, dy, name]) => button(text, () => pan(dx, dy), name));
  const fullscreen = button("全螢幕", async () => {
    try {
      if (document.fullscreenElement === root) await document.exitFullscreen();
      else await root.requestFullscreen();
    } catch {status.textContent = "瀏覽器未能開啟全螢幕；仍可用放大及移動按鈕。";}
  });
  const root = html`<div class="map-viewer"><div class="map-tools" role="group" aria-label="地圖檢視工具"><div>${plus}${minus}${level}</div><div>${reset}${locate}${fullscreen}</div><div class="map-pan-buttons" role="group" aria-label="移動地圖">${directions}</div></div>${viewport}${status}${source}<p class="map-help">放大後可拖移，亦可按方向按鈕。鍵盤：方向鍵、＋／−、Home。放大唔會增加底圖細節；雙指可縮放網頁。</p></div>`;
  fullscreen.hidden = !document.fullscreenEnabled || typeof root.requestFullscreen !== "function";
  function paint() {
    stage.style.transform = mapTransform(state);
    root.style.setProperty("--map-marker-scale", String(1 / state.zoom));
    root.dataset.zoom = String(state.zoom);
    root.dataset.centerX = String(state.x);
    root.dataset.centerY = String(state.y);
    viewport.classList.toggle("is-zoomed", state.zoom > 1);
    level.value = `${Math.round(state.zoom * 100)}%`;
    plus.disabled = state.zoom >= 4;
    minus.disabled = state.zoom <= 1;
    directions.forEach((control) => {control.disabled = state.zoom <= 1;});
    locate.disabled = !selection;
  }
  viewport.addEventListener("keydown", (event) => {
    if (event.target !== viewport || event.ctrlKey || event.metaKey || event.altKey) return;
    const moves = {ArrowLeft: [.2, 0], ArrowRight: [-.2, 0], ArrowUp: [0, .2], ArrowDown: [0, -.2]};
    if (moves[event.key]) pan(...moves[event.key]);
    else if (["+", "="].includes(event.key)) zoom(.5);
    else if (event.key === "-") zoom(-.5);
    else if (event.key === "Home") {state = normalizeMapView(); paint();}
    else return;
    event.preventDefault();
  });
  viewport.addEventListener("dragstart", (event) => event.preventDefault());
  viewport.addEventListener("pointerdown", (event) => {
    suppressClick = false;
    if (state.zoom <= 1 || !event.isPrimary || event.button !== 0) return;
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY, state, moved: false};
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    if (event.pointerType !== "touch" && !(event.buttons & 1)) {drag = null; suppressClick = false; return;}
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    viewport.setPointerCapture(event.pointerId);
    suppressClick = true;
    state = panMapView(drag.state, dx / viewport.clientWidth, dy / viewport.clientHeight);
    paint();
  });
  const endDrag = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    if (event.type === "pointercancel") {
      // 雙指交回瀏覽器縮放時，撤回交接前的單指位移。
      state = drag.state; suppressClick = false; paint();
    }
    drag = null;
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  };
  ["pointerup", "pointercancel"].forEach((name) => viewport.addEventListener(name, endDrag));
  // 觸控會先由地區 path 隱式 capture；轉交視窗時，舊 path 的 lost 事件會冒泡。
  viewport.addEventListener("lostpointercapture", (event) => {if (event.target === viewport) endDrag(event);});
  viewport.addEventListener("pointerleave", (event) => {
    if (drag && drag.id === event.pointerId && !viewport.hasPointerCapture(event.pointerId)) {drag = null; suppressClick = false;}
  });
  viewport.addEventListener("click", (event) => {
    if (suppressClick) {event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false;}
  }, true);
  // Tab 到被裁走嘅地區／景點時，移回可見範圍；唔因普通點選而自動再放大。
  stage.addEventListener("focusin", (event) => {
    const target = event.target.closest("[data-map-x][data-map-y]");
    if (!target || state.zoom <= 1) return;
    const x = Number(target.dataset.mapX) / 900, y = Number(target.dataset.mapY) / 560;
    const margin = .42 / state.zoom;
    if (Math.abs(x - state.x) > margin || Math.abs(y - state.y) > margin) {
      state = normalizeMapView({...state, x, y}); paint();
    }
  });
  root.addEventListener("fullscreenchange", () => {
    const open = document.fullscreenElement === root;
    fullscreen.textContent = open ? "返回頁面" : "全螢幕";
    fullscreen.setAttribute("aria-label", open ? "返回頁面" : "全螢幕");
    (open ? viewport : fullscreen).focus({preventScroll: true});
  });
  root.addEventListener("keydown", (event) => {
    if (document.fullscreenElement !== root || event.key !== "Tab") return;
    const controls = [...root.querySelectorAll("button:not([disabled]),a[href],[tabindex='0']")].filter((el) => !el.hidden && el.getClientRects().length);
    if (event.shiftKey && document.activeElement === controls[0]) {event.preventDefault(); controls.at(-1)?.focus();}
    else if (!event.shiftKey && document.activeElement === controls.at(-1)) {event.preventDefault(); controls[0]?.focus();}
  });
  paint();
  return {
    element: root,
    setContent(content, provenance) {stage.replaceChildren(content); source.replaceChildren(...(provenance ? [provenance] : []));},
    setSelection(point, description = "") {selection = point; status.textContent = description; paint();}
  };
}
