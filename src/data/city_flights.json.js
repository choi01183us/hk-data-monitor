import { loadCitySnapshot } from "./_lib/city-feeds.js";
process.stdout.write(JSON.stringify(await loadCitySnapshot("flights")));
