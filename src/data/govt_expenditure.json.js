// data loader:設定喺 src/data/_lib/indicators.js(FISCAL_INDICATORS)
import { loadFiscalIndicator } from "./_lib/indicators.js";
import { loadIndicator } from "./_lib/snapshot.js";

const indicator = await loadIndicator("govt_expenditure", () => loadFiscalIndicator("govt_expenditure"));
process.stdout.write(JSON.stringify(indicator));
