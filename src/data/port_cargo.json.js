// data loader:設定喺 src/data/_lib/indicators.js
import { loadCenstatdIndicator } from "./_lib/indicators.js";
import { loadIndicator } from "./_lib/snapshot.js";

const indicator = await loadIndicator("port_cargo", () => loadCenstatdIndicator("port_cargo"));
process.stdout.write(JSON.stringify(indicator));
