import { z } from "zod";
const columns = {
  participants: [
    "id",
    "unique_id",
    "is_invalid",
    "line",
    "status",
    "registered_at",
    "verified_at",
    "full_name",
    "nip",
    "unit_kerja",
    "no_hp",
    "email",
    "profile_picture",
    "prize",
    "babak",
    "sesi",
    "created_at",
    "updated_at",
  ],
  users: ["id", "username", "role_id"],
  roles: ["id", "role_name"],
  permissions: ["id", "permission_name"],
};
export function sortOptions(params, resource) {
  return {
    sort_by: z.enum(columns[resource]).parse(params.get("sort_by") ?? "id"),
    sort_order: z
      .enum(["asc", "desc"])
      .parse(params.get("sort_order") ?? "desc"),
  };
}
export function applySort(query, options, db, resource) {
  const column =
    resource === "users" && options.sort_by === "role_id"
      ? db("roles").select("role_name").whereRaw("roles.id = users.role_id")
      : options.sort_by;
  query.orderBy(column, options.sort_order);
  if (options.sort_by !== "id") query.orderBy("id", "desc");
  return query;
}
