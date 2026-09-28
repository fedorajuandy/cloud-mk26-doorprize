import { z } from "zod";
import { authorize } from "../auth.js";
import { fail } from "../errors.js";
import { body, idSchema, json } from "../http.js";
import { participant } from "../validation.js";

const update = participant
  .partial()
  .extend({
    id: z.union([
      idSchema,
      z.number().int().positive().safe().transform(String),
    ]),
  })
  .refine((value) => Object.keys(value).length > 1, {
    message: "Supply at least one participant field to update.",
  });
const batch = z
  .object({ updates: z.array(update).min(1).max(100) })
  .strict()
  .superRefine(({ updates }, context) => {
    const seen = new Set();
    updates.forEach(({ id }, index) => {
      if (seen.has(id))
        context.addIssue({
          code: "custom",
          path: ["updates", index, "id"],
          message: "Duplicate participant ID.",
        });
      seen.add(id);
    });
  });

export async function updateParticipants({ db, user, request, method }) {
  authorize(user, "update_participants");
  if (method !== "PATCH") fail(405, "Method not allowed.");
  const { updates } = batch.parse(await body(request));
  const ids = updates.map(({ id }) => id);
  await db.transaction(async (trx) => {
    // Lock in ID order so overlapping batches acquire locks consistently.
    const existing = await trx("participants")
      .select("id")
      .whereIn("id", ids)
      .whereNull("deleted_at")
      .orderBy("id")
      .forUpdate();
    if (existing.length !== ids.length)
      fail(
        404,
        "One or more participants were not found or are archived. Nothing was updated.",
      );
    // Common prize/round assignments share one UPDATE instead of one per row.
    const groups = new Map();
    for (const { id, ...fields } of updates) {
      const key = JSON.stringify(fields);
      if (!groups.has(key)) groups.set(key, { fields, ids: [] });
      groups.get(key).ids.push(id);
    }
    for (const group of groups.values())
      await trx("participants")
        .whereIn("id", group.ids)
        .update({ ...group.fields, updated_at: trx.fn.now() });
  });
  return json({ updated: ids.length, ids });
}
