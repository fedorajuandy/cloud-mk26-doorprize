import { randomUUID } from "node:crypto";
import { fail } from "../errors.js";

// Called inside the same transaction as participant writes, while their rows are locked.
export async function queueWinnerChanges(trx, records, { force = false } = {}) {
  const config = await trx("doorprize_integration").where({ id: 1 }).first();
  if (!config || (!config.enabled && !force)) return 0;
  const ids = records.map((row) => row.id);
  if (!ids.length) return 0;
  const links = new Map(
    (
      await trx("doorprize_links")
        .whereIn("participant_id", ids)
        .orderBy("participant_id")
        .forUpdate()
    ).map((link) => [String(link.participant_id), link]),
  );
  let queued = 0;
  let batchId = `cms-${randomUUID()}`,
    winners = [],
    localIds = [];
  async function flush() {
    if (!winners.length) return;
    await trx("doorprize_outbox").insert({
      batch_id: batchId,
      manual_delivery: force,
      participant_id: localIds[0],
      participant_count: winners.length,
      payload: JSON.stringify({ batchId, winners }),
    });
    batchId = `cms-${randomUUID()}`;
    winners = [];
    localIds = [];
  }
  for (const row of records) {
    const link = links.get(String(row.id));
    if (!link) continue;
    if (row.nip !== link.source_nip)
      fail(
        409,
        "A linked participant's NIP must match the source. Sync participants before assigning a prize.",
      );
    if (!row.prize) {
      // A reset starts a new local draw. Published/queued awards are not revoked.
      if (link.last_prize !== null)
        await trx("doorprize_links")
          .where({ participant_id: row.id })
          .update({ last_prize: null });
      continue;
    }
    if (row.is_invalid || row.deleted_at || link.last_prize === row.prize)
      continue;
    if (link.last_prize !== null)
      fail(
        409,
        "This prize has already been queued or published. The source API cannot edit awards. Resolve corrections on the source site before resetting and assigning a new prize.",
      );
    if (row.prize.length > 160)
      fail(422, "Synced prize names must be at most 160 characters.");
    const context = [
      row.sesi === null ? null : `Sesi ${row.sesi}`,
      row.babak === null ? null : `Babak ${row.babak}`,
    ]
      .filter(Boolean)
      .join(" · ");
    const description = context
      ? `${config.description.slice(0, 297 - context.length)}${config.description ? " · " : ""}${context}`
      : config.description;
    const winner = {
      externalId: `cms-${randomUUID()}`,
      participantId: Number(link.source_id),
      nip: link.source_nip,
      prizeName: row.prize,
      description,
      imageUrl: config.image_url,
      claimLocation: config.claim_location,
      claimDeadline: config.claim_deadline,
    };
    if (
      winners.length >= 100 ||
      Buffer.byteLength(
        JSON.stringify({ batchId, winners: [...winners, winner] }),
      ) >
        256 * 1024
    )
      await flush();
    winners.push(winner);
    localIds.push(row.id);
    await trx("doorprize_links")
      .where({ participant_id: row.id })
      .update({ last_prize: row.prize });
    queued++;
  }
  await flush();
  return queued;
}
