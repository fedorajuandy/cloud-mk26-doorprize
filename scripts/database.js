import { db } from "../src/server/db.js";
import { seed } from "../seeds/001_admin.js";
const database = db();
try {
  if (process.argv[2] === "migrate") {
    const [, applied] = await database.migrate.latest();
    console.log(
      applied.length
        ? `Migrations complete: ${applied.join(", ")}`
        : "Database is up to date.",
    );
  } else if (process.argv[2] === "seed") {
    await seed(database);
    console.log("Seed complete. Existing users and passwords preserved.");
  } else throw new Error("Use migrate or seed.");
} finally {
  await database.destroy();
}
