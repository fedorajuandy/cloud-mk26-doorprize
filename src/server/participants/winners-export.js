import ExcelJS from "exceljs";
import { authorize } from "../auth.js";
import { fail } from "../errors.js";
import { workbookResponse } from "./workbook.js";

const columns = ["full_name", "nip", "unit_kerja", "no_hp", "prize"];
export async function exportWinners({ db, user, method }) {
  authorize(user, "view_participants");
  if (method !== "GET") fail(405, "Method not allowed.");
  const records = await winnerRecords(db);
  const workbook = new ExcelJS.Workbook();
  const groups = new Map();
  const names = new Set(["history"]);
  function sheetFor(prize) {
    if (groups.has(prize)) return groups.get(prize);
    const base =
      prize
        .replace(/[\\/?*\[\]:\x00-\x1f]/g, " ")
        .replace(/^'+|'+$/g, "")
        .trim() || "Prize";
    let name = base.slice(0, 31).replace(/'+$/g, "") || "Prize";
    for (let n = 2; names.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    names.add(name.toLowerCase());
    const sheet = workbook.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = columns.map((key, i) => ({
      header: key,
      key,
      width: [32, 26, 30, 22, 36][i],
    }));
    columns.forEach((key) => {
      sheet.getColumn(key).numFmt = "@";
    });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF003D79" },
    };
    groups.set(prize, sheet);
    return sheet;
  }
  for (const record of records) sheetFor(record.prize).addRow(record);
  if (!records.length) sheetFor("Winners");
  for (const sheet of workbook.worksheets)
    sheet.autoFilter = `A1:E${sheet.rowCount}`;
  return workbookResponse(
    await workbook.xlsx.writeBuffer(),
    "winners-by-prize.xlsx",
  );
}

export async function winnerRecords(db) {
  const records = await db("participants")
    .whereNull("deleted_at")
    .where("is_invalid", false)
    .whereNotNull("prize")
    .select(columns)
    .orderBy("prize")
    .orderBy("full_name")
    .orderBy("id")
    .limit(50001);
  if (records.length > 50000)
    fail(422, "Winner export supports up to 50,000 winners.");
  return records;
}
