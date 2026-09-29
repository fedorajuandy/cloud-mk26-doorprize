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
  } else if (process.argv[2] === "purge-participants") {
    if (!process.argv.includes("--confirm=DELETE ALL PARTICIPANTS"))
      throw new Error(
        'Pass --confirm="DELETE ALL PARTICIPANTS" to permanently delete every participant.',
      );
    const { deleteAllParticipants } =
      await import("../src/server/participants/purge.js");
    console.log(
      `Permanently deleted ${await deleteAllParticipants(database)} participants.`,
    );
  } else if (process.argv[2] === "seed-dummy") {
    const { seedDummyParticipants } =
      await import("../seeds/dummy_participants.js");
    const count = await seedDummyParticipants(database);
    console.log(
      `Added ${count} dummy participants. Existing records preserved.`,
    );
  } else
    throw new Error("Use migrate, seed, seed-dummy, or purge-participants.");
} finally {
  await database.destroy();
}
