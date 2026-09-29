import { z } from "zod";
import { authorize } from "../auth.js";
import { fail } from "../errors.js";
import { body, json } from "../http.js";

export async function deleteAllParticipants(db) {
  return db.transaction((trx) => trx("participants").delete());
}
export async function purgeParticipants({ db, user, request, method }) {
  authorize(user);
  if (method !== "DELETE") fail(405, "Method not allowed.");
  z.object({ confirmation: z.literal("DELETE ALL PARTICIPANTS") })
    .strict()
    .parse(await body(request));
  return json({ deleted: await deleteAllParticipants(db) });
}
