import { hash } from "bcryptjs";
import { z } from "zod";
import { authorize } from "../auth.js";
import { fail } from "../errors.js";
import { body, idSchema, json } from "../http.js";
import * as schemas from "../validation.js";
const definitions = {
  participants: schemas.participant,
  users: schemas.user,
  roles: schemas.role,
  permissions: schemas.permission,
};
const safeUser = (row) => {
  const { password, ...rest } = row;
  return rest;
};

const updates = Object.fromEntries(
  Object.entries(definitions).map(([name, schema]) => [name, schema.partial()]),
);
export async function handleRecords({
  db,
  user,
  resource,
  rawId,
  action,
  method,
  url,
  request,
}) {
  if (!Object.hasOwn(definitions, resource)) fail(404, "Endpoint not found.");
  const table = resource;
  const id = rawId ? idSchema.parse(rawId) : undefined;
  const permissionAction =
    method === "GET"
      ? "view"
      : method === "POST"
        ? "create"
        : method === "DELETE"
          ? "delete"
          : "update";
  authorize(
    user,
    table === "participants" ? `${permissionAction}_participants` : undefined,
  );
  if (action && !(action === "restore" && method === "PUT" && id))
    fail(404, "Endpoint not found.");
  if (method === "GET") {
    if (id) {
      const row = await db(table).where({ id }).whereNull("deleted_at").first();
      if (!row) fail(404, "Record not found.");
      return json(table === "users" ? safeUser(row) : row);
    }
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(1000000)
      .parse(url.searchParams.get("page") || 1);
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(url.searchParams.get("limit") || 20);
    const deleted = url.searchParams.get("deleted") === "true";
    const search = z
      .string()
      .max(255)
      .parse(url.searchParams.get("search") || "");
    const query = db(table);
    deleted ? query.whereNotNull("deleted_at") : query.whereNull("deleted_at");
    if (search) {
      const columns =
        table === "participants"
          ? ["full_name", "nip", "unit_kerja", "no_hp", "prize"]
          : [
              table === "users"
                ? "username"
                : table === "roles"
                  ? "role_name"
                  : "permission_name",
            ];
      query.where((q) => {
        columns.forEach((c) => q.orWhere(c, "like", `%${search}%`));
      });
    }
    if (table === "participants") {
      if (url.searchParams.has("babak"))
        query.where(
          "babak",
          z.coerce.number().int().min(0).parse(url.searchParams.get("babak")),
        );
      for (const [key, op] of [
        ["start_date", ">="],
        ["end_date", "<="],
      ])
        if (url.searchParams.get(key)) {
          const date = z.iso.date().parse(url.searchParams.get(key));
          query.where(
            "created_at",
            op,
            `${date} ${key === "start_date" ? "00:00:00" : "23:59:59"}`,
          );
        }
    }
    const [count, rows] = await Promise.all([
      query.clone().count({ count: "*" }).first(),
      query
        .clone()
        .select(
          table === "users"
            ? [
                "id",
                "username",
                "role_id",
                "created_at",
                "created_by",
                "updated_at",
                "updated_by",
                "deleted_at",
                "deleted_by",
              ]
            : ["*"],
        )
        .orderBy("id", "desc")
        .limit(limit)
        .offset((page - 1) * limit),
    ]);
    const total = Number(count?.count || 0);
    return json({
      records: table === "users" ? rows.map(safeUser) : rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  }
  if (
    (method === "POST" && id) ||
    (["PUT", "PATCH", "DELETE"].includes(method) && !id)
  )
    fail(405, "Method not allowed.");
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method))
    fail(405, "Method not allowed.");
  let input;
  if (!action && method !== "DELETE") {
    input = (id ? updates[table] : definitions[table]).parse(
      await body(request),
    );
    // Password hashing is CPU work; finish it before acquiring a transaction/row lock.
    if (table === "users" && input.password)
      input.password = await hash(input.password, 8);
  }
  const result = await db.transaction(async (trx) => {
    const existing = id
      ? await trx(table).where({ id }).forUpdate().first()
      : null;
    if (id && (!existing || (!action && existing.deleted_at)))
      fail(404, "Record not found.");
    if (table === "roles" && (id === "1" || id === "2"))
      fail(409, "Built-in roles cannot be changed or deleted.");
    if (action === "restore") {
      if (
        table === "users" &&
        !(await trx("roles")
          .where({ id: existing.role_id })
          .whereNull("deleted_at")
          .first())
      )
        fail(409, "Restore this user’s role before restoring the account.");
      await trx(table)
        .where({ id })
        .update({
          deleted_at: null,
          updated_at: trx.fn.now(),
          ...(table !== "participants"
            ? { deleted_by: null, updated_by: user.id }
            : {}),
        });
    } else if (method === "DELETE") {
      if (
        table === "users" &&
        (String(user.id) === id || existing.role_id === 1)
      )
        fail(
          409,
          "Your own account and Super Admin accounts cannot be deleted.",
        );
      if (
        table === "roles" &&
        (await trx("users")
          .where({ role_id: id })
          .whereNull("deleted_at")
          .first())
      )
        fail(409, "Reassign this role’s users before deleting it.");
      await trx(table)
        .where({ id })
        .update({
          deleted_at: trx.fn.now(),
          ...(table !== "participants" ? { deleted_by: user.id } : {}),
        });
      if (table === "roles" || table === "permissions")
        await trx("role_permissions")
          .where(table === "roles" ? "role_id" : "permission_id", id)
          .whereNull("deleted_at")
          .update({ deleted_at: trx.fn.now(), deleted_by: user.id });
      return null;
    } else {
      if (table === "users") {
        if (!id && input.role_id === undefined) input.role_id = 2;
        if (
          existing?.role_id === 1 &&
          input.role_id !== undefined &&
          input.role_id !== 1
        )
          fail(409, "Super Admin accounts cannot be demoted.");
        const roleId = input.role_id ?? existing?.role_id;
        if (
          !(await trx("roles")
            .where({ id: roleId })
            .whereNull("deleted_at")
            .first())
        )
          fail(422, "Choose an active role.");
      }
      if (id)
        await trx(table)
          .where({ id })
          .update({
            ...input,
            updated_at: trx.fn.now(),
            ...(table !== "participants" ? { updated_by: user.id } : {}),
          });
      else {
        const [newId] = await trx(table).insert({
          ...input,
          ...(table !== "participants" ? { created_by: user.id } : {}),
        });
        const row = await trx(table).where({ id: newId }).first();
        return table === "users" ? safeUser(row) : row;
      }
    }
    const row = await trx(table).where({ id }).first();
    return table === "users" ? safeUser(row) : row;
  });
  return json(result, method === "POST" ? 201 : 200);
}
