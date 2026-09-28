import { authorize } from "../auth.js";
import { body, json } from "../http.js";
import * as schemas from "../validation.js";
export async function updateSettings({ db, user, request }) {
  authorize(user);
  const input = schemas.settings.parse(await body(request));
  await db.transaction(async (trx) => {
    const row = await trx("system_settings").orderBy("id").first();
    if (row)
      await trx("system_settings")
        .where({ id: row.id })
        .update({ ...input, updated_at: trx.fn.now() });
    else
      await trx("system_settings").insert({
        ...input,
        updated_at: trx.fn.now(),
      });
  });
  return json(await db("system_settings").orderBy("id").first());
}
