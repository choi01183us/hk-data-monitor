import { loadCenstatdIndicator } from "./_lib/indicators.js";
import { loadIndicator } from "./_lib/snapshot.js";

const indicator = await loadIndicator("cpi_components", () => loadCenstatdIndicator("cpi_components"));
process.stdout.write(JSON.stringify(indicator));
