import { randomUUID } from "node:crypto";
const indexName = "idx_participants_unique_id";
export async function up(db) {
  if (!(await db.schema.hasColumn("participants", "unique_id")))
    await db.schema.alterTable("participants", (table) =>
      table.string("unique_id", 255).nullable(),
    );
  // Bound memory and SQL parameter counts while preserving any supplied IDs.
  while (true) {
    const rows = await db("participants")
      .select("id")
      .whereNull("unique_id")
      .orderBy("id")
      .limit(100);
    if (!rows.length) break;
    const bindings = rows.flatMap(({ id }) => [id, randomUUID()]);
    await db("participants")
      .whereIn(
        "id",
        rows.map(({ id }) => id),
      )
      .whereNull("unique_id")
      .update({
        unique_id: db.raw(
          `CASE id ${rows.map(() => "WHEN ? THEN ?").join(" ")} END`,
          bindings,
        ),
      });
  }
  await db.schema.alterTable("participants", (table) =>
    table.string("unique_id", 255).notNullable().alter(),
  );
  const indexes =
    db.client.config.client === "mysql2"
      ? await db("information_schema.statistics")
          .whereRaw("TABLE_SCHEMA = DATABASE()")
          .where("TABLE_NAME", "participants")
          .pluck("INDEX_NAME")
      : await db("sqlite_master")
          .where({ type: "index", tbl_name: "participants" })
          .pluck("name");
  if (!indexes.includes(indexName))
    await db.schema.alterTable("participants", (table) =>
      table.unique(["unique_id"], indexName),
    );
}
export async function down(db) {
  await db.schema.alterTable("participants", (table) => {
    table.dropUnique(["unique_id"], indexName);
    table.dropColumn("unique_id");
  });
}
