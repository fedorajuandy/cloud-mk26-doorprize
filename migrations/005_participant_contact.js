export async function up(db) {
  if (!(await db.schema.hasColumn("participants", "email")))
    await db.schema.alterTable("participants", (table) =>
      table.string("email", 255).nullable().defaultTo(null),
    );
  if (!(await db.schema.hasColumn("participants", "profile_picture")))
    await db.schema.alterTable("participants", (table) =>
      table.text("profile_picture").nullable().defaultTo(null),
    );
}
export async function down(db) {
  await db.schema.alterTable("participants", (table) => {
    table.dropColumn("email");
    table.dropColumn("profile_picture");
  });
}
