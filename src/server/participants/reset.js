import { z } from "zod";
import { authorize } from "../auth.js";
import { fail } from "../errors.js";
import { body, json } from "../http.js";

export async function resetParticipantResults({ db, user, request, method }) {
  authorize(user);
  if (method !== "POST") fail(405, "Method not allowed.");
  const round = z.number().int().min(0).max(4294967295);
  const prize = z.string().trim().min(1).max(16000);
  const confirmation = z.literal("RESET ALL RESULTS");
  const input = z
    .discriminatedUnion("scope", [
      z.object({ scope: z.literal("all"), confirmation }).strict(),
      z.object({ scope: z.literal("prize"), prize, confirmation }).strict(),
      z
        .object({
          scope: z.literal("babak_prize"),
          babak: round,
          prize,
          confirmation,
        })
        .strict(),
      z
        .object({ scope: z.literal("babak"), babak: round, confirmation })
        .strict(),
      z
        .object({ scope: z.literal("sesi"), sesi: round, confirmation })
        .strict(),
      z
        .object({
          scope: z.literal("specific"),
          prize,
          babak: round,
          sesi: round,
          confirmation,
        })
        .strict(),
    ])
    .parse({ scope: "all", ...(await body(request)) });
  const updated = await db.transaction(async (trx) => {
    const matching = trx("participants");
    for (const key of ["prize", "babak", "sesi"])
      if (input[key] !== undefined) matching.where(key, input[key]);
    // Lock matching rows before clearing results and their integration markers.
    const rows = await matching.clone().select("id").orderBy("id").forUpdate();
    for (let i = 0; i < rows.length; i += 500)
      await trx("doorprize_links")
        .whereIn(
          "participant_id",
          rows.slice(i, i + 500).map((row) => row.id),
        )
        .whereNotNull("last_prize")
        .update({ last_prize: null });
    const count = await matching
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

    return count;
  });
  return json({ updated });
}
