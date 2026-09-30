import { setTimeout } from "node:timers/promises";
import { db } from "../src/server/db.js";
import { workerStep } from "../src/server/integration/worker.js";
const database = db();
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopping = true;
  });
try {
  do {
    try {
      await workerStep(database);
    } catch {
      console.error(
        "Integration worker database operation failed; retrying. Check migrations and database connectivity.",
      );
    }
    if (process.argv.includes("--once")) break;
    if (!stopping) await setTimeout(1200);
  } while (!stopping);
} finally {
  await database.destroy();
}
