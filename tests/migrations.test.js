import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./helpers/database.js";
import { up } from "../migrations/001_schema.js";
import { seed } from "../seeds/001_admin.js";

test("adopts existing admin tables without replaying unrelated migration history", async () => {
  const fixture = await testDatabase(),
    { db } = fixture;
  try {
    await up(db);
    process.env.ADMIN_USERNAME = "existingadmin";
    process.env.ADMIN_PASSWORD = "Existing-password-123";
    await seed(db);
    await db("system_settings").update({ logo_url: "/existing-logo.svg" });
    const before = await db("users").first();
    const grants = await db("role_permissions").orderBy("permission_id");
    delete process.env.ADMIN_PASSWORD;
    await seed(db);
    assert.deepEqual(await db("users").first(), before);
    assert.deepEqual(
      await db("role_permissions").orderBy("permission_id"),
      grants,
    );
    await db.schema.dropTable("participants");
    await db.schema.createTable("knex_migrations", (t) => {
      t.increments("id");
      t.string("name");
      t.integer("batch");
      t.timestamp("migration_time");
    });
    await db("knex_migrations").insert({
      name: "20260101000000_previous_admin.js",
      batch: 1,
    });
    const history = await db("knex_migrations");
    const [, applied] = await db.migrate.latest();
    assert.equal(applied.length, 2);
    assert.ok(await db.schema.hasTable("participants"));
    assert.deepEqual(await db("users").first(), before);
    assert.deepEqual(
      await db("role_permissions").orderBy("permission_id"),
      grants,
    );
    assert.equal(
      (await db("system_settings").first()).logo_url,
      "/existing-logo.svg",
    );
    assert.deepEqual(await db("knex_migrations"), history);
    await db("participants").insert({
      full_name: "Preserve",
      nip: "0001",
      unit_kerja: "Finance",
    });
    assert.deepEqual((await db.migrate.latest())[1], []);
    assert.equal((await db("participants").first()).nip, "0001");
  } finally {
    await fixture.close();
  }
});

test("adopts an already-complete schema without resetting records", async () => {
  const fixture = await testDatabase(),
    { db } = fixture;
  try {
    await up(db);
    await db("participants").insert({
      full_name: "Existing participant",
      nip: "001",
      unit_kerja: "Operations",
    });
    await db.migrate.latest();
    assert.equal(
      (await db("participants").first()).full_name,
      "Existing participant",
    );
  } finally {
    await fixture.close();
  }
});

test("rejects incompatible existing tables before creating application tables", async () => {
  const fixture = await testDatabase(),
    { db } = fixture;
  try {
    await db.schema.createTable("roles", (t) => {
      t.increments("id");
      t.string("role_name");
    });
    await assert.rejects(
      () => db.migrate.latest(),
      /Cannot adopt roles: missing columns/,
    );
    assert.equal(await db.schema.hasTable("users"), false);
    assert.equal(await db.schema.hasTable("participants"), false);
  } finally {
    await fixture.close();
  }
});
