import { hash } from "bcryptjs";
import { user as userSchema } from "../src/server/validation.js";
export const permissionNames = [
  "view_participants",
  "create_participants",
  "update_participants",
  "delete_participants",
];
export async function seed(db) {
  const hasUsers = Boolean(await db("users").select("id").first());
  let account;
  if (!hasUsers) {
    account = userSchema.parse({
      username: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD,
      role_id: 1,
    });
    account.password = await hash(account.password, 8);
  }
  await db.transaction(async (trx) => {
    const existingRoles = new Set(await trx("roles").pluck("id"));
    const roles = [
      { id: 1, role_name: "Super Admin" },
      { id: 2, role_name: "Administrator" },
    ].filter((role) => !existingRoles.has(role.id));
    if (roles.length) await trx("roles").insert(roles);
    const existingPermissions = new Set(
      await trx("permissions")
        .whereIn("permission_name", permissionNames)
        .pluck("permission_name"),
    );
    const additions = permissionNames
      .filter((name) => !existingPermissions.has(name))
      .map((permission_name) => ({ permission_name }));
    if (additions.length) await trx("permissions").insert(additions);
    if (account && !(await trx("users").select("id").first()))
      await trx("users").insert(account);
    if (!(await trx("system_settings").select("id").first()))
      await trx("system_settings").insert({ id: 1 });
    const permissions = await trx("permissions")
      .whereIn("permission_name", permissionNames)
      .whereNull("deleted_at")
      .select("id");
    const existingGrants = new Set(
      await trx("role_permissions")
        .where({ role_id: 2 })
        .pluck("permission_id"),
    );
    const grants = permissions
      .filter((p) => !existingGrants.has(p.id))
      .map((p) => ({ role_id: 2, permission_id: p.id }));
    if (grants.length) await trx("role_permissions").insert(grants);
  });
}
