export async function up(db) {
  if (!(await db.schema.hasColumn("system_settings", "favicon_url")))
    await db.schema.alterTable("system_settings", (table) => {
      table.string("favicon_url", 255).notNullable().defaultTo("/mandiri.svg");
    });
}
export async function down(db) {
  await db.schema.alterTable("system_settings", (table) => {
    table.dropColumn("favicon_url");
  });
}
