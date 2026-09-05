// data loader:設定喺 src/data/_lib/indicators.js
import { loadCenstatdIndicator } from "./_lib/indicators.js";
import { loadIndicator } from "./_lib/snapshot.js";

const indicator = await loadIndicator("household_income", () => loadCenstatdIndicator("household_income"));
process.stdout.write(JSON.stringify(indicator));
