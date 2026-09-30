const indexes = [
  ["idx_participants_valid_page", ["deleted_at", "is_invalid", "id"]],
  ["idx_participants_valid_round", ["deleted_at", "is_invalid", "babak", "id"]],
  [
    "idx_participants_valid_session_round",
    ["deleted_at", "is_invalid", "sesi", "babak", "id"],
  ],
];
export async function up(db) {
  if (!(await db.schema.hasColumn("participants", "is_invalid")))
    await db.schema.alterTable("participants", (table) => {
      table.boolean("is_invalid").notNullable().defaultTo(false);
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
    table.dropColumn("is_invalid");
  });
}
