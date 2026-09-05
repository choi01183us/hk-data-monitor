// data loader:設定喺 src/data/_lib/indicators.js
import { loadCenstatdIndicator } from "./_lib/indicators.js";
import { loadIndicator } from "./_lib/snapshot.js";

const indicator = await loadIndicator("unemployment", () => loadCenstatdIndicator("unemployment"));
process.stdout.write(JSON.stringify(indicator));
