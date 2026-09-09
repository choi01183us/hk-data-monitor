import {createServer} from "node:http";
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {gunzipSync} from "node:zlib";
import {buildIndicator, SchemaError, validateIndicator} from "../src/data/_lib/schema.js";

/** Exercise the real loader and HTTP recording code; only their disk roots are isolated. */
export async function testBuildRecording(check) {
  console.log("\n[建置錄影] loader 最終驗證通過先提交錄影");
  const snapshotUrl = new URL("../src/data/_lib/snapshot.js",import.meta.url);
  const source = await readFile(snapshotUrl,"utf8");
  const httpSource = await readFile(new URL("../src/data/_lib/http.js",import.meta.url),"utf8");
  const example = JSON.parse(await readFile(new URL("../src/data/_snapshots/population.json",import.meta.url),"utf8"));
  const directory = await mkdtemp(join(tmpdir(),"hkdm-build-recording-"));
  const savedEnvironment = Object.fromEntries(["HKDM_FIXTURES","HKDM_FIXTURE_DIR","HKDM_OFFLINE","HKDM_REFRESH"].map((key)=>[key,process.env[key]]));
  let current = {value:100,phase:"previous"};
  let requests = 0;
  const server = createServer((request,response)=>{
    requests++;
    if(request.url === "/fail") {response.writeHead(404);response.end("fixture upstream failure");return;}
    response.writeHead(200,{"content-type":"application/json"});
    response.end(JSON.stringify({...current,path:request.url}));
  });
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  const base = `http://127.0.0.1:${server.address().port}`;
  let sequence = 0;

  function replaceOnce(text,from,to) {
    if(text.split(from).length!==2)throw new Error(`錄影邊界突變必須精確命中一次：${from}`);
    return text.replace(from,to);
  }
  async function scenario(kind,productionSource=source) {
    const root=join(directory,`case-${sequence++}`);
    const library=join(root,"data/_lib");
    const fixtures=join(root,"fixtures");
    await mkdir(library,{recursive:true});
    await mkdir(fixtures);
    // Keeping the production HERE calculation makes SNAPSHOT_DIR point inside this fixture.
    await writeFile(join(library,"snapshot.mjs"),productionSource
      .replace('"./schema.js"',JSON.stringify(new URL("../src/data/_lib/schema.js",import.meta.url).href))
      .replace('"./http.js"','"./http.mjs"'));
    await writeFile(join(library,"http.mjs"),httpSource);
    const loader=await import(pathToFileURL(join(library,"snapshot.mjs")).href);
    const http=await import(pathToFileURL(join(library,"http.mjs")).href);
    process.env.HKDM_FIXTURES="record";
    process.env.HKDM_FIXTURE_DIR=fixtures;
    delete process.env.HKDM_OFFLINE;
    process.env.HKDM_REFRESH="1";

    const previous=loader.finaliseIndicator(buildIndicator({...example,frequency:"annual",series:[{period:"2025",value:100}],anchors:[],fetched_at:"2020-01-01T00:00:00.000Z"}));
    await mkdir(loader.SNAPSHOT_DIR,{recursive:true});
    const snapshotPath=loader.snapshotPath("population");
    const oldSnapshot=JSON.stringify(previous,null,2)+"\n";
    await writeFile(snapshotPath,oldSnapshot);
    const fixtureBytes=async()=>Object.fromEntries(await Promise.all((await readdir(fixtures)).sort().map(async(name)=>[name,(await readFile(join(fixtures,name))).toString("base64")])));
    current={value:100,phase:"previous"};
    await http.fetchJson(`${base}/existing`,{retries:1});
    const oldFixtures=await fixtureBytes();
    current={value:kind==="unchanged"?100:110,phase:"new response"};
    let stagingObserved=false, result, error;
    const fetcher=async()=>{
      const first=await http.fetchJson(`${base}/existing`,{retries:1});
      await http.fetchJson(`${base}/new`,{retries:1});
      stagingObserved=http.pendingFixtureCount()===2 && JSON.stringify(await fixtureBytes())===JSON.stringify(oldFixtures);
      if(kind==="upstream")await http.fetchJson(`${base}/fail`,{retries:1});
      if(kind==="fetcher-error")throw new Error("ordinary failure after staged HTTP responses");
      const fresh=buildIndicator({...previous,series:[{period:"2025",value:first.body.value}],fetched_at:new Date().toISOString()});
      if(kind==="schema")delete fresh.source_url;
      // The error occurs in finaliseIndicator's spread, after the fetcher has returned.
      if(kind==="ordinary-finalise")Object.defineProperty(fresh,"source_url",{enumerable:true,get(){throw new Error("ordinary finalisation failure");}});
      return fresh;
    };
    try {result=await loader.loadIndicator("population",fetcher);}catch(caught){error=caught;}
    const afterFixtures=await fixtureBytes();
    const afterSnapshot=await readFile(snapshotPath,"utf8");
    const recordings=await Promise.all(Object.keys(afterFixtures).map(async(name)=>JSON.parse(gunzipSync(await readFile(join(fixtures,name))).toString("utf8"))));
    return {
      stagingObserved,result,error,
      cleared:http.pendingFixtureCount()===0,
      snapshotUnchanged:afterSnapshot===oldSnapshot,
      fixturesUnchanged:JSON.stringify(afterFixtures)===JSON.stringify(oldFixtures),
      committedNewPair:recordings.length===2 && recordings.every((record)=>JSON.parse(record.body).phase==="new response" && JSON.parse(record.body).value===current.value),
      disk:JSON.parse(afterSnapshot),previous
    };
  }
  const rollbackOracle=(result,ErrorType=Error)=>result.stagingObserved && result.cleared && result.error instanceof ErrorType && result.result===undefined && result.snapshotUnchanged && result.fixturesUnchanged;
  try {
    const schema=await scenario("schema");
    check("最終 schema 錯誤前兩份錄影仍在緩衝",schema.stagingObserved);
    check("最終 schema 錯誤 hard fail，快照及舊／新錄影逐 byte 回滾",rollbackOracle(schema,SchemaError));
    const ordinary=await scenario("ordinary-finalise");
    check("fetcher 回傳後普通驗證錯誤亦 hard fail 並回滾",rollbackOracle(ordinary) && ordinary.error.message==="ordinary finalisation failure");
    check("fetcher 抓完數後普通錯誤同樣回滾",rollbackOracle(await scenario("fetcher-error")));
    const changed=await scenario("success");
    check("成功提交同次錄影及新快照，schema／hash 保持有效",changed.stagingObserved && changed.cleared && !changed.error && changed.committedNewPair && !changed.snapshotUnchanged && validateIndicator(changed.disk).ok && changed.disk.series[0].value===110 && changed.result.content_hash===changed.disk.content_hash && changed.result.build.mode==="live" && changed.result.build.stale===false);
    const unchanged=await scenario("unchanged");
    check("同一 canonical 內容成功仍可提交完整錄影，快照 byte／版本不變",unchanged.stagingObserved && unchanged.cleared && !unchanged.error && unchanged.committedNewPair && unchanged.snapshotUnchanged && unchanged.result.data_version===unchanged.previous.data_version && unchanged.result.content_hash===unchanged.previous.content_hash);
    const upstream=await scenario("upstream");
    check("UpstreamError 保留原快照／錄影並標記 stale，唔擴大 fail-soft",upstream.stagingObserved && upstream.cleared && !upstream.error && upstream.snapshotUnchanged && upstream.fixturesUnchanged && upstream.result.content_hash===upstream.previous.content_hash && upstream.result.build.mode==="snapshot" && upstream.result.build.reason==="fetch_failed" && upstream.result.build.stale===true && upstream.result.build.stale_reason.includes("404"));

    const reverted=replaceOnce(source,
      "const fresh = await withFixtureTransaction(async () => finaliseIndicator(await fetcher(), snapshot));",
      "const fresh = finaliseIndicator(await withFixtureTransaction(fetcher), snapshot);");
    check("突變自證：把 schema 驗證移出交易，舊快照會配上新錄影",!rollbackOracle(await scenario("schema",reverted),SchemaError));
    check("突變自證：把普通 finalise 錯誤移出交易同樣被捉到",!rollbackOracle(await scenario("ordinary-finalise",reverted)));
    const softened=replaceOnce(source,"if (!(error instanceof UpstreamError)) {","if (false) {");
    check("突變自證：把所有錯誤當 fail-soft 會被捉到",!rollbackOracle(await scenario("schema",softened),SchemaError));
    check("錄影回歸全部經本機 HTTP 實際抓取路徑",requests===28);
  } finally {
    for(const [key,value] of Object.entries(savedEnvironment)) {
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
    await new Promise((resolve)=>server.close(resolve));
    await rm(directory,{recursive:true,force:true});
  }
}
