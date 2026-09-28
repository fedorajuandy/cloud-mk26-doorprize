import type { Knex } from "knex";
function audit(t: Knex.CreateTableBuilder, db: Knex) {
  t.dateTime("created_at").notNullable().defaultTo(db.fn.now());
  t.integer("created_by").unsigned().nullable();
  t.dateTime("updated_at").nullable();
  t.integer("updated_by").unsigned().nullable();
  t.dateTime("deleted_at").nullable();
  t.integer("deleted_by").unsigned().nullable();
}
export async function up(db: Knex) {
  await db.schema.createTable("roles", (t) => {
    t.increments("id");
    t.string("role_name", 50).notNullable().unique();
    audit(t, db);
    t.index("deleted_at", "idx_roles_deleted_at");
  });
  await db.schema.createTable("permissions", (t) => {
    t.increments("id");
    t.string("permission_name", 100).notNullable().unique();
    audit(t, db);
    t.index("deleted_at", "idx_permissions_deleted_at");
  });
  await db.schema.createTable("users", (t) => {
    t.increments("id");
    t.string("username", 50).notNullable().unique();
    t.string("password", 255).notNullable();
    t.integer("role_id").unsigned().defaultTo(2).references("roles.id");
    audit(t, db);
    t.index("role_id", "idx_users_role_id");
    t.index("deleted_at", "idx_users_deleted_at");
  });
  await db.schema.createTable("role_permissions", (t) => {
    t.integer("role_id").unsigned().notNullable().references("roles.id");
    t.integer("permission_id")
      .unsigned()
      .notNullable()
      .references("permissions.id");
    t.primary(["role_id", "permission_id"]);
    audit(t, db);
    t.index("permission_id", "idx_role_permissions_permission_id");
    t.index("deleted_at", "idx_role_permissions_deleted_at");
  });
  for (const name of ["roles", "permissions", "users", "role_permissions"]) {
    await db.schema.alterTable(name, (t) => {
      for (const field of ["created_by", "updated_by", "deleted_by"])
        t.foreign(field).references("users.id");
    });
  }
  await db.schema.createTable("participants", (t) => {
    t.bigIncrements("id");
    t.string("full_name", 255).notNullable();
    t.string("no_hp", 20).nullable().defaultTo(null);
    t.string("unit_kerja", 255).notNullable();
    t.string("nip", 255).notNullable();
    t.text("prize").nullable().defaultTo(null);
    t.integer("babak").unsigned().nullable().defaultTo(null);
    t.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    t.timestamp("updated_at").nullable();
    t.timestamp("deleted_at").nullable();
    t.index("created_at", "idx_user_data_created_at");
  });
  await db.schema.createTable("system_settings", (t) => {
    t.increments("id");
    t.string("logo_url", 255).notNullable().defaultTo("/abracodebra.svg");
    t.string("login_bg_color", 50).notNullable().defaultTo("#f3f4f6");
    t.dateTime("updated_at").nullable();
  });
  if (db.client.config.client === "mysql2")
    await db.raw(
      "ALTER TABLE system_settings MODIFY updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP",
    );
}
export async function down(db: Knex) {
  for (const name of ["role_permissions", "users", "permissions", "roles"])
    await db.schema.alterTable(name, (t) => {
      for (const field of ["created_by", "updated_by", "deleted_by"])
        t.dropForeign(field);
    });
  for (const name of [
    "system_settings",
    "participants",
    "role_permissions",
    "users",
    "permissions",
    "roles",
  ])
    await db.schema.dropTable(name);
}
