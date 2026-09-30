import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./helpers/database.js";
import { seed } from "../seeds/001_admin.js";
import { tokenFor } from "../src/server/auth.js";
import { handleApi } from "../src/server/api.js";
import { workerStep } from "../src/server/integration/worker.js";
process.env.JWT_SECRET =
  "integration-test-secret-more-than-thirty-two-characters";
process.env.ADMIN_PASSWORD = "Integration-password-123";
process.env.DOORPRIZE_SOURCE_URL = "https://source.example";
process.env.DOORPRIZE_SOURCE_TOKEN = "test-server-only-token";
let fixture, db, cookie, otherCookie;
before(async () => {
  fixture = await testDatabase();
  db = fixture.db;
  await db.migrate.latest();
  await seed(db);
  const admin = await db("users").first();
  cookie = `admin_session=${await tokenFor(admin)}`;
  const [id] = await db("users").insert({
    username: "operator",
    password: "unused",
    role_id: 2,
  });
  otherCookie = `admin_session=${await tokenFor({ id, password: "unused" })}`;
});
after(async () => {
  await fixture?.close();
});
beforeEach(async () => {
  for (const table of [
    "doorprize_outbox",
    "doorprize_links",
    "doorprize_import_issues",
    "participants",
    "doorprize_integration",
  ])
    await db(table).delete();
  await db("doorprize_integration").insert({ id: 1 });
  process.env.DOORPRIZE_SOURCE_URL = "https://source.example";
});
async function request(path, method = "GET", data, auth = cookie) {
  return handleApi(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { cookie: auth, "content-type": "application/json" },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
    db,
  );
}
const control = (action, data = {}) =>
  request(`/integration/doorprize/${action}`, "POST", data);
async function step(fetcher) {
  await db("doorprize_integration")
    .where({ id: 1 })
    .update({ next_request_at: 0 });
  return workerStep(db, fetcher);
}
async function participant(nip, extra = {}) {
  const [id] = await db("participants").insert({
    unique_id: randomUUID(),
    full_name: `Name ${nip}`,
    nip,
    unit_kerja: "Finance",
    ...extra,
  });
  return id;
}
async function linked() {
  const id = await participant("001");
  await db("doorprize_links").insert({
    participant_id: id,
    source_id: 123,
    source_nip: "001",
  });
  await db("doorprize_integration")
    .where({ id: 1 })
    .update({ enabled: true, source_origin: "https://source.example" });
  return id;
}
const success = (payload) =>
  Response.json({
    batchId: JSON.parse(payload).batchId,
    count: 1,
    replayed: false,
  });

test("integration controls are Super Admin only and never expose server token", async () => {
  assert.equal(
    (await request("/integration/doorprize", "GET", undefined, "")).status,
    401,
  );
  assert.equal(
    (await request("/integration/doorprize", "GET", undefined, otherCookie))
      .status,
    403,
  );
  const status = await (await request("/integration/doorprize")).json();
  assert.equal(status.data.configured, true);
  assert.equal(status.data.worker_online, false);
  assert.ok(
    !JSON.stringify(status).includes(process.env.DOORPRIZE_SOURCE_TOKEN),
  );
  assert.equal((await control("test")).status, 202);
  let called = false;
  await step(async (url, options) => {
    called = true;
    assert.equal(url.origin, "https://source.example");
    assert.equal(
      options.headers.Authorization,
      "Bearer test-server-only-token",
    );
    assert.equal(options.redirect, "error");
    assert.equal(url.searchParams.get("limit"), "1");
    return Response.json({ rows: [], through: 0, nextAfter: null });
  });
  assert.equal(called, true);
  assert.equal(
    (await db("doorprize_integration").first()).connection_status,
    "Connected",
  );
  process.env.DOORPRIZE_SOURCE_URL = "https://other.example";
  assert.equal((await control("sync")).status, 409);
});

test("cursor sync links by exact NIP, creates placeholders and preserves existing winners", async () => {
  const id = await participant("001", { prize: "Existing prize", sesi: 2 });
  await participant("DUP");
  await participant("DUP");
  await db("doorprize_integration").update({ import_mode: "create" });
  assert.equal((await control("sync")).status, 202);
  await step(async (url) => {
    assert.equal(url.searchParams.get("after"), "0");
    assert.equal(url.searchParams.has("through"), false);
    return Response.json({
      rows: [
        { id: 1, nip: "001" },
        { id: 2, nip: "NEW" },
      ],
      through: 4,
      nextAfter: 2,
    });
  });
  await step(async (url) => {
    assert.equal(url.searchParams.get("after"), "2");
    assert.equal(url.searchParams.get("through"), "4");
    return Response.json({
      rows: [
        { id: 3, nip: "DUP" },
        { id: 4, nip: "NEW" },
      ],
      through: 4,
      nextAfter: null,
    });
  });
  const config = await db("doorprize_integration").first();
  assert.equal(config.import_status, "complete");
  assert.equal(config.import_created, 1);
  assert.equal(config.import_linked, 1);
  assert.equal(config.import_skipped, 2);
  assert.equal((await db("doorprize_import_issues")).length, 2);
  const old = await db("participants").where({ id }).first();
  assert.equal(old.full_name, "Name 001");
  assert.equal(old.prize, "Existing prize");
  assert.equal(
    (await db("participants").where({ nip: "NEW" }).first()).unit_kerja,
    "Not provided",
  );
  await control("sync");
  await step(async () =>
    Response.json({
      rows: [
        { id: 1, nip: "001" },
        { id: 2, nip: "NEW" },
      ],
      through: 2,
      nextAfter: null,
    }),
  );
  assert.equal((await db("participants")).length, 4);
  assert.equal((await db("doorprize_links")).length, 2);
});

test("link-only sync skips missing records and rejects corrupt page without partial writes", async () => {
  await control("sync");
  await step(async () =>
    Response.json({
      rows: [{ id: 1, nip: "NEW" }],
      through: 1,
      nextAfter: null,
    }),
  );
  assert.equal((await db("participants")).length, 0);
  assert.equal((await db("doorprize_integration").first()).import_skipped, 1);
  await db("doorprize_integration").update({ import_mode: "create" });
  await control("sync");
  await step(async () =>
    Response.json({
      rows: [
        { id: 1, nip: "ONE" },
        { id: 1, nip: "TWO" },
      ],
      through: 1,
      nextAfter: null,
    }),
  );
  assert.equal((await db("participants")).length, 0);
  assert.equal(
    (await db("doorprize_integration").first()).import_status,
    "failed",
  );
});

test("single and batch winner writes queue atomically, send correct identity, and deduplicate repeats", async () => {
  const id = await linked();
  let response = await request(`/participants/${id}`, "PATCH", {
    prize: "Laptop",
    sesi: 1,
    babak: 2,
  });
  assert.equal(response.status, 200);
  const event = await db("doorprize_outbox").first();
  const payload = JSON.parse(event.payload);
  assert.equal(payload.winners[0].participantId, 123);
  assert.equal(payload.winners[0].nip, "001");
  assert.equal(payload.winners[0].prizeName, "Laptop");
  assert.match(payload.winners[0].description, /Sesi 1 · Babak 2/);
  response = await request("/participants/batch", "PATCH", {
    updates: [{ id, prize: "Laptop", babak: 3 }],
  });
  assert.equal(response.status, 200);
  assert.equal((await db("doorprize_outbox")).length, 1);
  const second = await participant("002");
  response = await request("/participants/batch", "PATCH", {
    updates: [
      { id: second, prize: "Other" },
      { id, prize: "Changed" },
    ],
  });
  assert.equal(response.status, 409);
  assert.equal(
    (await db("participants").where({ id: second }).first()).prize,
    null,
  );
  await step(async (url, options) => {
    assert.equal(url.pathname, "/api/integrations/doorprize/winners/bulk");
    assert.equal(options.body, event.payload);
    return success(options.body);
  });
  assert.equal((await db("doorprize_outbox").first()).status, "sent");
});

test("timeout retries identical payload after durable delay; validation errors require manual retry", async () => {
  const id = await linked();
  await request("/participants/batch", "PATCH", {
    updates: [{ id, prize: "Laptop" }],
  });
  const original = await db("doorprize_outbox").first();
  await step(async () => {
    throw new Error("network failure secret should not appear");
  });
  let event = await db("doorprize_outbox").first();
  assert.equal(event.status, "pending");
  assert.ok(Number(event.next_attempt_at) > Date.now());
  assert.ok(!event.last_error.includes("secret"));
  await db("doorprize_outbox").update({ next_attempt_at: 0 });
  await step(async (url, options) => {
    assert.equal(options.body, original.payload);
    return Response.json({
      batchId: original.batch_id,
      count: 1,
      replayed: true,
    });
  });
  assert.equal((await db("doorprize_outbox").first()).status, "sent");
  await request(`/participants/${id}`, "PATCH", { prize: null });
  await request(`/participants/${id}`, "PATCH", { prize: "New award" });
  await step(async () => new Response("invalid participant", { status: 422 }));
  event = await db("doorprize_outbox").orderBy("id", "desc").first();
  assert.equal(event.status, "failed");
  assert.equal((await control("retry", { id: event.id })).status, 202);
  await step(async (url, options) => {
    assert.equal(options.body, event.payload);
    return success(options.body);
  });
  assert.equal(
    (await db("doorprize_outbox").where({ id: event.id }).first()).status,
    "sent",
  );
});

test("rate limits wait a minute; pause, leases, and permanent errors prevent unwanted sends", async () => {
  const id = await linked();
  await request(`/participants/${id}`, "PATCH", { prize: "Laptop" });
  await step(async () => new Response(null, { status: 429 }));
  assert.ok(
    Number((await db("doorprize_outbox").first()).next_attempt_at) >=
      Date.now() + 59000,
  );
  await db("doorprize_outbox").update({ next_attempt_at: 0 });
  await db("doorprize_integration").update({ enabled: false });
  assert.equal(
    await step(async () => {
      assert.fail("paused send");
    }),
    false,
  );
  await db("doorprize_integration").update({
    enabled: true,
    lease_until: Date.now() + 60000,
  });
  assert.equal(
    await step(async () => {
      assert.fail("lease bypass");
    }),
    false,
  );
  await db("doorprize_integration").update({ lease_until: 0 });
  await step(async () => new Response(null, { status: 409 }));
  assert.equal((await db("doorprize_outbox").first()).status, "failed");
});

test("manual queue handles winners assigned while paused; reset and purge preserve delivery history", async () => {
  const id = await linked();
  await db("doorprize_integration").update({ enabled: false });
  await request(`/participants/${id}`, "PATCH", { prize: "Laptop" });
  assert.equal((await db("doorprize_outbox")).length, 0);
  await db("doorprize_integration").update({ enabled: true });
  assert.equal((await (await control("queue")).json()).data.queued, 1);
  assert.equal((await (await control("queue")).json()).data.queued, 0);
  await request("/participants/reset-results", "POST", {
    confirmation: "RESET ALL RESULTS",
  });
  assert.equal((await db("doorprize_links").first()).last_prize, null);
  await request("/participants/purge", "DELETE", {
    confirmation: "DELETE ALL PARTICIPANTS",
  });
  assert.equal((await db("doorprize_links")).length, 0);
  assert.equal((await db("doorprize_outbox")).length, 1);
});

test("batch winner update groups deliveries within protocol limits", async () => {
  await db("doorprize_integration").update({ enabled: true });
  const ids = [];
  for (let i = 1; i <= 5; i++) {
    const id = await participant(`B${i}`);
    ids.push(id);
    await db("doorprize_links").insert({
      participant_id: id,
      source_id: i,
      source_nip: `B${i}`,
    });
  }
  const response = await request("/participants/batch", "PATCH", {
    updates: ids.map((id) => ({ id, prize: "Group prize", sesi: 1, babak: 1 })),
  });
  assert.equal(response.status, 200);
  const events = await db("doorprize_outbox");
  assert.equal(events.length, 1);
  assert.equal(events[0].participant_count, 5);
  const payload = JSON.parse(events[0].payload);
  assert.equal(payload.winners.length, 5);
  assert.equal(new Set(payload.winners.map((row) => row.externalId)).size, 5);
  assert.ok(Buffer.byteLength(events[0].payload) <= 256 * 1024);
  await step(async (url, options) =>
    Response.json({
      batchId: JSON.parse(options.body).batchId,
      count: 5,
      replayed: false,
    }),
  );
  assert.equal((await db("doorprize_outbox").first()).status, "sent");
});

test("concurrent workers share a lease and an invalid acknowledgment never marks delivery sent", async () => {
  const id = await linked();
  await request(`/participants/${id}`, "PATCH", { prize: "Laptop" });
  let entered, release;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const first = step(async () => {
    entered();
    await pending;
    return Response.json({ batchId: "wrong", count: 1, replayed: false });
  });
  await started;
  assert.equal(
    await workerStep(db, async () => {
      assert.fail("second worker must not send");
    }),
    false,
  );
  release();
  await first;
  const event = await db("doorprize_outbox").first();
  assert.equal(event.status, "pending");
  assert.match(event.last_error, /acknowledgment/);
});

test("transient import failure preserves cursor and a paused job makes no requests", async () => {
  await db("doorprize_integration").update({ import_mode: "create" });
  await control("sync");
  await step(async () =>
    Response.json({ rows: [{ id: 1, nip: "ONE" }], through: 2, nextAfter: 1 }),
  );
  await step(async () => new Response(null, { status: 503 }));
  let state = await db("doorprize_integration").first();
  assert.equal(Number(state.import_after), 1);
  assert.equal(state.import_status, "running");
  await control("pause");
  assert.equal(
    await step(async () => {
      assert.fail("paused import");
    }),
    false,
  );
  assert.equal((await control("resume")).status, 202);
  await step(async (url) => {
    assert.equal(url.searchParams.get("after"), "1");
    assert.equal(url.searchParams.get("through"), "2");
    return Response.json({
      rows: [{ id: 2, nip: "TWO" }],
      through: 2,
      nextAfter: null,
    });
  });
  state = await db("doorprize_integration").first();
  assert.equal(state.import_status, "complete");
  assert.equal(state.import_created, 2);
});

test("invalid winners are not queued through updates or manual controls", async () => {
  const id = await linked();
  const response = await request(`/participants/${id}`, "PUT", {
    prize: "Laptop",
    babak: 1,
    is_invalid: true,
  });
  assert.equal(response.status, 200);
  assert.equal((await db("doorprize_outbox")).length, 0);
  assert.equal((await control("queue")).status, 200);
  assert.equal((await db("doorprize_outbox")).length, 0);
  const restored = await request(`/participants/${id}`, "PUT", {
    is_invalid: false,
  });
  assert.equal(restored.status, 200);
  assert.equal((await db("doorprize_outbox")).length, 1);
});
