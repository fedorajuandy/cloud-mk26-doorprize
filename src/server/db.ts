import "dotenv/config";
import knex, { type Knex } from "knex";
export function createDatabase(): Knex {
  const sqlite = process.env.DB_CLIENT === "sqlite";
  return knex(
    sqlite
      ? {
          client: "better-sqlite3",
          connection: { filename: process.env.DB_FILE || "./admin.sqlite" },
          useNullAsDefault: true,
          pool: {
            min: 1,
            max: 1,
            afterCreate(connection: any, done: any) {
              connection.pragma("foreign_keys = ON");
              done(null, connection);
            },
          },
        }
      : {
          client: "mysql2",
          connection: {
            host: process.env.DB_HOST || "127.0.0.1",
            port: Number(process.env.DB_PORT || 3306),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            supportBigNumbers: true,
            bigNumberStrings: true,
          },
          pool: { min: 0, max: 10 },
        },
  );
}
let database: Knex | undefined;
export const db = () => (database ??= createDatabase());
