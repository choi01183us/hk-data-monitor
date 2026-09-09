import { loadPropertyIndicator } from "./_lib/property.js";
import { loadIndicator } from "./_lib/snapshot.js";

const indicator = await loadIndicator("private_domestic_price", () => loadPropertyIndicator("private_domestic_price"));
process.stdout.write(JSON.stringify(indicator));
