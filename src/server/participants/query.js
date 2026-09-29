import { sortOptions, applySort } from "../sorting.js";
import { z } from "zod";
import { fail } from "../errors.js";
const integer = (max) =>
  z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(max));
const flag = z.enum(["true", "false"]).transform((value) => value === "true");
const filterSchema = z.object({
  page: integer(1000000).default(1),
  limit: integer(100).default(20),
  deleted: flag.default(false),
  search: z.string().trim().max(255).default(""),
  without_prize: flag.default(false),
  prize: z.string().trim().min(1).max(16000).optional(),
  babak: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(0).max(4294967295))
    .optional(),
  sesi: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(0).max(4294967295))
    .optional(),
  start_date: z.iso.date().optional(),
  end_date: z.iso.date().optional(),
});
export function participantFilters(params) {
  const filters = filterSchema.parse(Object.fromEntries(params));
  if (filters.without_prize && filters.prize !== undefined)
    fail(422, "Use either without_prize=true or prize, not both.");
  if (
    filters.start_date &&
    filters.end_date &&
    filters.start_date > filters.end_date
  )
    fail(422, "start_date must not be after end_date.");
  return { ...filters, ...sortOptions(params, "participants") };
}
export function participantQuery(db, filters) {
  const query = db("participants");
  filters.deleted
    ? query.whereNotNull("deleted_at")
    : query.whereNull("deleted_at");
  if (filters.search)
    query.where((group) => {
      for (const column of [
        "unique_id",
        "full_name",
        "nip",
        "unit_kerja",
        "no_hp",
        "prize",
        "email",
      ])
        group.orWhere(column, "like", `%${filters.search}%`);
    });
  if (filters.without_prize) query.whereNull("prize");
  if (filters.prize !== undefined) query.where("prize", filters.prize);
  if (filters.sesi !== undefined) query.where("sesi", filters.sesi);
  if (filters.babak !== undefined) query.where("babak", filters.babak);
  if (filters.start_date)
    query.where("created_at", ">=", `${filters.start_date} 00:00:00`);
  if (filters.end_date) {
    const next = new Date(`${filters.end_date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    query.where(
      "created_at",
      "<",
      `${next.toISOString().slice(0, 10)} 00:00:00`,
    );
  }
  return query;
}
export async function listParticipants(db, params) {
  const filters = participantFilters(params);
  const query = participantQuery(db, filters);
  const [count, records] = await Promise.all([
    query.clone().count({ count: "*" }).first(),
    applySort(query.clone(), filters)
      .limit(filters.limit)
      .offset((filters.page - 1) * filters.limit),
  ]);
  const total = Number(count?.count || 0);
  return {
    records,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / filters.limit)),
    },
  };
}
