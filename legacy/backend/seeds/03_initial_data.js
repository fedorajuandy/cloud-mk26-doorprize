/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function(knex) {
  // Using INSERT IGNORE ensures that existing records are kept safe,
  // and only missing/new records from this file are inserted.

  await knex.raw(`
    INSERT IGNORE INTO \`roles\` (\`id\`, \`role_name\`, \`created_at\`, \`created_by\`, \`updated_at\`, \`updated_by\`, \`deleted_at\`, \`deleted_by\`) VALUES
    (1, 'Super Admin', '2026-08-11 19:22:08', NULL, NULL, NULL, NULL, NULL);
  `);

  await knex.raw(`
    INSERT IGNORE INTO \`roles\` (\`id\`, \`role_name\`, \`created_at\`, \`created_by\`, \`updated_at\`, \`updated_by\`, \`deleted_at\`, \`deleted_by\`) VALUES
    (2, 'Admin', '2026-08-11 19:22:08', NULL, NULL, NULL, NULL, NULL);
  `);

  await knex.raw(`
    INSERT IGNORE INTO \`users\` (\`id\`, \`username\`, \`password\`, \`role_id\`, \`created_at\`, \`created_by\`, \`updated_at\`, \`updated_by\`, \`deleted_at\`, \`deleted_by\`) VALUES
    (1, 'abracodebra', '$2b$10$hLlvKuJilEzIvbz1dlW/E.JhXOK9mbiuC2FQueBQGcwYMWLZFZKsC', 1, '2026-08-11 19:24:45', NULL, NULL, NULL, NULL, NULL);
  `);

  await knex.raw(`
    INSERT IGNORE INTO \`users\` (\`id\`, \`username\`, \`password\`, \`role_id\`, \`created_at\`, \`created_by\`, \`updated_at\`, \`updated_by\`, \`deleted_at\`, \`deleted_by\`) VALUES
    (2, 'admin', '$2b$10$$2a$10$SBHs5UHCRLMxv696eOeYJOIvTkKrlaYuOv2RnsxhOOBNCcrmxM.Fu', 2, '2026-08-11 19:24:45', NULL, NULL, NULL, NULL, NULL);
  `);

  // Roles now exist, so apply grants after bootstrapping, regardless of seed order.
  await require('../seed_helpers/permissions').seedPermissions(knex);
};
