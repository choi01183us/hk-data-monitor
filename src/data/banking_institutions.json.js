import { loadManualIndicator } from "./_lib/manual.js";
import { loadIndicator } from "./_lib/snapshot.js";
const indicator = await loadIndicator("banking_institutions", () => loadManualIndicator("banking_institutions"), { maxAgeMs: 0 });
process.stdout.write(JSON.stringify(indicator));
