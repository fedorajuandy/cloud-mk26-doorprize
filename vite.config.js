import "dotenv/config";
import { defineConfig } from "vite";
import { solidStart } from "@solidjs/start/config";
import { nitro } from "nitro/vite";
export default defineConfig({
  plugins: [solidStart({ devOverlay: false }), nitro()],
  server: { port: Number(process.env.PORT || 6229), strictPort: true },
  environments: {
    nitro: {
      build: {
        rolldownOptions: {
          external: ["knex", "mysql2", "better-sqlite3", "pdfkit"],
        },
      },
    },
  },
  nitro: {
    preset: "node-server",
    traceDeps: ["knex", "mysql2", "better-sqlite3", "pdfkit"],
  },
});
