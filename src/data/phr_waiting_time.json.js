// data loader:人手抄嘅數據,來自 manual/phr_waiting_time.json(見 manual/README.md)
import { loadManualIndicator } from "./_lib/manual.js";
import { loadIndicator } from "./_lib/snapshot.js";

// maxAgeMs: 0 —— 人手改完 manual/ 即刻要生效,唔可以俾六日快照期蓋住
const indicator = await loadIndicator("phr_waiting_time", () => loadManualIndicator("phr_waiting_time"), { maxAgeMs: 0 });
process.stdout.write(JSON.stringify(indicator));
