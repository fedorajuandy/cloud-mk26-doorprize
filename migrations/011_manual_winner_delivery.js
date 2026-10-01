export async function up(db) {
  await db.schema.alterTable("doorprize_outbox", (table) => {
    table.boolean("manual_delivery").notNullable().defaultTo(false);
    table.index(
      ["status", "manual_delivery", "next_attempt_at", "id"],
      "idx_doorprize_manual_delivery",
    );
  });
}
export async function down(db) {
  await db.schema.alterTable("doorprize_outbox", (table) => {
    table.dropIndex([], "idx_doorprize_manual_delivery");
    table.dropColumn("manual_delivery");
  });
}
