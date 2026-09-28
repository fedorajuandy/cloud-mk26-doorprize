import { db } from "../src/server/db";
import { seed } from "../database/seed";
import * as initial from "../database/migrations/001_schema";
const database = db();
try {
  if (process.argv[2] === "migrate") {
    await database.migrate.latest({
      migrationSource: {
        getMigrations: async () => ["001_schema"],
        getMigrationName: (name) => String(name),
        getMigration: async () => initial,
      },
    });
    console.log("Migrations complete.");
  } else if (process.argv[2] === "seed") {
    await seed(database);
    console.log("Seed complete. Existing users and passwords preserved.");
  } else throw new Error("Use migrate or seed.");
} finally {
  await database.destroy();
}
