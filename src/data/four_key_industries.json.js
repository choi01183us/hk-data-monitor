// data loader:設定喺 src/data/_lib/indicators.js
import { loadCenstatdIndicator } from "./_lib/indicators.js";
import { loadIndicator } from "./_lib/snapshot.js";

const indicator = await loadIndicator("four_key_industries", () => loadCenstatdIndicator("four_key_industries"));
process.stdout.write(JSON.stringify(indicator));
