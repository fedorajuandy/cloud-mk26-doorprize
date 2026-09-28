import "dotenv/config";
import { fileURLToPath } from "node:url";
export function databaseConfig() {
  const storage =
    process.env.DB_CLIENT === "sqlite"
      ? {
          client: "better-sqlite3",
          connection: { filename: process.env.DB_FILE || "./admin.sqlite" },
          useNullAsDefault: true,
          pool: {
            min: 1,
            max: 1,
            afterCreate(connection, done) {
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
        };
  return {
    ...storage,
    migrations: {
      directory: fileURLToPath(new URL("../migrations", import.meta.url)),
      tableName: "cms_migrations",
      loadExtensions: [".js"],
    },
    seeds: {
      directory: fileURLToPath(new URL("../seeds", import.meta.url)),
      loadExtensions: [".js"],
    },
  };
}
