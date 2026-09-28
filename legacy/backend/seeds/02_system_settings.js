/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function(knex) {
  await knex.raw(`
    INSERT IGNORE INTO system_settings (id, logo_url, login_bg_color)
    VALUES (1, '/logo.svg', '#f3f4f6');
  `);
};
