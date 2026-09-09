// data loader:設定喺 src/data/_lib/indicators.js
import { loadCenstatdIndicator } from "./_lib/indicators.js";
import { loadIndicator } from "./_lib/snapshot.js";

const indicator = await loadIndicator("goods_imports", () => loadCenstatdIndicator("goods_imports"));
process.stdout.write(JSON.stringify(indicator));
