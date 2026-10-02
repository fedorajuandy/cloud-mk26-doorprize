import { z } from "zod";
import { authorize } from "../auth.js";
import { body, json } from "../http.js";
import { fail } from "../errors.js";
import { credentials, checkSource, integrationSettings } from "./config.js";
import { queueWinnerChanges } from "./outbox.js";
export async function integrationApi({ db, user, request, method, action }) {
  authorize(user);
  if (!action && method === "GET") {
    const config = await db("doorprize_integration").where({ id: 1 }).first();
    let configured = false,
      origin = null;
    try {
      const auth = credentials();
      checkSource(config, auth.origin);
      origin = auth.origin;
      configured = true;
    } catch {
      /* Status only; never return credentials. */
    }
    const [counts, links, history, unmapped, issues, participants] =
      await Promise.all([
        db("doorprize_outbox")
          .select("status")
          .count({ count: "*" })
          .groupBy("status"),
        db("doorprize_links").count({ count: "*" }).first(),
        db("doorprize_outbox")
          .select(
            "id",
            "batch_id",
            "participant_id",
            "participant_count",
            "status",
            "attempts",
            "last_error",
            "created_at",
            "sent_at",
          )
          .orderBy("id", "desc")
          .limit(50),
        db("participants as p")
          .leftJoin("doorprize_links as l", "l.participant_id", "p.id")
          .whereNull("p.deleted_at")
          .whereNotNull("p.prize")
          .where("p.is_invalid", false)
          .whereNull("l.participant_id")
          .count({ count: "*" })
          .first(),
        db("doorprize_import_issues").orderBy("id", "desc").limit(50),
        db("participants")
          .whereNull("deleted_at")
          .where("is_invalid", false)
          .select(db.raw("COUNT(*) AS total, COUNT(prize) AS with_prize"))
          .first(),
      ]);
    return json({
      configured,
      origin,
      participants: {
        with_prize: Number(participants.with_prize),
        without_prize:
          Number(participants.total) - Number(participants.with_prize),
      },
      settings: {
        enabled: Boolean(config.enabled),
        import_mode: config.import_mode,
        claim_location: config.claim_location,
        description: config.description,
        image_url: config.image_url,
        claim_deadline: config.claim_deadline,
      },
      import: {
        status: config.import_status,
        after: config.import_after,
        through: config.import_through,
        linked: config.import_linked,
        created: config.import_created,
        skipped: config.import_skipped,
        error: config.import_error,
      },
      connection: config.test_requested
        ? "Test queued"
        : config.connection_status,
      test_pending: Boolean(config.test_requested),
      retry_wait_seconds: Math.max(
        0,
        Math.ceil((Number(config.next_request_at) - Date.now()) / 1000),
      ),
      worker_online: Number(config.heartbeat_at) > Date.now() - 30000,
      linked: Number(links.count),
      unmapped_winners: Number(unmapped.count),
      queue: Object.fromEntries(
        counts.map((row) => [row.status, Number(row.count)]),
      ),
      history,
      issues,
    });
  }
  if (!action && method === "PUT") {
    const input = integrationSettings.parse(await body(request));
    if (input.enabled) credentials();
    await db.transaction(async (trx) => {
      const config = await trx("doorprize_integration")
        .where({ id: 1 })
        .forUpdate()
        .first();
      if (input.enabled) checkSource(config, credentials().origin);
      if (
        config.import_status === "running" &&
        input.import_mode !== config.import_mode
      )
        fail(409, "Pause participant sync before changing import mode.");
      await trx("doorprize_integration").where({ id: 1 }).update(input);
    });
    return json({ saved: true });
  }
  if (method !== "POST") fail(405, "Method not allowed.");
  if (!["test", "sync", "pause", "resume", "queue", "retry"].includes(action))
    fail(404, "Endpoint not found.");
  const input = await body(request);
  if (action === "retry")
    z.object({ id: z.number().int().positive() }).strict().parse(input);
  else z.object({}).strict().parse(input);
  if (action === "queue") {
    const result = await db.transaction(async (trx) => {
      const config = await trx("doorprize_integration")
        .where({ id: 1 })
        .first();
      checkSource(config, credentials().origin);
      const records = await trx("participants as p")
        .join("doorprize_links as l", "l.participant_id", "p.id")
        .whereNull("p.deleted_at")
        .whereNotNull("p.prize")
        .where("p.is_invalid", false)
        .whereNull("l.last_prize")
        .orderBy("p.id")
        .limit(100)
        .select("p.*")
        .forUpdate();
      return queueWinnerChanges(trx, records, { force: true });
    });
    return json({ queued: result });
  }
  return db.transaction(async (trx) => {
    const config = await trx("doorprize_integration")
      .where({ id: 1 })
      .forUpdate()
      .first();
    if (action !== "pause") checkSource(config, credentials().origin);
    if (action === "test")
      await trx("doorprize_integration")
        .where({ id: 1 })
        .update({ test_requested: true });
    if (action === "sync") {
      if (
        config.import_status === "running" ||
        Number(config.lease_until) > Date.now()
      )
        fail(
          409,
          "Sync is already running or a request is in flight. Pause and wait before restarting.",
        );
      await trx("doorprize_import_issues").delete();
      await trx("doorprize_integration").where({ id: 1 }).update({
        import_status: "running",
        import_after: 0,
        import_through: null,
        import_linked: 0,
        import_created: 0,
        import_skipped: 0,
        import_error: null,
        import_attempts: 0,
      });
    }
    if (action === "pause")
      await trx("doorprize_integration")
        .where({ id: 1 })
        .update({ import_status: "paused" });
    if (action === "resume") {
      if (!["paused", "failed"].includes(config.import_status))
        fail(409, "There is no paused or failed sync to resume.");
      await trx("doorprize_integration")
        .where({ id: 1 })
        .update({ import_status: "running", import_error: null });
    }
    if (action === "retry") {
      const changed = await trx("doorprize_outbox")
        .where({ id: input.id, status: "failed" })
        .update({
          status: "pending",
          next_attempt_at: 0,
          last_error: null,
          manual_delivery: true,
        });
      if (!changed) fail(409, "Only failed deliveries can be retried here.");
    }
    return json({ accepted: true }, 202);
  });
}
