// 實跑 production refresh script；只將資料取得／磁碟依賴接到臨時 mock。
// 驗錯誤類型同退出碼，唔會抓真網絡、刷新真快照或寫真 fixture。
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
const INITIAL = '{"data_version":"2026.09.1","updated_at":"2026-08-27","series":[{"period":"2026-07","value":1}]}\n';

export async function testRefreshFailures(check) {
  console.log("\n[每週刷新失敗] 真正 script 的錯誤類型、退出碼及交易順序");
  const original = new URL("./refresh-data.mjs", import.meta.url);
  const source = await readFile(original, "utf8");
  const recordingSource = await readFile(new URL("./record-fixtures.mjs", import.meta.url), "utf8");
  const temporary = await mkdtemp(join(tmpdir(), "hkdm-refresh-failures-"));
  let sequence = 0;
  try {
    const supportPath = join(temporary, "support.mjs");
    const supportUrl = pathToFileURL(supportPath).href;
    await writeFile(supportPath, `
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { UpstreamError } from ${JSON.stringify(new URL("../src/data/_lib/http.js", import.meta.url).href)};
import { SchemaError } from ${JSON.stringify(new URL("../src/data/_lib/schema.js", import.meta.url).href)};
export { UpstreamError };
globalThis.fetch = async () => { throw new Error("測試禁止任何網絡"); };
const root = process.env.HKDM_REFRESH_CASE_DIR;
const scenario = JSON.parse(await readFile(join(root, "scenario.json"), "utf8"));
const snapshot = join(root, "snapshot.json");
const event = async (name) => appendFile(join(root, "events.txt"), name + "\\n");
const touched = new Set();
export const fixtureDir = () => join(root, "fixtures");
export const fixturesTouched = () => new Set(touched);
export const CENSTATD_INDICATORS = scenario.target === "csd" ? { sample: {} } : {};
export const FISCAL_INDICATORS = scenario.target === "fiscal" ? { sample: {} } : {};
export const PROPERTY_INDICATORS = scenario.target === "property" ? { sample: {} } : {};
export const MONEY_INDICATORS = scenario.target === "money" ? { sample: {} } : {};
export const SERVICE_INDICATORS = scenario.target === "service" ? { sample: {} } : {};
export const resetTableMetaCache = () => {};
export async function readSnapshot() { return existsSync(snapshot) ? JSON.parse(await readFile(snapshot, "utf8")) : null; }
async function load() {
  await event("load");
  if (scenario.failure === "upstream") throw new UpstreamError("內容換算字樣亦唔影響 error 類型");
  if (scenario.failure === "ordinary") throw new Error("network timeout 字樣亦唔代表 UpstreamError");
  if (scenario.failure === "name-only") { const error = new Error("name 唔係 instanceof"); error.name = "UpstreamError"; throw error; }
  return { updated_at: "2026-08-27", series: [{ period: "2026-07", value: 2 }] };
}
export { load as loadCenstatdIndicator, load as loadFiscalIndicator, load as loadPropertyIndicator, load as loadMoneyIndicator, load as loadServiceProgrammeIndicator };
export function finaliseIndicator(doc, previous) {
  // 同步函式嘅事件寫入以暫存記錄收集，transaction 結束前先 flush。
  transactionEvents.push("finalise");
  if (scenario.failure === "schema") throw new SchemaError("真正 schema error 類型");
  return { ...doc, data_version: previous ? "2026.09.2" : "2026.09.1" };
}
let transactionEvents = [];
export async function withFixtureTransaction(fn) {
  await event("begin");
  try {
    const result = await fn();
    for (const name of transactionEvents.splice(0)) await event(name);
    await event("commit");
    if (process.env.HKDM_FIXTURES === "record") {
      await writeFile(join(fixtureDir(), "source.gz"), "new mock source");
      touched.add("source.gz");
    }
    return result;
  } catch (error) {
    for (const name of transactionEvents.splice(0)) await event(name);
    await event("rollback");
    throw error;
  }
}
export async function writeSnapshot(id, doc) {
  await event("write");
  if (scenario.failure === "write") throw new Error("snapshot write failed");
  const existed = existsSync(snapshot);
  await writeFile(snapshot, JSON.stringify(doc) + "\\n");
  return { written: true, reason: existed ? "changed" : "created", data_version: doc.data_version };
}
`);
    const expectedImports = new Set(["../src/data/_lib/indicators.js", "../src/data/_lib/property.js", "../src/data/_lib/money.js", "../src/data/_lib/service-budget.js", "../src/data/_lib/snapshot.js", "../src/data/_lib/http.js", "../src/data/_lib/censtatd.js"]);
    function wire(text, dependencies = expectedImports) {
      const seen = new Set();
      const wired = text.replace(/(\bfrom\s+["'])(\.[^"']+)(["'])/g, (_, prefix, specifier, suffix) => {
        if (!dependencies.has(specifier) || seen.has(specifier)) throw new Error(`刷新 mock 必須明文匹配唯一依賴：${specifier}`);
        seen.add(specifier); return `${prefix}${supportUrl}${suffix}`;
      });
      if (seen.size !== dependencies.size) throw new Error("刷新 mock 漏咗依賴，禁止接觸真資料");
      return wired;
    }
    async function run(scenario, script = source) {
      const root = join(temporary, `case-${sequence++}`); await mkdir(root);
      await writeFile(join(root, "scenario.json"), JSON.stringify(scenario));
      if (scenario.previous) await writeFile(join(root, "snapshot.json"), INITIAL);
      await writeFile(join(root, "events.txt"), "");
      await writeFile(join(root, "summary.md"), "");
      const scriptPath = join(root, "refresh.mjs"); await writeFile(scriptPath, wire(script));
      let code = 0, output = "";
      try {
        const result = await exec(process.execPath, [scriptPath], {
          cwd: root, timeout: 10000, maxBuffer: 1024 * 1024,
          env: { ...process.env, HKDM_REFRESH_CASE_DIR: root, HKDM_FIXTURES: "replay", HKDM_FIXTURE_DIR: join(root, "fixtures"), GITHUB_STEP_SUMMARY: join(root, "summary.md") },
        });
        output = result.stdout + result.stderr;
      } catch (error) {
        if (typeof error.code !== "number") throw error;
        code = error.code; output = (error.stdout ?? "") + (error.stderr ?? "");
      }
      const snapshot = await readFile(join(root, "snapshot.json"), "utf8").catch((error) => { if (error.code === "ENOENT") return null; throw error; });
      return { code, output, snapshot, events: (await readFile(join(root, "events.txt"), "utf8")).trim().split("\n"), summary: await readFile(join(root, "summary.md"), "utf8") };
    }
    // 重錄腳本有獨立的 registry；若漏接新來源，孤兒清理會誤刪它的舊錄影。
    // 同樣實跑 production script，所有來源及錄影路徑只指向本次暫存目錄。
    async function runRecording(scenario, script = recordingSource) {
      const root = join(temporary, `record-${sequence++}`); await mkdir(root);
      await mkdir(join(root, "fixtures"));
      await writeFile(join(root, "scenario.json"), JSON.stringify(scenario));
      await writeFile(join(root, "events.txt"), "");
      await writeFile(join(root, "fixtures", "source.gz"), "previous mock source");
      await writeFile(join(root, "fixtures", "orphan.gz"), "unused mock source");
      const dependencies = new Set([...expectedImports].filter((name) => name !== "../src/data/_lib/snapshot.js"));
      const scriptPath = join(root, "record.mjs"); await writeFile(scriptPath, wire(script, dependencies));
      let code = 0, output = "";
      try {
        const result = await exec(process.execPath, [scriptPath], {
          cwd: root, timeout: 10000, maxBuffer: 1024 * 1024,
          env: { ...process.env, HKDM_REFRESH_CASE_DIR: root, HKDM_FIXTURES: "record", HKDM_FIXTURE_DIR: join(root, "fixtures") },
        });
        output = result.stdout + result.stderr;
      } catch (error) {
        if (typeof error.code !== "number") throw error;
        code = error.code; output = (error.stdout ?? "") + (error.stderr ?? "");
      }
      const fixture = async (name) => readFile(join(root, "fixtures", name), "utf8").catch((error) => { if (error.code === "ENOENT") return null; throw error; });
      return { code, output, events: (await readFile(join(root, "events.txt"), "utf8")).trim().split("\n"), source: await fixture("source.gz"), orphan: await fixture("orphan.gz") };
    }

    // 三類已知答案，先證明 child-process 觀察到實際成功、拒絕、保留舊檔。
    const happy = await run({ target: "property", previous: true });
    check("真正 property target 成功退出 0，寫入新數字及版本", happy.code === 0 && JSON.parse(happy.snapshot).series[0].value === 2 && JSON.parse(happy.snapshot).data_version === "2026.09.2");
    check("正式流程先驗 schema 再提交 fixture，再寫快照", happy.events.join(",") === "begin,load,finalise,commit,write");
    const upstream = await run({ target: "property", previous: true, failure: "upstream" });
    check("UpstreamError 有舊版退出 0，舊檔 byte 不變", upstream.code === 0 && upstream.snapshot === INITIAL && upstream.events.join(",") === "begin,load,rollback");
    check("上游失敗 summary 明示保留上一版，唔冒充刷新成功", upstream.summary.includes("取得失敗") && upstream.summary.includes("保留上一版") && !upstream.summary.includes("全部成功"));
    const ordinary = await run({ target: "property", previous: true, failure: "ordinary" });
    check("ordinary Error 即使 message 寫 network timeout，都退出 1", ordinary.code === 1 && ordinary.snapshot === INITIAL && ordinary.events.at(-1) === "rollback");
    check("hard fail 後仍輸出 summary，明示阻止提交部署", ordinary.summary.includes("程式／資料錯誤") && ordinary.summary.includes("exit 1") && !ordinary.summary.includes("網站照樣出得街"));
    const orphan = await run({ target: "property", previous: false, failure: "upstream" });
    check("首次上游失敗冇快照退出 1，唔創造假快照", orphan.code === 1 && orphan.snapshot === null && orphan.summary.includes("連上一版都冇"));
    const created = await run({ target: "property", previous: false });
    check("首次成功建立新快照，退出 0", created.code === 0 && JSON.parse(created.snapshot).data_version === "2026.09.1" && created.summary.includes("新增"));
    const schema = await run({ target: "property", previous: true, failure: "schema" });
    check("SchemaError 退出 1 並先回滾 fixture，舊快照不變", schema.code === 1 && schema.snapshot === INITIAL && schema.events.join(",") === "begin,load,finalise,rollback");
    const named = await run({ target: "property", previous: true, failure: "name-only" });
    check("普通 Error 冒充 name=UpstreamError 仍退出 1", named.code === 1 && named.snapshot === INITIAL);
    const write = await run({ target: "property", previous: true, failure: "write" });
    check("磁碟寫入錯誤退出 1，唔當 fail-soft", write.code === 1 && write.summary.includes("snapshot write failed"));
    for (const target of ["csd", "fiscal", "money", "service"]) {
      const hard = await run({ target, previous: true, failure: "ordinary" });
      const soft = await run({ target, previous: true, failure: "upstream" });
      check(`${target} target 同樣區分普通 Error / UpstreamError`, hard.code === 1 && soft.code === 0 && hard.snapshot === INITIAL && soft.snapshot === INITIAL);
    }
    for (const target of ["csd", "fiscal", "property", "money", "service"]) {
      const recorded = await runRecording({ target });
      check(`${target} registry 接到真正重錄腳本，成功才保留新錄影並清孤兒`, recorded.code === 0 && recorded.events.join(",") === "begin,load,commit" && recorded.source === "new mock source" && recorded.orphan === null);
    }
    const recordingFailure = await runRecording({ target: "service", failure: "upstream" });
    check("服務綱領重錄失敗退出1，舊錄影及孤兒均不變", recordingFailure.code === 1 && recordingFailure.events.join(",") === "begin,load,rollback" && recordingFailure.source === "previous mock source" && recordingFailure.orphan === "unused mock source");
    for (const [name, before, after, scenario, rejects] of [
      ["漏接服務綱領 registry", "  ...Object.keys(SERVICE_INDICATORS).map((id) => ({ id, load: () => loadServiceProgrammeIndicator(id) })),", "", { target: "service" }, (result) => result.source !== "new mock source" && !result.events.includes("load")],
      ["失敗仍清孤兒", "if (failed === 0 && existsSync(dir))", "if (existsSync(dir))", { target: "service", failure: "upstream" }, (result) => result.source !== "previous mock source" || result.orphan !== "unused mock source"],
    ]) {
      if (recordingSource.split(before).length !== 2) throw new Error(`重錄突變必須精確命中一次：${before}`);
      check(`真正 record script 突變：${name} 被反例捉到`, rejects(await runRecording(scenario, recordingSource.replace(before, after))));
    }

    for (const [name, before, after, scenario, rejects] of [
      ["吞晒普通 Error", "const hardFailed = !(error instanceof UpstreamError);", "const hardFailed = false;", { target: "property", previous: true, failure: "ordinary" }, (result) => result.code !== 1],
      ["把上游故障全當 hard fail", "const hardFailed = !(error instanceof UpstreamError);", "const hardFailed = true;", { target: "property", previous: true, failure: "upstream" }, (result) => result.code !== 0],
      ["取消首次抓取閘", "if (hardFailures.length > 0 || orphans.length > 0)", "if (hardFailures.length > 0)", { target: "property", previous: false, failure: "upstream" }, (result) => result.code !== 1],
      ["schema 驗證移出 fixture 交易", "const fresh = await withFixtureTransaction(async () => finaliseIndicator(await load(), previous));", "const fresh = finaliseIndicator(await withFixtureTransaction(load), previous);", { target: "property", previous: true, failure: "schema" }, (result) => result.events.includes("commit") && !result.events.includes("rollback")],
      ["漏接服務綱領 registry", "  ...Object.keys(SERVICE_INDICATORS).map((id) => ({ id, load: () => loadServiceProgrammeIndicator(id) })),", "", { target: "service", previous: true, failure: "ordinary" }, (result) => result.code !== 1 && !result.events.includes("load")],
    ]) {
      if (source.split(before).length !== 2) throw new Error(`刷新突變必須精確命中一次：${before}`);
      check(`真正 refresh script 突變：${name} 被反例捉到`, rejects(await run(scenario, source.replace(before, after))));
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
