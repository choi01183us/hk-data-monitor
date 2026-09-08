// data loader:人手抄嘅數據,來自 manual/public_expenditure_policy_groups.json(見 manual/README.md)
import { loadManualIndicator } from "./_lib/manual.js";
import { loadIndicator } from "./_lib/snapshot.js";

// maxAgeMs: 0 —— 人手改完 manual/ 即刻要生效,唔可以俾六日快照期蓋住
const indicator = await loadIndicator("public_expenditure_policy_groups", () => loadManualIndicator("public_expenditure_policy_groups"), { maxAgeMs: 0 });
process.stdout.write(JSON.stringify(indicator));
