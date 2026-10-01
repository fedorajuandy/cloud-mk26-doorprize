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
    assert.equal(applied.length, 11);
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
      unique_id: "preserve-id",
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

test("sesi migration preserves existing participants and creates session indexes", async () => {
  const fixture = await testDatabase(),
    { db } = fixture;
  try {
    await up(db);
    await db("participants").insert({
      full_name: "Before sesi",
      nip: "S001",
      unit_kerja: "Finance",
      prize: "Laptop",
      babak: 2,
    });
    const before = await db("participants").first();
    const { up: addSesi } =
      await import("../migrations/004_participant_sesi.js");
    await addSesi(db);
    assert.deepEqual(await db("participants").first(), {
      ...before,
      sesi: null,
    });
    await db("participants").update({ sesi: 3 });
    await addSesi(db);
    assert.equal((await db("participants").first()).sesi, 3);
    const indexes =
      db.client.config.client === "mysql2"
        ? await db("information_schema.statistics")
            .whereRaw("TABLE_SCHEMA = DATABASE()")
            .where("TABLE_NAME", "participants")
            .pluck("INDEX_NAME")
        : await db("sqlite_master")
            .where({ type: "index", tbl_name: "participants" })
            .pluck("name");
    assert.ok(indexes.includes("idx_participants_status_session_id"));
    assert.ok(indexes.includes("idx_participants_status_session_round_id"));
  } finally {
    await fixture.close();
  }
});

test("contact migration preserves old data, defaults to null and is safe to rerun", async () => {
  const fixture = await testDatabase(),
    { db } = fixture;
  try {
    await up(db);
    await db("participants").insert({
      full_name: "Existing",
      nip: "001",
      unit_kerja: "Finance",
    });
    const before = await db("participants").first();
    const { up: addContact } =
      await import("../migrations/005_participant_contact.js");
    await addContact(db);
    assert.deepEqual(await db("participants").first(), {
      ...before,
      email: null,
      profile_picture: null,
    });
    await db("participants").update({
      email: "existing@example.com",
      profile_picture: "/mandiri.svg",
    });
    await addContact(db);
    assert.equal(
      (await db("participants").first()).email,
      "existing@example.com",
    );
  } finally {
    await fixture.close();
  }
});

test("unique ID migration backfills UUIDs, preserves records and enforces uniqueness", async () => {
  const fixture = await testDatabase(),
    { db } = fixture;
  try {
    await up(db);
    await db("participants").insert({
      full_name: "Legacy",
      nip: "001",
      unit_kerja: "Finance",
    });
    const before = await db("participants").first();
    const { up: addUniqueId } =
      await import("../migrations/006_participant_unique_id.js");
    await addUniqueId(db);
    const after = await db("participants").first();
    assert.match(
      after.unique_id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const { unique_id, ...rest } = after;
    assert.deepEqual(rest, before);
    await addUniqueId(db);
    assert.equal((await db("participants").first()).unique_id, unique_id);
    await assert.rejects(() =>
      db("participants").insert({
        full_name: "Duplicate",
        nip: "002",
        unit_kerja: "Finance",
        unique_id,
      }),
    );
    await assert.rejects(() =>
      db("participants").insert({
        full_name: "Null",
        nip: "003",
        unit_kerja: "Finance",
        unique_id: null,
      }),
    );
  } finally {
    await fixture.close();
  }
});

test("registration fields migrate existing records without replacing audit timestamps", async () => {
  const fixture = await testDatabase(),
    { db } = fixture;
  try {
    await up(db);
    await db("participants").insert({
      full_name: "Existing",
      nip: "001",
      unit_kerja: "Finance",
    });
    const before = await db("participants").first();
    const { up: addRegistration } =
      await import("../migrations/009_participant_registration.js");
    await addRegistration(db);
    assert.deepEqual(await db("participants").first(), {
      ...before,
      line: null,
      status: null,
      registered_at: null,
      verified_at: null,
    });
    await db("participants").update({ line: "A", status: "Verified" });
    await addRegistration(db);
    assert.equal((await db("participants").first()).status, "Verified");
  } finally {
    await fixture.close();
  }
});
