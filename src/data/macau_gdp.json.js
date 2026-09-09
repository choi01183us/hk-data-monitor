import { loadManualIndicator } from "./_lib/manual.js";
import { loadIndicator } from "./_lib/snapshot.js";
const indicator = await loadIndicator("macau_gdp", () => loadManualIndicator("macau_gdp"), { maxAgeMs: 0 });
process.stdout.write(JSON.stringify(indicator));
