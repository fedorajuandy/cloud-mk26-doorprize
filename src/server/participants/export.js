import { applySort } from "../sorting.js";
import { authorize } from "../auth.js";
import { fail } from "../errors.js";
import { participantFilters, participantQuery } from "./query.js";
import {
  createParticipantWorkbook,
  participantColumns,
  workbookResponse,
} from "./workbook.js";
const EXPORT_LIMIT = 10000;
export async function exportParticipants({ db, user, url, method }) {
  authorize(user, "view_participants");
  if (method !== "GET") fail(405, "Method not allowed.");
  const scope = url.searchParams.get("scope") || "all";
  if (!["all", "page"].includes(scope)) fail(422, "scope must be all or page.");
  const filters = participantFilters(url.searchParams);
  const query = applySort(participantQuery(db, filters), filters).select(
    participantColumns.map((c) => c.key),
  );
  if (scope === "page")
    query.limit(filters.limit).offset((filters.page - 1) * filters.limit);
  else query.limit(EXPORT_LIMIT + 1);
  const records = await query;
  if (records.length > EXPORT_LIMIT)
    fail(
      422,
      `Export exceeds ${EXPORT_LIMIT} records. Narrow your filters or export individual pages.`,
    );
  const { workbook, sheet } = createParticipantWorkbook();
  for (const record of records) {
    const row = sheet.addRow(record);
    row.alignment = { vertical: "top", wrapText: true };
  }
  sheet.autoFilter = `A1:G${Math.max(1, sheet.rowCount)}`;
  return workbookResponse(
    await workbook.xlsx.writeBuffer(),
    "participants.xlsx",
  );
}
export async function importTemplate({ user, method }) {
  authorize(user, "create_participants");
  if (method !== "GET") fail(405, "Method not allowed.");
  const { workbook } = createParticipantWorkbook();
  return workbookResponse(
    await workbook.xlsx.writeBuffer(),
    "participants-template.xlsx",
  );
}
