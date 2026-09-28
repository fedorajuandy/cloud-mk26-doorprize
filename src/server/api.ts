import type { Knex } from "knex";
import { hash } from "bcryptjs";
import { z, ZodError } from "zod";
import {
  authenticate,
  authorize,
  cookie,
  fail,
  HttpError,
  login,
  tokenFor,
} from "./auth";
import * as schemas from "./validation";
const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(
    { data },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...headers,
      },
    },
  );
const idSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .max(20);
async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    fail(415, "Use application/json.");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "A JSON body is required.");
  const decoder = new TextDecoder();
  let bytes = 0,
    raw = "";
  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 65536) {
      await reader!.cancel();
      fail(413, "Request body is too large.");
    }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  try {
    return JSON.parse(raw);
  } catch {
    return fail(400, "Invalid JSON.");
  }
}
const safeUser = (row: any) => {
  const { password, ...rest } = row;
  return rest;
};
export async function handleApi(request: Request, db: Knex): Promise<Response> {
  try {
    const url = new URL(request.url);
    const method = request.method;
    const parts = url.pathname
      .replace(/^\/api\/?/, "")
      .split("/")
      .filter(Boolean);
    const [resource, rawId, action] = parts;
    if (parts.length > 3) fail(404, "Endpoint not found.");
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const origin = request.headers.get("origin");
      if (
        (origin && origin !== (process.env.APP_ORIGIN || url.origin)) ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        fail(403, "Cross-origin requests are not allowed.");
    }
    if (resource === "login" && !rawId && method === "POST") {
      const input = z
        .object({
          username: z.string().trim().min(1).max(50),
          password: z.string().min(1).max(128),
        })
        .parse(await body(request));
      const user = await login(db, input.username, input.password);
      return json(
        { id: user.id, username: user.username, role_id: user.role_id },
        200,
        { "Set-Cookie": cookie(await tokenFor(user)) },
      );
    }
    if (resource === "logout" && !rawId && method === "POST")
      return json(null, 200, { "Set-Cookie": cookie("", true) });
    if (resource === "settings" && !rawId && method === "GET")
      return json(
        (await db("system_settings").orderBy("id").first()) || {
          logo_url: "/abracodebra.svg",
          login_bg_color: "#f3f4f6",
        },
      );
    const user = await authenticate(request, db);
    if (resource === "me" && !rawId && method === "GET") return json(user);
    if (resource === "settings" && !rawId && method === "PUT") {
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
    if (resource === "role-permissions") {
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
          .select("rp.role_id", "p.id", "p.permission_name");
        const rows = roles.map((r: any) => ({
          ...r,
          permissions: links
            .filter((p) => p.role_id === r.id)
            .map(({ role_id, ...p }) => p),
        }));
        return json(roleId ? rows[0] : rows);
      }
      if (method === "PUT" && roleId) {
        if (roleId === "1")
          fail(409, "Super Admin permissions cannot be changed.");
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
          for (const permission_id of ids) {
            const key = { role_id: roleId, permission_id };
            if (await trx("role_permissions").where(key).first())
              await trx("role_permissions").where(key).update({
                deleted_at: null,
                deleted_by: null,
                updated_at: trx.fn.now(),
                updated_by: user.id,
              });
            else
              await trx("role_permissions").insert({
                ...key,
                created_by: user.id,
              });
          }
        });
        return json({ role_id: roleId, permission_ids });
      }
      fail(405, "Method not allowed.");
    }
    const definitions = {
      participants: schemas.participant,
      users: schemas.user,
      roles: schemas.role,
      permissions: schemas.permission,
    };
    if (!Object.hasOwn(definitions, resource)) fail(404, "Endpoint not found.");
    const table = resource as keyof typeof definitions;
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
        const row = await db(table)
          .where({ id })
          .whereNull("deleted_at")
          .first();
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
      deleted
        ? query.whereNotNull("deleted_at")
        : query.whereNull("deleted_at");
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
        ] as const)
          if (url.searchParams.get(key)) {
            const date = z.iso.date().parse(url.searchParams.get(key));
            query.where(
              "created_at",
              op,
              `${date} ${key === "start_date" ? "00:00:00" : "23:59:59"}`,
            );
          }
      }
      const total = Number(
        (await query.clone().count({ count: "*" }).first())?.count || 0,
      );
      const rows = await query
        .orderBy("id", "desc")
        .limit(limit)
        .offset((page - 1) * limit);
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
        const schema = definitions[table];
        const input: any = (id ? schema.partial() : schema).parse(
          await body(request),
        );
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
          if (input.password) input.password = await hash(input.password, 12);
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
  } catch (error: any) {
    let status = 500,
      message = "Unable to complete the request.";
    if (error instanceof HttpError) {
      status = error.status;
      message = error.message;
    } else if (error instanceof ZodError) {
      status = 422;
      message = error.issues
        .map((i) => `${i.path.join(".") || "Request"}: ${i.message}`)
        .join("; ");
    } else if (
      error.code === "ER_DUP_ENTRY" ||
      error.code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      status = 409;
      message = "This value already exists, including in archived records.";
    } else {
      console.error("API request failed:", error);
    }
    return Response.json(
      { error: { message } },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
