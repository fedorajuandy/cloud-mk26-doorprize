import { z } from "zod";
import { authorize } from "../auth.js";
import { fail } from "../errors.js";
import { body, json } from "../http.js";

export async function resetParticipantResults({ db, user, request, method }) {
  authorize(user);
  if (method !== "POST") fail(405, "Method not allowed.");
  z.object({ confirmation: z.literal("RESET ALL RESULTS") })
    .strict()
    .parse(await body(request));
  // One atomic UPDATE includes archived records; untouched rows retain timestamps.
  const updated = await db.transaction(async (trx) => {
    const count = await trx("participants")
      .where((query) =>
        query
          .whereNotNull("prize")
          .orWhereNotNull("babak")
          .orWhereNotNull("sesi")
          .orWhere("is_invalid", true),
      )
      .update({
        prize: null,
        babak: null,
        sesi: null,
        is_invalid: false,
        updated_at: trx.fn.now(),
      });
    await trx("doorprize_links")
      .whereNotNull("last_prize")
      .update({ last_prize: null });
    return count;
  });
  return json({ updated });
}
