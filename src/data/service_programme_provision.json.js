import {loadIndicator} from "./_lib/snapshot.js";
import {loadServiceProgrammeIndicator} from "./_lib/service-budget.js";
const indicator = await loadIndicator("service_programme_provision", () => loadServiceProgrammeIndicator("service_programme_provision"));
process.stdout.write(JSON.stringify(indicator));
