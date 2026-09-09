import { loadPropertyIndicator } from "./_lib/property.js";
import { loadIndicator } from "./_lib/snapshot.js";

const indicator = await loadIndicator("private_domestic_rent", () => loadPropertyIndicator("private_domestic_rent"));
process.stdout.write(JSON.stringify(indicator));
