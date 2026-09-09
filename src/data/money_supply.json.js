import { loadMoneyIndicator } from "./_lib/money.js";
import { loadIndicator } from "./_lib/snapshot.js";
const indicator = await loadIndicator("money_supply", () => loadMoneyIndicator("money_supply"));
process.stdout.write(JSON.stringify(indicator));
