import { z } from "zod";
import { authorize } from "../auth.js";
import { fail } from "../errors.js";
import { body, idSchema, json } from "../http.js";
export async function handleRoles({
  db,
  user,
  rawId,
  action,
  method,
  request,
}) {
  authorize(user);
  const roleId = rawId ? idSchema.parse(rawId) : undefined;
  if (action) fail(404, "Endpoint not found.");
  if (method === "GET") {
    const roles = await db("roles")
      .whereNull("deleted_at")
      .modify((q) => {
        if (roleId) q.where({ id: roleId });
      })
      .orderBy("id");
    if (roleId && !roles.length) fail(404, "Role not found.");
    const links = await db("role_permissions as rp")
      .join("permissions as p", "rp.permission_id", "p.id")
      .whereNull("rp.deleted_at")
      .whereNull("p.deleted_at")
      .whereIn(
        "rp.role_id",
        roles.map((role) => role.id),
      )
      .select("rp.role_id", "p.id", "p.permission_name");
    const grants = new Map();
    for (const { role_id, ...permission } of links) {
      if (!grants.has(role_id)) grants.set(role_id, []);
      grants.get(role_id).push(permission);
    }
    const rows = roles.map((role) => ({
      ...role,
      permissions: grants.get(role.id) || [],
    }));
    return json(roleId ? rows[0] : rows);
  }
  if (method === "PUT" && roleId) {
    if (roleId === "1") fail(409, "Super Admin permissions cannot be changed.");
    const { permission_ids } = z
      .object({
        permission_ids: z.array(z.number().int().positive()).max(500),
      })
      .strict()
      .parse(await body(request));
    await db.transaction(async (trx) => {
      if (
        !(await trx("roles")
          .where({ id: roleId })
          .forUpdate()
          .whereNull("deleted_at")
          .first())
      )
        fail(404, "Role not found.");
      const ids = [...new Set(permission_ids)];
      const permissions = await trx("permissions")
        .whereIn("id", ids)
        .whereNull("deleted_at");
      if (permissions.length !== ids.length)
        fail(422, "Choose active permissions.");
      await trx("role_permissions")
        .where({ role_id: roleId })
        .whereNull("deleted_at")
        .update({ deleted_at: trx.fn.now(), deleted_by: user.id });
      // Two batched writes replace per-permission lookups and writes.
      const existing = new Set(
        await trx("role_permissions")
          .where({ role_id: roleId })
          .whereIn("permission_id", ids)
          .pluck("permission_id"),
      );
      if (existing.size)
        await trx("role_permissions")
          .where({ role_id: roleId })
          .whereIn("permission_id", [...existing])
          .update({
            deleted_at: null,
            deleted_by: null,
            updated_at: trx.fn.now(),
            updated_by: user.id,
          });
      const additions = ids
        .filter((id) => !existing.has(id))
        .map((permission_id) => ({
          role_id: roleId,
          permission_id,
          created_by: user.id,
        }));
      if (additions.length) await trx("role_permissions").insert(additions);
    });
    return json({ role_id: roleId, permission_ids });
  }
  fail(405, "Method not allowed.");
}
