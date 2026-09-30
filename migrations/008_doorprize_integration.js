export async function up(db) {
  await db.schema.createTable("doorprize_integration", (t) => {
    t.integer("id").primary();
    t.boolean("enabled").notNullable().defaultTo(false);
    t.string("source_origin", 255).nullable();
    t.string("import_mode", 20).notNullable().defaultTo("link");
    t.string("claim_location", 160).notNullable().defaultTo("Meja Doorprize");
    t.string("description", 300).notNullable().defaultTo("");
    t.string("image_url", 255).nullable();
    t.string("claim_deadline", 50).nullable();
    t.string("import_status", 20).notNullable().defaultTo("idle");
    t.bigInteger("import_after").notNullable().defaultTo(0);
    t.bigInteger("import_through").nullable();
    t.integer("import_linked").notNullable().defaultTo(0);
    t.integer("import_created").notNullable().defaultTo(0);
    t.integer("import_skipped").notNullable().defaultTo(0);
    t.text("import_error").nullable();
    t.integer("import_attempts").notNullable().defaultTo(0);
    t.string("connection_status", 255).notNullable().defaultTo("Not tested");
    t.boolean("test_requested").notNullable().defaultTo(false);
    t.bigInteger("lease_until").notNullable().defaultTo(0);
    t.string("lease_owner", 36).nullable();
    t.bigInteger("next_request_at").notNullable().defaultTo(0);
    t.bigInteger("heartbeat_at").nullable();
  });
  await db("doorprize_integration").insert({ id: 1 });
  await db.schema.createTable("doorprize_import_issues", (t) => {
    t.increments("id");
    t.bigInteger("source_id").notNullable();
    t.string("nip", 255).notNullable();
    t.string("reason", 255).notNullable();
  });
  await db.schema.createTable("doorprize_links", (t) => {
    t.bigInteger("participant_id").primary();
    t.bigInteger("source_id").notNullable().unique();
    t.string("source_nip", 255).notNullable();
    t.text("last_prize").nullable();
  });
  // Immutable delivery snapshots deliberately survive participant deletion/reset.
  await db.schema.createTable("doorprize_outbox", (t) => {
    t.increments("id");
    t.string("batch_id", 64).notNullable().unique();
    t.bigInteger("participant_id").notNullable();
    t.integer("participant_count").notNullable().defaultTo(1);
    t.text("payload", "longtext").notNullable();
    t.string("status", 20).notNullable().defaultTo("pending");
    t.integer("attempts").notNullable().defaultTo(0);
    t.bigInteger("next_attempt_at").notNullable().defaultTo(0);
    t.string("last_error", 255).nullable();
    t.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    t.timestamp("sent_at").nullable();
    t.index(["status", "next_attempt_at", "id"], "idx_doorprize_delivery");
  });
}
export async function down(db) {
  await db.schema.dropTable("doorprize_outbox");
  await db.schema.dropTable("doorprize_links");
  await db.schema.dropTable("doorprize_import_issues");
  await db.schema.dropTable("doorprize_integration");
}
