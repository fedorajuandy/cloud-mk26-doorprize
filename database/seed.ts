import type { Knex } from "knex";
import { hash } from "bcryptjs";
import { user as userSchema } from "../src/server/validation";
export const permissionNames = [
  "view_participants",
  "create_participants",
  "update_participants",
  "delete_participants",
];
export async function seed(db: Knex) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8)
    throw new Error(
      "Set ADMIN_PASSWORD to at least 8 characters before seeding.",
    );
  const account = userSchema.parse({
    username: process.env.ADMIN_USERNAME || "admin",
    password,
    role_id: 1,
  });
  await db.transaction(async (trx) => {
    for (const [id, role_name] of [
      [1, "Super Admin"],
      [2, "Administrator"],
    ] as const) {
      if (!(await trx("roles").where({ id }).first()))
        await trx("roles").insert({ id, role_name });
    }
    for (const permission_name of permissionNames)
      if (!(await trx("permissions").where({ permission_name }).first()))
        await trx("permissions").insert({ permission_name });
    if (!(await trx("users").first()))
      await trx("users").insert({
        username: account.username,
        password: await hash(password, 8),
        role_id: 1,
      });
    if (!(await trx("system_settings").first()))
      await trx("system_settings").insert({ id: 1 });
    for (const p of await trx("permissions").whereIn(
      "permission_name",
      permissionNames,
    )) {
      if (
        !(await trx("role_permissions")
          .where({ role_id: 2, permission_id: p.id })
          .first())
      )
        await trx("role_permissions").insert({
          role_id: 2,
          permission_id: p.id,
        });
    }
  });
}
