const indexes = [
  ["idx_participants_status_session_id", ["deleted_at", "sesi", "id"]],
  [
    "idx_participants_status_session_round_id",
    ["deleted_at", "sesi", "babak", "id"],
  ],
];
export async function up(db) {
  if (!(await db.schema.hasColumn("participants", "sesi")))
    await db.schema.alterTable("participants", (table) => {
      table.integer("sesi").unsigned().nullable().defaultTo(null);
    });
  const existing = new Set(
    db.client.config.client === "mysql2"
      ? await db("information_schema.statistics")
          .whereRaw("TABLE_SCHEMA = DATABASE()")
          .where("TABLE_NAME", "participants")
          .pluck("INDEX_NAME")
      : await db("sqlite_master")
          .where({ type: "index", tbl_name: "participants" })
          .pluck("name"),
  );
  for (const [name, columns] of indexes)
    if (!existing.has(name))
      await db.schema.alterTable("participants", (table) =>
        table.index(columns, name),
      );
}
export async function down(db) {
  await db.schema.alterTable("participants", (table) => {
    for (const [name] of indexes) table.dropIndex([], name);
    table.dropColumn("sesi");
  });
}
