/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // ==========================================
  // 1. MASTER TABLES (Without User FKs initially)
  // ==========================================
  await knex.schema.createTable('roles', (table) => {
    table.increments('id').primary();
    table.string('role_name', 50).notNullable().unique();

    table.datetime('created_at').defaultTo(knex.fn.now()).notNullable();
    table.integer('created_by').unsigned().nullable();
    table.datetime('updated_at').nullable();
    table.integer('updated_by').unsigned().nullable();
    table.datetime('deleted_at').nullable();
    table.integer('deleted_by').unsigned().nullable();

    table.index('deleted_at', 'idx_roles_deleted_at');
  });

  await knex.schema.createTable('permissions', (table) => {
    table.increments('id').primary();
    table.string('permission_name', 100).notNullable().unique();

    table.datetime('created_at').defaultTo(knex.fn.now()).notNullable();
    table.integer('created_by').unsigned().nullable();
    table.datetime('updated_at').nullable();
    table.integer('updated_by').unsigned().nullable();
    table.datetime('deleted_at').nullable();
    table.integer('deleted_by').unsigned().nullable();

    table.index('deleted_at', 'idx_permissions_deleted_at');
  });

  // ==========================================
  // 2. USERS TABLE
  // ==========================================
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('username', 50).notNullable().unique();
    table.string('password', 255).notNullable();
    table.integer('role_id').unsigned().references('id').inTable('roles').defaultTo(2);

    table.datetime('created_at').defaultTo(knex.fn.now()).notNullable();
    table.integer('created_by').unsigned().references('id').inTable('users').nullable(); // Self-referencing
    table.datetime('updated_at').nullable();
    table.integer('updated_by').unsigned().references('id').inTable('users').nullable();
    table.datetime('deleted_at').nullable();
    table.integer('deleted_by').unsigned().references('id').inTable('users').nullable();

    table.index('role_id', 'idx_users_role_id');
    table.index('deleted_at', 'idx_users_deleted_at');
  });

  // ==========================================
  // 3. RESOLVE CIRCULAR DEPENDENCIES
  // ==========================================
  await knex.schema.alterTable('roles', (table) => {
    table.foreign('created_by').references('id').inTable('users');
    table.foreign('updated_by').references('id').inTable('users');
    table.foreign('deleted_by').references('id').inTable('users');
  });

  await knex.schema.alterTable('permissions', (table) => {
    table.foreign('created_by').references('id').inTable('users');
    table.foreign('updated_by').references('id').inTable('users');
    table.foreign('deleted_by').references('id').inTable('users');
  });

  // ==========================================
  // 4. ROLE PERMISSIONS TABLE
  // ==========================================
  await knex.schema.createTable('role_permissions', (table) => {
    table.integer('role_id').unsigned().notNullable().references('id').inTable('roles');
    table.integer('permission_id').unsigned().notNullable().references('id').inTable('permissions');

    // Composite Primary Key
    table.primary(['role_id', 'permission_id']);

    table.datetime('created_at').defaultTo(knex.fn.now()).notNullable();
    table.integer('created_by').unsigned().references('id').inTable('users').nullable();
    table.datetime('updated_at').nullable();
    table.integer('updated_by').unsigned().references('id').inTable('users').nullable();
    table.datetime('deleted_at').nullable();
    table.integer('deleted_by').unsigned().references('id').inTable('users').nullable();

    table.index('permission_id', 'idx_role_permissions_permission_id');
    table.index('deleted_at', 'idx_role_permissions_deleted_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  // 1. Drop the dynamically added foreign keys first to prevent lock errors
  await knex.schema.alterTable('roles', (table) => {
    table.dropForeign('created_by');
    table.dropForeign('updated_by');
    table.dropForeign('deleted_by');
  });

  await knex.schema.alterTable('permissions', (table) => {
    table.dropForeign('created_by');
    table.dropForeign('updated_by');
    table.dropForeign('deleted_by');
  });

  // 2. Drop tables in exact reverse order of dependencies
  await knex.schema.dropTableIfExists('role_permissions');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('permissions');
  await knex.schema.dropTableIfExists('roles');
};
