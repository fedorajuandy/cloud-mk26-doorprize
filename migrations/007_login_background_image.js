export async function up(db) {
  if (!(await db.schema.hasColumn("system_settings", "login_bg_image")))
    await db.schema.alterTable("system_settings", (table) =>
      table.string("login_bg_image", 2048).nullable().defaultTo(null),
    );
}
export async function down(db) {
  await db.schema.alterTable("system_settings", (table) =>
    table.dropColumn("login_bg_image"),
  );
}
