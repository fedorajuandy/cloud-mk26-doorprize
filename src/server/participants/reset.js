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
  const updated = await db("participants")
    .where((query) =>
      query
        .whereNotNull("prize")
        .orWhereNotNull("babak")
        .orWhereNotNull("sesi"),
    )
    .update({ prize: null, babak: null, sesi: null, updated_at: db.fn.now() });
  return json({ updated });
}
