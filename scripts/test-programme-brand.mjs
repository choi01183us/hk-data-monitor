import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";

export async function testProgrammeBrand(check) {
  console.log("\n[財策新世代] 原圖、四圖載入閘及突變自證");
  const original = await readFile(new URL("../src/components/programme-brand.js", import.meta.url), "utf8");
  const source = original.replace(/^import .*;\n/gm, "");
  let sequence = 0;
  const moduleFrom = (code) => import(`data:text/javascript;base64,${Buffer.from(code + `\n// fixture ${sequence++}`).toString("base64")}`);
  const module = await moduleFrom(source);
  const throws = (fn) => {try {fn(); return false;} catch {return true;}};
  const ids = ["bgca", "hkex", "edb", "hkcss"];
  const states = (state) => Object.fromEntries(ids.map((id) => [id, state]));
  const urls = Object.fromEntries(ids.map((id) => [id, `./${id}.png`]));
  const urlGuard = (m) => [null, {}, [], {...urls, hkcss: ""}, {...urls, edb: 4}, {...urls, other: "./other.png"}].every((value) => throws(() => m.validateProgrammeLogos(value)));
  const stateGuard = (m) => [null, {}, [], {bgca:"loaded",hkex:"loaded",edb:"loaded"}, {...states("loaded"),hkcss:"unknown"}, {...states("loaded"),other:"loaded"}].every((value) => throws(() => m.programmeLogoState(value)));
  check("原圖 URL 必須四個齊備且非空字串", urlGuard(module));
  check("四個本機 FileAttachment URL 原樣保留", module.validateProgrammeLogos(urls) === urls);
  check("拒絕缺圖、未知圖及未知載入狀態", stateGuard(module));
  const expectedStates = [
    [states("pending"), "pending"],
    [{...states("loaded"), hkcss:"pending"}, "pending"],
    [states("loaded"), "ready"],
    [{...states("loaded"), hkex:"failed"}, "failed"]
  ];
  const knownStates = (m) => expectedStates.every(([input, answer]) => m.programmeLogoState(input) === answer);
  check("四個已知狀態：未載入、只載三圖、四圖齊、壞一圖", knownStates(module));
  const partialStates = (m) => ids.every((id) => m.programmeLogoState({...states("loaded"), [id]:"pending"}) === "pending");
  const failedStates = (m) => ids.every((id) => m.programmeLogoState({...states("loaded"), [id]:"failed"}) === "failed");
  check("任何一張未完成都唔顯示半組", partialStates(module));
  check("任何一張失敗都隱藏全組", failedStates(module));
  check("失敗優先於其他未完成圖片", module.programmeLogoState({...states("pending"), edb:"failed"}) === "failed");
  const roles = module.programmeLogoGroups;
  check("三角色及四機構次序固定", JSON.stringify(roles.map((group) => [group.roleEn,group.roleZh,group.logos.map((logo)=>logo.id)])) === JSON.stringify([
    ["Organised by","主辦機構",["bgca"]], ["Funded by","資助機構",["hkex"]], ["Supported by","支持機構",["edb","hkcss"]]
  ]));
  check("基金標誌明確叫 HKEX Foundation", roles[1].logos[0].en === "HKEX Foundation" && roles[1].logos[0].zh === "香港交易所慈善基金");
  check("角色資料全部不可變更", Object.isFrozen(roles) && roles.every((group)=>Object.isFrozen(group) && Object.isFrozen(group.logos) && group.logos.every(Object.isFrozen)));
  const before = JSON.stringify(urls); module.validateProgrammeLogos(urls); check("載入檢查唔改寫 URL", before === JSON.stringify(urls));

  for (const [name, from, to, oracle] of [
    ["四圖閘變只要一張", 'logoIds.every((id) => states[id] === "loaded")', 'logoIds.some((id) => states[id] === "loaded")', partialStates],
    ["任何壞圖閘變全部壞先報", 'logoIds.some((id) => states[id] === "failed")', 'logoIds.every((id) => states[id] === "failed")', failedStates],
    ["載入成功都唔顯示", '? "ready" : "pending"', '? "pending" : "pending"', knownStates],
    ["欠圖 URL 閘拆走", 'if (!completeLogoKeys(logos) || !logoIds.every((id) => typeof logos[id] === "string" && logos[id].trim().length > 0))', 'if (false)', urlGuard],
    ["未知載入狀態閘拆走", 'if (!completeLogoKeys(states) || !logoIds.every((id) => ["pending", "loaded", "failed"].includes(states[id])))', 'if (false)', stateGuard]
  ]) {
    if (source.split(from).length !== 2) throw new Error(`Programme mutation must match exactly once: ${name}`);
    const mutated = await moduleFrom(source.replace(from, to));
    let detected;
    try {detected = !oracle(mutated);} catch {detected = true;}
    check(`突變自證：${name}`, detected);
  }

  const originals = {
    bgca: "1cf125b96569064235898350997b6ae5ce04870b86388f8573b0a8102337929b",
    hkex: "3354f3af88b584d5a3568ccc32df6ccf1b825d5ffc03cc6f19810cffae04e62f",
    edb: "b545b1740181237278d4c80df9265d932084358a3742f48f2eff94ce5b074b4b",
    hkcss: "9505a3b158629bfb7fa8307888906f41114287d4fb3ec36e0a4b37ad7e5af041"
  };
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  check("SHA-256 自證：標準 abc 向量", hash("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  for (const id of ids) {
    const data = await readFile(new URL(`../src/assets/programme/${id}.png`, import.meta.url));
    const equalOriginal = (bytes) => hash(bytes) === originals[id];
    check(`原圖完整保留：${id}`, equalOriginal(data));
    const corrupted = Buffer.from(data); corrupted[corrupted.length - 1] ^= 1;
    check(`原圖檢查自證：${id} 改一 byte 即失敗`, !equalOriginal(corrupted));
  }
}
