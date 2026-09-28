export async function up(db) {
  // Supports active/archive pages and round filters without scanning every row.
  const indexes = [
    ["idx_participants_status_id", ["deleted_at", "id"]],
    ["idx_participants_status_round_id", ["deleted_at", "babak", "id"]],
  ];
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
  for (const [name, columns] of indexes) {
    if (!existing.has(name)) {
      await db.schema.alterTable("participants", (table) =>
        table.index(columns, name),
      );
    }
  }
}
export async function down(db) {
  await db.schema.alterTable("participants", (table) => {
    table.dropIndex([], "idx_participants_status_id");
    table.dropIndex([], "idx_participants_status_round_id");
  });
}
