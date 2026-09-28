/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('system_settings', function(table) {
    table.increments('id').unsigned().primary();
    table.string('logo_url', 255).notNullable().defaultTo('/abracodebra.svg');
    table.string('login_bg_color', 50).notNullable().defaultTo('#f3f4f6');
    // Using specificType to guarantee MySQL/MariaDB syntax for ON UPDATE
    table.specificType('updated_at', 'DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP');
  })
  .then(function() {
    // Automatically seed the default configuration row so your frontend API doesn't crash on empty fetch
    return knex('system_settings').insert({
      id: 1,
      logo_url: '/abracodebra.svg',
      login_bg_color: '#f3f4f6'
    });
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('system_settings');
};
