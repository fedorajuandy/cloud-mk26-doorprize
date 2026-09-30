export async function up(db) {
  for (const [name, length] of [
    ["line", 255],
    ["status", 100],
    ["registered_at", 24],
    ["verified_at", 24],
  ]) {
    if (!(await db.schema.hasColumn("participants", name)))
      await db.schema.alterTable("participants", (table) =>
        table.string(name, length).nullable().defaultTo(null),
      );
  }
  // UTC timestamps are stored as canonical ISO strings for consistent driver behavior.
  const names =
    db.client.config.client === "mysql2"
      ? await db("information_schema.statistics")
          .whereRaw("TABLE_SCHEMA = DATABASE()")
          .where("TABLE_NAME", "participants")
          .pluck("INDEX_NAME")
      : await db("sqlite_master")
          .where({ type: "index", tbl_name: "participants" })
          .pluck("name");
  for (const field of ["line", "status"]) {
    const name = `idx_participants_${field}_page`;
    if (!names.includes(name))
      await db.schema.alterTable("participants", (table) =>
        table.index(["deleted_at", field, "id"], name),
      );
  }
}
export async function down(db) {
  await db.schema.alterTable("participants", (table) => {
    for (const field of ["line", "status"])
      table.dropIndex([], `idx_participants_${field}_page`);
    for (const field of ["line", "status", "registered_at", "verified_at"])
      table.dropColumn(field);
  });
}
