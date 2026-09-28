import knex from "knex";
import mysql from "mysql2/promise";
import { randomBytes } from "node:crypto";
import { databaseConfig } from "../../config/database.js";
export async function testDatabase() {
  const config = databaseConfig();
  let admin, name;
  if (process.env.MYSQL_TEST === "1") {
    name = `mk26_test_${randomBytes(8).toString("hex")}`;
    admin = await mysql.createConnection({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
    await admin.query(
      `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    config.client = "mysql2";
    config.connection = {
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: name,
    };
    config.pool = { min: 0, max: 4 };
  } else {
    config.client = "better-sqlite3";
    config.connection = { filename: ":memory:" };
    config.useNullAsDefault = true;
    config.pool = {
      min: 1,
      max: 1,
      afterCreate(connection, done) {
        connection.pragma("foreign_keys = ON");
        done(null, connection);
      },
    };
  }
  const db = knex(config);
  return {
    db,
    async close() {
      await db.destroy();
      if (admin) {
        await admin.query(`DROP DATABASE \`${name}\``);
        await admin.end();
      }
    },
  };
}
