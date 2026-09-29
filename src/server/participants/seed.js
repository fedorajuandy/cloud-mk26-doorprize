import { z } from "zod";
import { authorize } from "../auth.js";
import { fail } from "../errors.js";
import { body, json } from "../http.js";
import { seedDummyParticipants } from "../../../seeds/dummy_participants.js";

export async function seedParticipants({ db, user, request, method }) {
  authorize(user);
  if (method !== "POST") fail(405, "Method not allowed.");
  z.object({})
    .strict()
    .parse(await body(request));
  return json({ inserted: await seedDummyParticipants(db) }, 201);
}
