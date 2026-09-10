// 離線測試工具本身要 fail closed；只喺暫存目錄執行真實 bootstrap，唔開瀏覽器。
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtemp, mkdir, readFile, writeFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

const exec = promisify(execFile);
const requireValue = (value, message) => { if (!value) throw new Error(message); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

function packageContract(pkg, lock) {
  const version = pkg.devDependencies?.playwright;
  requireValue(/^\d+\.\d+\.\d+$/.test(version ?? ""), "Playwright devDependency 必須釘死確切版本");
  requireValue(!pkg.dependencies?.playwright, "Playwright 唔可以係網站 runtime dependency");
  requireValue(lock.packages?.[""]?.devDependencies?.playwright === version, "package / lock 根版本唔一致");
  const installed = lock.packages?.["node_modules/playwright"];
  const core = lock.packages?.["node_modules/playwright-core"];
  requireValue(installed?.version === version && installed.dev === true, "lock Playwright 必須係同版本開發工具");
  requireValue(installed.dependencies?.["playwright-core"] === version && core?.version === version && core.dev === true, "Playwright core 須與 browser 驅動版本一致");
}

export async function testOfflineTooling(check) {
  console.log("\n[離線測試工具] 版本釘死、缺工具失敗及部署 base");
  const [source, pkg, lock] = await Promise.all([
    readFile(new URL("./test-offline.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../package-lock.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  packageContract(pkg, lock);
  check("Playwright 只係同 lock 一致嘅確切版本 devDependency", true);
  for (const [name, mutate] of [
    ["容許自動升版", (p) => { p.devDependencies.playwright = `^${p.devDependencies.playwright}`; }],
    ["加入 runtime", (p) => { p.dependencies = {...p.dependencies, playwright: p.devDependencies.playwright}; }],
    ["lock 根版本漂移", (_, l) => { l.packages[""].devDependencies.playwright = "0.0.1"; }],
    ["lock 套件版本漂移", (_, l) => { l.packages["node_modules/playwright"].version = "0.0.1"; }],
    ["core 驅動版本漂移", (_, l) => { l.packages["node_modules/playwright-core"].version = "0.0.1"; }],
  ]) {
    const p = structuredClone(pkg), l = structuredClone(lock); mutate(p, l);
    check(`工具版本突變：${name}`, throws(() => packageContract(p, l)));
  }

  const start = source.indexOf("const require = createRequire(import.meta.url);");
  const end = source.indexOf("const gdpSnapshot", start);
  requireValue(start >= 0 && end > start, "找不到真實 Playwright bootstrap，停止測試");
  const bootstrap = source.slice(start, end);
  const launch = source.match(/^  browser = await chromium\.launch\(.*\);$/m)?.[0];
  requireValue(launch, "找不到真實 Chromium launch，停止測試");
  const baseStart = source.indexOf("const BASE_PATH =");
  const baseEnd = source.indexOf("\n\n", baseStart);
  requireValue(baseStart >= 0 && baseEnd > baseStart, "找不到真實 base 初始化");
  const baseCode = source.slice(baseStart, baseEnd);
  const temporary = await mkdtemp(join(tmpdir(), "hkdm-offline-tooling-"));
  let index = 0;
  async function run(code, env = {}) {
    const script = join(temporary, `case-${index++}.mjs`);
    await writeFile(script, code);
    try {
      const result = await exec(process.execPath, [script], {env: {...process.env, ...env}, timeout: 10000});
      return {status: 0, ...result};
    } catch (error) {
      return {status: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? ""};
    }
  }
  const fixture = join(temporary, "fixture");
  const packageDir = join(fixture, "node_modules/playwright");
  const prelude = `import {createRequire} from 'node:module';\nimport {join} from 'node:path';\nconst ROOT = ${JSON.stringify(fixture)};\n`;
  const executeBootstrap = (code = bootstrap, suffix = 'console.log("BOOTSTRAP_OK");') => run(prelude + code + suffix);
  const failed = (result) => result.status === 1 && result.stderr.includes("FAIL 無法載入本專案 Playwright") && !result.stdout.includes("BOOTSTRAP_OK");
  try {
    const missing = await executeBootstrap();
    check("真實 bootstrap 缺 Playwright 回 exit 1，唔 SKIP", failed(missing));
    requireValue((bootstrap.match(/process\.exit\(1\)/g) ?? []).length === 1, "缺工具退出點必須唯一");
    const mutant = await executeBootstrap(bootstrap.replace("process.exit(1)", "process.exit(0)"));
    check("突變自證：缺工具改回 exit 0 會被同一驗證拒絕", !failed(mutant) && mutant.status === 0);
    await mkdir(packageDir, {recursive: true});
    await writeFile(join(packageDir, "index.js"), "module.exports = {chromium: {launch() {}}};\n");
    const available = await executeBootstrap();
    check("已知工具 fixture 可載入，無誤報", available.status === 0 && available.stdout.includes("BOOTSTRAP_OK"));
    await writeFile(join(packageDir, "index.js"), "module.exports = {};\n");
    check("套件缺 Chromium launcher 亦要失敗", failed(await executeBootstrap()));
    await writeFile(join(packageDir, "index.js"), "module.exports = {chromium: {launch() {throw new Error('KNOWN_MISSING_BROWSER');}}};\n");
    const missingBrowser = await executeBootstrap(bootstrap, `let browser;\n${launch}\nconsole.log("BOOTSTRAP_OK");`);
    check("真實 launch 缺瀏覽器錯誤會令程序 exit 1", missingBrowser.status === 1 && missingBrowser.stderr.includes("KNOWN_MISSING_BROWSER") && !missingBrowser.stdout.includes("BOOTSTRAP_OK"));

    for (const [base, expected] of [["", "http://localhost:8791/hk-data-monitor/"], ["/", "http://localhost:8791/"], ["/school/data/", "http://localhost:8791/school/data/"]]) {
      const result = await run(`const PORT = 8791;\n${baseCode}\nconsole.log(BASE);`, {BASE_PATH: base});
      check(`真實 base 已知答案：${base || "預設"}`, result.status === 0 && result.stdout.trim() === expected);
    }
    const invalidBase = await run(`const PORT = 8791;\n${baseCode}`, {BASE_PATH: "https://example.invalid/"});
    check("部署 base 唔接受站外 URL", invalidBase.status === 1);
    const serverArgs = source.match(/const server = spawn\(process\.execPath, (\[[^\n]+\]), \{/);
    requireValue(serverArgs, "找不到真實 server 參數");
    // 用 recorder 代替 spawn，實際 server 參數表達式照原碼執行。
    for (const base of ["/", "/hk-data-monitor/"]) {
      const result = await run(`import {join} from 'node:path';\nconst ROOT = '/fixture', PORT = 8791, BASE_PATH = ${JSON.stringify(base)};\nconsole.log(JSON.stringify(${serverArgs[1]}));`);
      const args = JSON.parse(result.stdout);
      check(`真實 server 同 test 使用同一 base：${base}`, result.status === 0 && args[args.indexOf("--base") + 1] === base);
    }
  } finally { await rm(temporary, {recursive: true, force: true}); }
}
