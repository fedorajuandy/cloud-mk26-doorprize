import { randomUUID } from "node:crypto";
import { z } from "zod";
import { credentials, checkSource } from "./config.js";
const sourceId = z.number().int().nonnegative().safe();
const pageSchema = z.object({
  rows: z
    .array(
      z.object({ id: sourceId.positive(), nip: z.string().min(1).max(255) }),
    )
    .max(500),
  through: sourceId,
  nextAfter: sourceId.positive().nullable(),
});
class RemoteFailure extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
async function remote(path, payload, fetcher) {
  const { origin, token } = credentials();
  try {
    const response = await fetcher(new URL(path, origin), {
      method: payload ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      ...(payload ? { body: payload } : {}),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new RemoteFailure(
        response.status,
        `Source returned HTTP ${response.status}.`,
      );
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new RemoteFailure(
          502,
          "Source response exceeded the size limit.",
        );
      }
      chunks.push(Buffer.from(value));
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new RemoteFailure(502, "Source returned invalid JSON.");
    }
  } catch (error) {
    if (error instanceof RemoteFailure) throw error;
    // Never expose the token, raw response, URL query, or fetch error to logs/UI.
    throw new RemoteFailure(503, "Source connection failed or timed out.");
  }
}
const delay = (status, attempts) =>
  status === 429
    ? 60000
    : Math.min(300000, 2000 * 2 ** Math.min(attempts, 7)) +
      Math.floor(Math.random() * 1000);
const transient = (status) => status === 429 || status >= 500;

async function applyPage(trx, config, page) {
  const after = Number(config.import_after);
  const through =
    config.import_through === null
      ? page.through
      : Number(config.import_through);
  if (page.through !== through || through < after)
    throw new RemoteFailure(
      422,
      "Source export boundary changed. Restart participant sync.",
    );
  let previous = after;
  for (const row of page.rows) {
    if (row.id <= previous || row.id > through)
      throw new RemoteFailure(
        422,
        "Source returned invalid participant ordering.",
      );
    previous = row.id;
  }
  if (
    page.nextAfter !== null &&
    (!page.rows.length || page.nextAfter !== previous)
  )
    throw new RemoteFailure(
      422,
      "Source returned an invalid pagination cursor.",
    );
  const ids = page.rows.map((row) => row.id);
  const nips = page.rows.map((row) => row.nip);
  const existingLinks = ids.length
    ? await trx("doorprize_links").whereIn("source_id", ids)
    : [];
  const links = new Map(
    existingLinks.map((row) => [String(row.source_id), row]),
  );
  const candidates = nips.length
    ? await trx("participants")
        .whereIn("nip", nips)
        .select("id", "nip", "deleted_at")
    : [];
  const byNip = new Map();
  for (const row of candidates) {
    if (!byNip.has(row.nip)) byNip.set(row.nip, []);
    byNip.get(row.nip).push(row);
  }
  const allLinks = candidates.length
    ? await trx("doorprize_links").whereIn(
        "participant_id",
        candidates.map((row) => row.id),
      )
    : [];
  const used = new Set(allLinks.map((row) => String(row.participant_id)));
  const mappedRows = existingLinks.length
    ? await trx("participants")
        .whereIn(
          "id",
          existingLinks.map((link) => link.participant_id),
        )
        .select("id", "nip")
    : [];
  const mappedParticipants = new Map(
    mappedRows.map((row) => [String(row.id), row]),
  );
  const issues = [];
  let linked = 0,
    created = 0,
    skipped = 0;
  for (const row of page.rows) {
    const linkedRow = links.get(String(row.id));
    if (linkedRow) {
      // Existing mappings require the same identity; do not overwrite personal details.
      const participant = mappedParticipants.get(
        String(linkedRow.participant_id),
      );
      if (
        !participant ||
        participant.nip !== row.nip ||
        linkedRow.source_nip !== row.nip
      ) {
        skipped++;
        issues.push({
          source_id: row.id,
          nip: row.nip,
          reason: "Mapped participant is missing or NIP changed.",
        });
        continue;
      }
      linked++;
      continue;
    }
    const matches = byNip.get(row.nip) || [];
    if (matches.length === 1 && !used.has(String(matches[0].id))) {
      await trx("doorprize_links").insert({
        participant_id: matches[0].id,
        source_id: row.id,
        source_nip: row.nip,
      });
      used.add(String(matches[0].id));
      linked++;
    } else if (!matches.length && config.import_mode === "create") {
      const [id] = await trx("participants").insert({
        unique_id: `familyday:${row.id}`,
        nip: row.nip,
        full_name: row.nip,
        unit_kerja: "Not provided",
      });
      await trx("doorprize_links").insert({
        participant_id: id,
        source_id: row.id,
        source_nip: row.nip,
      });
      byNip.set(row.nip, [{ id, nip: row.nip }]);
      used.add(String(id));
      created++;
    } else {
      skipped++;
      issues.push({
        source_id: row.id,
        nip: row.nip,
        reason: matches.length
          ? "NIP is ambiguous or already linked to another source ID."
          : "No local participant with this NIP (link-only mode).",
      });
    }
  }
  for (let i = 0; i < issues.length; i += 100)
    await trx("doorprize_import_issues").insert(issues.slice(i, i + 100));
  await trx("doorprize_integration")
    .where({ id: 1 })
    .update({
      import_after: page.nextAfter ?? previous,
      import_through: through,
      import_status: page.nextAfter === null ? "complete" : "running",
      import_error: null,
      import_attempts: 0,
      import_linked: Number(config.import_linked) + linked,
      import_created: Number(config.import_created) + created,
      import_skipped: Number(config.import_skipped) + skipped,
    });
}

export async function workerStep(db, fetcher = fetch) {
  const now = Date.now(),
    owner = randomUUID();
  const task = await db.transaction(async (trx) => {
    const config = await trx("doorprize_integration")
      .where({ id: 1 })
      .forUpdate()
      .first();
    if (!config) return null;
    await trx("doorprize_integration")
      .where({ id: 1 })
      .update({ heartbeat_at: now });
    if (
      Number(config.lease_until) > now ||
      Number(config.next_request_at) > now
    )
      return null;
    let auth;
    try {
      auth = credentials();
      checkSource(config, auth.origin);
    } catch {
      await trx("doorprize_integration").where({ id: 1 }).update({
        connection_status:
          "Server credentials are missing or source URL does not match.",
      });
      return null;
    }
    let type, event;
    if (config.test_requested) type = "test";
    else {
      event = config.enabled
        ? await trx("doorprize_outbox")
            .where({ status: "pending" })
            .where("next_attempt_at", "<=", now)
            .orderBy("id")
            .first()
        : null;
      if (event) type = "send";
      else if (config.import_status === "running") type = "import";
      else return null;
    }
    await trx("doorprize_integration")
      .where({ id: 1 })
      .update({
        lease_owner: owner,
        lease_until: now + 60000,
        next_request_at: now + 1100,
        source_origin: auth.origin,
      });
    if (event)
      await trx("doorprize_outbox")
        .where({ id: event.id })
        .increment("attempts", 1);
    return { type, config, event };
  });
  if (!task) return false;
  try {
    if (task.type === "send") {
      const result = await remote(
        "/api/integrations/doorprize/winners/bulk",
        task.event.payload,
        fetcher,
      );
      if (
        result.batchId !== task.event.batch_id ||
        result.count !== Number(task.event.participant_count) ||
        typeof result.replayed !== "boolean"
      )
        throw new RemoteFailure(
          502,
          "Source acknowledgment did not match the queued batch.",
        );
      await db.transaction(async (trx) => {
        const lock = await trx("doorprize_integration")
          .where({ id: 1, lease_owner: owner })
          .forUpdate()
          .first();
        if (lock)
          await trx("doorprize_outbox").where({ id: task.event.id }).update({
            status: "sent",
            sent_at: trx.fn.now(),
            last_error: null,
          });
      });
    } else {
      const params = new URLSearchParams({
        after: task.type === "test" ? "0" : String(task.config.import_after),
        limit: task.type === "test" ? "1" : "500",
      });
      if (task.type === "import" && task.config.import_through !== null)
        params.set("through", String(task.config.import_through));
      const response = await remote(
        `/api/integrations/doorprize/participants?${params}`,
        null,
        fetcher,
      );
      const parsed = pageSchema.safeParse(response);
      if (!parsed.success)
        throw new RemoteFailure(
          422,
          "Source participant response does not match the integration guide.",
        );
      await db.transaction(async (trx) => {
        const config = await trx("doorprize_integration")
          .where({ id: 1, lease_owner: owner })
          .forUpdate()
          .first();
        if (!config) return;
        if (task.type === "test")
          await trx("doorprize_integration")
            .where({ id: 1 })
            .update({ test_requested: false, connection_status: "Connected" });
        else if (config.import_status === "running")
          await applyPage(trx, config, parsed.data);
      });
    }
  } catch (error) {
    const status = error instanceof RemoteFailure ? error.status : 422;
    const message =
      error instanceof RemoteFailure
        ? error.message
        : "Import failed due to a local data conflict. Review participant identities before retrying.";
    await db.transaction(async (trx) => {
      const config = await trx("doorprize_integration")
        .where({ id: 1, lease_owner: owner })
        .forUpdate()
        .first();
      if (!config) return;
      const retryAt =
        Date.now() +
        delay(
          status,
          task.event
            ? Number(task.event.attempts) + 1
            : Number(config.import_attempts) + 1,
        );
      if (task.type === "send")
        await trx("doorprize_outbox")
          .where({ id: task.event.id })
          .update({
            status: transient(status) ? "pending" : "failed",
            next_attempt_at: retryAt,
            last_error: message,
          });
      else if (task.type === "test")
        await trx("doorprize_integration")
          .where({ id: 1 })
          .update({ test_requested: false, connection_status: message });
      else
        await trx("doorprize_integration")
          .where({ id: 1 })
          .update({
            import_status: transient(status) ? "running" : "failed",
            import_error: message,
            import_attempts: Number(config.import_attempts) + 1,
          });
      if (transient(status))
        await trx("doorprize_integration")
          .where({ id: 1 })
          .update({ next_request_at: retryAt });
    });
  } finally {
    await db("doorprize_integration")
      .where({ id: 1, lease_owner: owner })
      .update({ lease_until: 0, lease_owner: null });
  }
  return true;
}
