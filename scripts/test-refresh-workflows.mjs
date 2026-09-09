// 離線驗實際 workflow YAML 同原 commit step；push 只到測試暫存目錄嘅 bare repo。
// 呢個唔係 GitHub runner 模擬器：只支援本專案 ref 接線用嘅屬性讀取及 ||。
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
  console.log("\n[刷新部署] 固定 SHA 傳遞、提交實測及共用排程鎖");
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
  for (const [name, mutate] of [
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
