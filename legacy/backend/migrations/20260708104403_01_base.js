/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('wishes', (table) => {
    // Primary Key
    table.bigIncrements('id').primary();

    // Columns
    table.string('name', 255).nullable().defaultTo(null);
    table.text('wish').notNullable();

    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').nullable().defaultTo(null);
    table.timestamp('deleted_at').nullable().defaultTo(null);

    // Indexes
    table.index('created_at', 'idx_user_data_created_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('wishes');
};
