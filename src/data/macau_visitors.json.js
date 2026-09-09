import { loadManualIndicator } from "./_lib/manual.js";
import { loadIndicator } from "./_lib/snapshot.js";
const indicator = await loadIndicator("macau_visitors", () => loadManualIndicator("macau_visitors"), { maxAgeMs: 0 });
process.stdout.write(JSON.stringify(indicator));
