// data loader:設定喺 src/data/_lib/indicators.js
import { loadCenstatdIndicator } from "./_lib/indicators.js";
import { loadIndicator } from "./_lib/snapshot.js";

const indicator = await loadIndicator("district_household_income", () => loadCenstatdIndicator("district_household_income"));
process.stdout.write(JSON.stringify(indicator));
