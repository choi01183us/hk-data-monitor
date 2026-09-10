// 離線驗實際 workflow YAML 同原 commit step；push 只到測試暫存目錄嘅 bare repo。
// 呢個唔係 GitHub runner 模擬器：只支援本專案 ref 接線及部署條件用嘅小型語法。
// 新 expression 語法一律拒絕，避免測試睇唔明仍報綠。
import yaml from "js-yaml";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exec = promisify(execFile);
const OLD_SHA = "a".repeat(40), NEW_SHA = "b".repeat(40);
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const requireValue = (value, message) => { if (!value) throw new Error(message); };

function expression(value, context) {
  requireValue(typeof value === "string", "ref expression 缺少");
  const match = value.match(/^\$\{\{\s*(.*?)\s*\}\}$/);
  requireValue(match, "ref 必須來自明文 expression");
  const alternatives = match[1].split(/\s*\|\|\s*/);
  requireValue(alternatives.every((path) => /^[a-z_][a-z_0-9]*(?:\.[a-z_][a-z_0-9]*)+$/.test(path)), "未支援嘅 ref expression 語法");
  let result;
  for (const path of alternatives) {
    let value = context;
    for (const key of path.split(".")) value = value?.[key];
    result = value;
    if (value) return value;
  }
  return result;
}

// 只接受 dotted paths、無跳脫嘅單引號字串、布林、== / != 及 ||。
// 依官方規則：缺屬性係 ''；異類型比較轉數值；字串比較忽略大小寫。
// 完整解析所有分支先計算，未知語法唔會被 OR 短路遮住；唔執行 YAML 內嘅 JS。
function condition(source, context) {
  const match = typeof source === "string" && source.match(/^\$\{\{\s*(.*?)\s*\}\}$/);
  requireValue(match, "部署條件必須來自明文 expression");
  const atom = "(?:true|false|'[^'|]*'|[a-z_][a-z_0-9]*(?:\\.[a-z_][a-z_0-9]*)+)";
  const comparison = new RegExp(`^\\s*(${atom})(?:\\s*(==|!=)\\s*(${atom}))?\\s*$`);
  const read = (token) => {
    if (token === "true" || token === "false") return token === "true";
    if (token.startsWith("'")) return token.slice(1, -1);
    let value = context;
    for (const key of token.split(".")) value = value?.[key];
    if (value === undefined) return "";
    requireValue(typeof value === "string" || typeof value === "boolean", "部署條件出現未支援嘅值類型");
    return value;
  };
  const equals = (left, right) => {
    if (typeof left !== typeof right) return Number(left) === Number(right);
    return typeof left === "string" ? left.toLowerCase() === right.toLowerCase() : left === right;
  };
  const terms = match[1].split("||").map((term) => {
    const parsed = term.match(comparison);
    requireValue(parsed, "未支援嘅部署條件語法");
    const left = read(parsed[1]);
    if (!parsed[2]) return Boolean(left);
    const same = equals(left, read(parsed[3]));
    return parsed[2] === "==" ? same : !same;
  });
  return terms.some(Boolean);
}

function deployTriggerContract(workflow, name) {
  const input = workflow.on?.workflow_dispatch?.inputs?.deploy;
  requireValue(input?.type === "boolean" && input.default === true, `${name}:人手部署 input 必須係預設 true 嘅 boolean`);
  for (const [label, context, expected] of [
    ["排程缺 inputs", {github: {event_name: "schedule"}}, true],
    ["人手 true", {github: {event_name: "workflow_dispatch"}, inputs: {deploy: true}}, true],
    ["人手 false", {github: {event_name: "workflow_dispatch"}, inputs: {deploy: false}}, false]
  ]) requireValue(condition(workflow.jobs?.deploy?.if, context) === expected, `${name}:${label} 部署選擇錯誤`);
}

// 只支援呢份 YAML 現有嘅忽略樣式及舊錯誤樣式；唔假裝實作完整 GitHub glob。
function ignoredPath(path, patterns) {
  const matches = patterns.map((pattern) => {
    if (pattern === "*.md") return !path.includes("/") && path.endsWith(".md");
    if (pattern === "**.md") return path.endsWith(".md");
    if (pattern === "docs/**") return path.startsWith("docs/");
    if (pattern === "manual/README.md") return path === pattern;
    if (pattern === ".github/**.md") return path.startsWith(".github/") && path.endsWith(".md");
    throw new Error(`未支援嘅忽略樣式：${pattern}`);
  });
  return matches.some(Boolean);
}

function deployArtifactContract(deploy) {
  const job = deploy.jobs?.build, steps = job?.steps ?? [];
  const position = (run) => steps.findIndex((step) => step.run?.trim() === run);
  const install = position("npm ci"), checks = position("npm run test:checks");
  const browser = position("npx --no-install playwright install --with-deps chromium");
  const build = position("npm run build"), offline = position("npm run test:offline");
  const upload = steps.findIndex((step) => /^actions\/upload-pages-artifact@/.test(step.uses ?? ""));
  requireValue(install >= 0 && checks > install && browser > checks && build > browser && offline === build + 1 && upload === offline + 1, "必須先裝測試工具及驗證，再 build、驗原 dist、直接上載同一 artifact");
  requireValue(steps[upload].with?.path === "dist", "上載位置必須係已驗證嘅 dist");
  requireValue(steps[build].env?.BASE_PATH === "${{ steps.pages.outputs.base_path }}/" && steps[offline].env?.BASE_PATH === steps[build].env.BASE_PATH, "離線測試必須使用同一部署 base");
  requireValue(!job["continue-on-error"], "建置失敗唔可以繼續部署");
  for (const index of [install, checks, browser, build, offline, upload]) {
    requireValue(!steps[index]["continue-on-error"] && !steps[index].if, "驗證及上載步驟唔可以略過或吞錯");
  }
  const patterns = deploy.on?.push?.["paths-ignore"];
  requireValue(Array.isArray(patterns), "部署 push 必須明文保留網站內容");
  for (const path of ["src/index.md", "src/learn/classroom.md", "src/lang/en-GB.json", "src/components/locale.js", "manual/public_expenditure_policy_groups.json"]) {
    requireValue(!ignoredPath(path, patterns), `${path}:網站內容改動唔可以忽略部署`);
  }
}

function checkoutStep(deploy) {
  const steps = deploy.jobs?.build?.steps?.filter((step) => /^actions\/checkout@/.test(step.uses ?? "")) ?? [];
  requireValue(steps.length === 1, "部署 checkout 缺少或重複");
  return steps[0];
}

function refreshBranch(caller, eventSha) {
  const checkouts = caller.jobs?.refresh?.steps?.filter((step) => /^actions\/checkout@/.test(step.uses ?? "")) ?? [];
  requireValue(checkouts.length === 1, "刷新 checkout 缺少或重複");
  return expression(checkouts[0].with?.ref, { github: { ref_name: "main", sha: eventSha } });
}

function contract(callers, deploy) {
  requireValue(deploy.on?.workflow_call?.inputs?.ref?.type === "string", "被呼叫部署須聲明 ref 字串 input");
  for (const [name, workflow] of Object.entries(callers)) {
    deployTriggerContract(workflow, name);
    requireValue(workflow.concurrency?.group === "hkdm-refresh" && workflow.concurrency?.["cancel-in-progress"] === false, `${name}:兩個刷新須共用非取消鎖`);
    requireValue(refreshBranch(workflow, OLD_SHA) === "main", `${name}:刷新開始時須取分支最新提交，唔用排隊事件舊 SHA`);
    const job = workflow.jobs?.refresh;
    const steps = job?.steps ?? [];
    const commit = steps.findIndex((step) => step.id === "commit");
    const validate = steps.findIndex((step) => step.run?.trim() === "npm run validate");
    const checks = steps.findIndex((step) => step.run?.trim() === "npm run test:checks");
    requireValue(validate >= 0 && checks > validate && commit > checks, `${name}:驗證及自證要喺提交之前`);
    requireValue(!job["continue-on-error"] && !steps[validate]["continue-on-error"] && !steps[checks]["continue-on-error"] && !steps[commit]["continue-on-error"], `${name}:驗證失敗唔可以繼續提交`);
    const needs = [].concat(workflow.jobs?.deploy?.needs ?? []);
    requireValue(needs.includes("refresh") && workflow.jobs.deploy.uses === "./.github/workflows/deploy.yml", `${name}:部署須等刷新成功再呼叫同一部署`);
    requireValue(job.outputs?.ref && workflow.jobs.deploy.with?.ref, `${name}:ref 接線缺少`);
  }
  requireValue(checkoutStep(deploy).with?.ref, "部署 checkout 冇固定 ref");
  deployArtifactContract(deploy);
}

function routedSha(caller, deploy, emittedSha, eventSha) {
  const jobRef = expression(caller.jobs.refresh.outputs.ref, { steps: { commit: { outputs: { ref: emittedSha } } }, github: { sha: eventSha } });
  const inputRef = expression(caller.jobs.deploy.with.ref, { needs: { refresh: { outputs: { ref: jobRef } } }, github: { sha: eventSha } });
  return expression(checkoutStep(deploy).with.ref, { inputs: { ref: inputRef }, github: { sha: eventSha } });
}

function verified(callers, deploy) {
  contract(callers, deploy);
  for (const [name, caller] of Object.entries(callers)) requireValue(routedSha(caller, deploy, NEW_SHA, OLD_SHA) === NEW_SHA, `${name}:刷新後部署回到觸發前 SHA`);
}

function outputs(text) {
  const values = {};
  for (const line of text.split("\n").filter(Boolean)) {
    const index = line.indexOf("=");
    requireValue(index > 0, "測試只接受單行 key=value 輸出");
    const key = line.slice(0, index);
    requireValue(!Object.hasOwn(values, key), `step output ${key} 重複`);
    values[key] = line.slice(index + 1);
  }
  return values;
}

async function exerciseCommitStep(name, workflow, deploy, check, temporary) {
  const root = join(temporary, name);
  const repo = join(root, "working");
  const remote = join(root, "remote.git");
  await mkdir(root, { recursive: true });
  // 所有 Git 操作限於新建臨時 repo；remote 為本機檔案路徑。
  const git = (args) => exec("git", args, { cwd: repo, maxBuffer: 1024 * 1024 });
  await exec("git", ["init", "--quiet", "--bare", remote]);
  await exec("git", ["init", "--quiet", "--initial-branch=main", repo]);
  await git(["config", "user.name", "HKDM workflow test"]);
  await git(["config", "user.email", "workflow-test@example.invalid"]);
  const directories = name === "city" ? ["_city_snapshots", "_city_fixtures"] : ["_snapshots", "_fixtures"];
  const paths = directories.map((dir) => join(repo, "src/data", dir, "sample.json"));
  for (const path of paths) { await mkdir(join(path, ".."), { recursive: true }); await writeFile(path, "old\n"); }
  await git(["add", "."]); await git(["commit", "--quiet", "-m", "initial"]);
  await git(["remote", "add", "origin", remote]); await git(["push", "--quiet", "--set-upstream", "origin", "main"]);
  const oldSha = (await git(["rev-parse", "HEAD"])).stdout.trim();
  const commit = workflow.jobs.refresh.steps.find((step) => step.id === "commit");
  const originalScript = commit.run;
  const script = join(root, "commit.sh");
  const output = join(root, "outputs.txt");
  async function run(source = originalScript) {
    await writeFile(script, source); await writeFile(output, "");
    let failed = false;
    try { await exec("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", script], { cwd: repo, env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_SHA: oldSha }, maxBuffer: 1024 * 1024 }); }
    catch { failed = true; }
    return { failed, values: outputs(await readFile(output, "utf8")) };
  }

  for (const path of paths) await writeFile(path, "fresh\n");
  const changed = await run();
  const freshSha = (await git(["rev-parse", "HEAD"])).stdout.trim();
  check(`${name}:原 commit step 有改動真係建立新 SHA`, !changed.failed && freshSha !== oldSha && /^[a-f0-9]{40}$/.test(changed.values.ref ?? ""));
  check(`${name}:step 輸出精確等於提交後 HEAD`, changed.values.ref === freshSha);
  const remoteSha = (await exec("git", ["--git-dir", remote, "rev-parse", "refs/heads/main"])).stdout.trim();
  check(`${name}:同一個 SHA 已 push 到本地測試 remote`, remoteSha === freshSha);
  check(`${name}:快照及錄影同次提交，冇漏低未提交改動`, (await git(["status", "--porcelain"])).stdout === "");
  check(`${name}:實際 step output 經 YAML 接線部署新版本`, routedSha(workflow, deploy, changed.values.ref, oldSha) === freshSha);

  // 另一個排隊事件記住 oldSha，但前一個刷新已推送 freshSha。
  // 用真 YAML 決定嘅分支 clone，確認新 job 起點係當刻分支 HEAD。
  const queued = join(root, "queued");
  await exec("git", ["clone", "--quiet", "--branch", refreshBranch(workflow, oldSha), remote, queued]);
  const queuedHead = (await exec("git", ["rev-parse", "HEAD"], { cwd: queued })).stdout.trim();
  check(`${name}:排隊事件 SHA 已舊，分支 checkout 仍取前一輪新提交`, queuedHead === freshSha && queuedHead !== oldSha);

  // 反例真正推一次本地 remote：固定舊 SHA 開新提交，會形成非快進分叉。
  const queuedGit = (args) => exec("git", args, { cwd: queued, maxBuffer: 1024 * 1024 });
  await queuedGit(["checkout", "--quiet", "-b", "stale-event", oldSha]);
  await queuedGit(["config", "user.name", "HKDM workflow test"]);
  await queuedGit(["config", "user.email", "workflow-test@example.invalid"]);
  await writeFile(join(queued, "queued.json"), "queued event\n");
  await queuedGit(["add", "queued.json"]); await queuedGit(["commit", "--quiet", "-m", "queued stale event"]);
  let staleBaseRejected = false;
  try { await queuedGit(["push", "origin", "HEAD:main"]); } catch { staleBaseRejected = true; }
  check(`${name}:舊事件起點反例真係 non-fast-forward，remote 保持新版本`, staleBaseRejected && (await exec("git", ["--git-dir", remote, "rev-parse", "refs/heads/main"])).stdout.trim() === freshSha);

  const unchanged = await run();
  check(`${name}:無變動唔建立空 commit，仍輸出目前 SHA`, !unchanged.failed && unchanged.values.ref === freshSha && (await git(["rev-parse", "HEAD"])).stdout.trim() === freshSha);
  check(`${name}:無變動路徑亦傳到固定 checkout`, routedSha(workflow, deploy, unchanged.values.ref, oldSha) === freshSha);

  // 真正 shell 突變：把提交後 HEAD 換成事件舊 SHA，唔只測紙上接線。
  const target = "$(git rev-parse HEAD)";
  requireValue(originalScript.split(target).length === 2, `${name}:SHA 突變必須命中一次`);
  const stale = await run(originalScript.replace(target, "$GITHUB_SHA"));
  check(`${name}:舊事件 SHA 突變成功命中`, !stale.failed && stale.values.ref === oldSha);
  check(`${name}:實際突變唔能夠冒充已提交新版本`, routedSha(workflow, deploy, stale.values.ref, oldSha) !== freshSha);

  // Push 失敗必須令 step 失敗，亦唔可先輸出可供 deploy 使用嘅 ref。
  for (const path of paths) await writeFile(path, "next\n");
  await git(["remote", "set-url", "origin", join(root, "missing-remote.git")]);
  const unpushed = await run();
  check(`${name}:push 失敗係 hard fail`, unpushed.failed);
  check(`${name}:push 失敗唔會輸出未推送 ref`, unpushed.values.ref === undefined);
}

function weatherScheduleContract(workflow) {
  const schedules = workflow.on?.schedule?.map((entry) => entry.cron).sort();
  requireValue(JSON.stringify(schedules) === JSON.stringify(["37 */3 * * *", "7 * * * *"]), "城市與天氣排程須分開保留");
  const steps = workflow.jobs.refresh.steps.filter((step) => step.env?.HKDM_CITY_SCHEDULE);
  requireValue(steps.length === 1 && steps[0].env.HKDM_CITY_SCHEDULE === "${{ github.event.schedule }}", "天氣分流須使用觸發事件排程");
  return steps[0].run;
}

async function exerciseWeatherRoute(workflow, check, temporary) {
  const source = weatherScheduleContract(workflow);
  const directory = join(temporary, "weather-route"), bin = join(directory, "bin"), script = join(directory, "route.sh");
  await mkdir(bin, {recursive: true});
  // Only the actual YAML shell routing runs; node is a local argument recorder.
  const node = join(bin, "node");
  await writeFile(node, '#!/bin/sh\nprintf "%s\\n" "$*"\n'); await chmod(node, 0o755);
  async function route(schedule, code = source) {
    await writeFile(script, code);
    try {
      const result = await exec("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", script], {
        cwd: directory, env: {...process.env, PATH: `${bin}:${process.env.PATH}`, HKDM_CITY_SCHEDULE: schedule}
      });
      return result.stdout.trim();
    } catch { return "rejected"; }
  }
  for (const [schedule, expected] of [
    ["7 * * * *", "scripts/refresh-city.mjs --weather-only"],
    ["37 */3 * * *", "scripts/refresh-city.mjs"],
    ["", "scripts/refresh-city.mjs"],
    ["unknown", "rejected"]
  ]) check(`真實排程分流已知答案：${schedule || "人手觸發"}`, await route(schedule) === expected);
  check("排程突變：漏 weather-only 會錯抓新聞及航班", await route("7 * * * *", source.replace(" --weather-only", "")) !== "scripts/refresh-city.mjs --weather-only");
  check("排程突變：錯誤小時分流會被已知答案捉到", await route("7 * * * *", source.replace('"7 * * * *"', '"8 * * * *"')) === "rejected");
  for (const [label, change] of [
    ["漏每小時排程", (w) => { w.on.schedule = w.on.schedule.slice(0, 1); }],
    ["改埋新聞頻率", (w) => { w.on.schedule[0].cron = "37 * * * *"; }],
    ["漏觸發事件接線", (w) => { w.jobs.refresh.steps.find((s) => s.env?.HKDM_CITY_SCHEDULE).env.HKDM_CITY_SCHEDULE = "7 * * * *"; }]
  ]) { const bad = structuredClone(workflow); change(bad); check(`天氣排程契約突變：${label}`, throws(() => weatherScheduleContract(bad))); }
}

export async function testRefreshWorkflows(check) {
  console.log("\n[刷新部署] 事件條件、固定 SHA、提交實測及部署前離線驗證");
  for (const [label, source, context, expected] of [
    ["缺屬性等於 false", "${{ inputs.deploy == false }}", {}, true],
    ["舊式排程條件會拒絕", "${{ inputs.deploy != false }}", {github: {event_name: "schedule"}}, false],
    ["真 boolean 保留", "${{ inputs.deploy == true }}", {inputs: {deploy: true}}, true],
    ["字串 false 唔係 boolean true", "${{ inputs.deploy == true }}", {inputs: {deploy: "false"}}, false],
    ["字串比較忽略大小寫", "${{ github.event_name == 'schedule' }}", {github: {event_name: "SCHEDULE"}}, true],
    ["OR 取後項", "${{ false || inputs.deploy }}", {inputs: {deploy: true}}, true],
    ["OR 兩項 false", "${{ false || inputs.deploy }}", {inputs: {deploy: false}}, false],
  ]) {
    requireValue(condition(source, context) === expected, `部署條件工具已知答案失敗：${label}`);
    check(`部署條件工具自證：${label}`, true);
  }
  for (const source of ["${{ true || unknown() }}", "${{ !inputs.deploy }}", "${{ inputs.deploy && true }}", "${{ inputs.deploy = true }}"]) {
    const rejected = throws(() => condition(source, {inputs: {deploy: true}}));
    requireValue(rejected, `部署條件工具誤接納未知語法：${source}`);
    check(`部署條件工具拒絕未知語法：${source}`, rejected);
  }
  for (const [path, patterns, expected] of [
    ["README.md", ["*.md"], true],
    ["src/index.md", ["*.md"], false],
    ["src/learn/classroom.md", ["**.md"], true],
    ["docs/課堂任務.md", ["docs/**"], true],
    ["src/lang/en-GB.json", ["*.md", "docs/**"], false],
  ]) {
    requireValue(ignoredPath(path, patterns) === expected, `路徑工具已知答案失敗：${path}`);
    check(`部署路徑工具自證：${path}`, true);
  }
  check("未知路徑樣式必須拒絕", throws(() => ignoredPath("src/index.md", ["src/**"])));
  // 先自證小 expression 讀取器，答唔啱已知答案就唔信後面接線檢查。
  for (const [label, source, context, expected] of [
    ["明文 ref 優先", "${{ inputs.ref || github.sha }}", { inputs: { ref: NEW_SHA }, github: { sha: OLD_SHA } }, NEW_SHA],
    ["直接部署冇 ref 用事件 SHA", "${{ inputs.ref || github.sha }}", { inputs: {}, github: { sha: OLD_SHA } }, OLD_SHA],
    ["空 ref 同樣後備", "${{ inputs.ref || github.sha }}", { inputs: { ref: "" }, github: { sha: OLD_SHA } }, OLD_SHA],
    ["job output 深層接線", "${{ needs.refresh.outputs.ref }}", { needs: { refresh: { outputs: { ref: NEW_SHA } } } }, NEW_SHA],
  ]) {
    requireValue(expression(source, context) === expected, `已知答案失敗:${label}`);
    check(`接線讀取器自證:${label}`, true);
  }
  check("未知 expression 語法必須拒絕", throws(() => expression("${{ format('x') }}", {})));
  const base = new URL("../.github/workflows/", import.meta.url);
  const load = async (name) => yaml.safeLoad(await readFile(new URL(name, base), "utf8"));
  const callers = { city: await load("refresh-city.yml"), statistics: await load("refresh-data.yml") };
  const deploy = await load("deploy.yml");
  check("兩份真實 YAML 共用鎖、先驗再提交同固定 SHA 接線", !throws(() => verified(callers, deploy)));
  for (const [name, workflow] of Object.entries(callers)) {
    for (const [event, input, expected] of [["schedule", undefined, true], ["workflow_dispatch", true, true], ["workflow_dispatch", false, false]]) {
      const context = {github: {event_name: event}, ...(input === undefined ? {} : {inputs: {deploy: input}})};
      check(`${name}:實際 YAML ${event} deploy=${input ?? "缺少"}`, condition(workflow.jobs.deploy.if, context) === expected);
    }
  }
  for (const [name, mutate] of [
    ["城市排程回舊錯誤條件", (c) => { c.city.jobs.deploy.if = "${{ inputs.deploy != false }}"; }],
    ["統計排程回舊錯誤條件", (c) => { c.statistics.jobs.deploy.if = "${{ inputs.deploy != false }}"; }],
    ["人手 false 都部署", (c) => { c.city.jobs.deploy.if = "${{ true }}"; }],
    ["deploy input 變字串", (c) => { c.city.on.workflow_dispatch.inputs.deploy.type = "string"; }],
    ["部署忽略所有 Markdown", (_, d) => { d.on.push["paths-ignore"] = ["**.md"]; }],
    ["部署漏自證", (_, d) => { d.jobs.build.steps = d.jobs.build.steps.filter((s) => s.run !== "npm run test:checks"); }],
    ["部署漏裝瀏覽器", (_, d) => { d.jobs.build.steps = d.jobs.build.steps.filter((s) => !s.run?.startsWith("npx --no-install playwright")); }],
    ["部署漏離線測試", (_, d) => { d.jobs.build.steps = d.jobs.build.steps.filter((s) => s.run !== "npm run test:offline"); }],
    ["離線失敗仍上載", (_, d) => { d.jobs.build.steps.find((s) => s.run === "npm run test:offline")["continue-on-error"] = true; }],
    ["離線步驟可以略過", (_, d) => { d.jobs.build.steps.find((s) => s.run === "npm run test:offline").if = "${{ false }}"; }],
    ["離線測試後再 build", (_, d) => { d.jobs.build.steps.splice(d.jobs.build.steps.findIndex((s) => s.run === "npm run test:offline") + 1, 0, {run: "npm run build"}); }],
    ["上載另一份未驗 artifact", (_, d) => { d.jobs.build.steps.find((s) => /^actions\/upload-pages-artifact@/.test(s.uses ?? "")).with.path = "other-dist"; }],
    ["離線測試漏部署 base", (_, d) => { delete d.jobs.build.steps.find((s) => s.run === "npm run test:offline").env.BASE_PATH; }],
    ["刷新 checkout 回事件舊 SHA", (c) => { c.city.jobs.refresh.steps.find((s) => /^actions\/checkout@/.test(s.uses ?? "")).with.ref = "${{ github.sha }}"; }],
    ["刷新 checkout 冇明文分支", (c) => { delete c.statistics.jobs.refresh.steps.find((s) => /^actions\/checkout@/.test(s.uses ?? "")).with.ref; }],
    ["漏 caller job output", (c) => { delete c.city.jobs.refresh.outputs.ref; }],
    ["caller output 用舊事件 SHA", (c) => { c.city.jobs.refresh.outputs.ref = "${{ github.sha }}"; }],
    ["caller 漏傳 ref", (c) => { delete c.city.jobs.deploy.with.ref; }],
    ["另一個 caller 傳舊事件 SHA", (c) => { c.statistics.jobs.deploy.with.ref = "${{ github.sha }}"; }],
    ["部署漏 ref input", (_, d) => { delete d.on.workflow_call.inputs.ref; }],
    ["checkout 用事件舊 SHA", (_, d) => { checkoutStep(d).with.ref = "${{ github.sha }}"; }],
    ["checkout 冇 ref", (_, d) => { delete checkoutStep(d).with.ref; }],
    ["兩個刷新各自用不同鎖", (c) => { c.city.concurrency.group = "city-refresh"; }],
    ["新刷新可以殺死舊刷新", (c) => { c.statistics.concurrency["cancel-in-progress"] = true; }],
    ["部署唔等刷新完成", (c) => { delete c.city.jobs.deploy.needs; }],
    ["缺 schema 驗證", (c) => { c.city.jobs.refresh.steps = c.city.jobs.refresh.steps.filter((s) => s.run !== "npm run validate"); }],
    ["push 失敗仍容許部署", (c) => { c.city.jobs.refresh.steps.find((s) => s.id === "commit")["continue-on-error"] = true; }],
    ["自證失敗仍繼續提交", (c) => { c.statistics.jobs.refresh.steps.find((s) => s.run === "npm run test:checks")["continue-on-error"] = true; }],
  ]) {
    const c = structuredClone(callers), d = structuredClone(deploy); mutate(c, d);
    check(`接線突變:${name}會嘈`, throws(() => verified(c, d)));
  }
  const temporary = await mkdtemp(join(tmpdir(), "hkdm-refresh-workflows-"));
  try {
    for (const [name, caller] of Object.entries(callers)) await exerciseCommitStep(name, caller, deploy, check, temporary);
    await exerciseWeatherRoute(callers.city, check, temporary);
  }
  finally { await rm(temporary, { recursive: true, force: true }); }
}
