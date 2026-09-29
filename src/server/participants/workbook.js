import ExcelJS from "exceljs";
export const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const participantColumns = [
  { header: "full_name", key: "full_name", width: 32 },
  { header: "nip", key: "nip", width: 26 },
  { header: "unit_kerja", key: "unit_kerja", width: 30 },
  { header: "no_hp", key: "no_hp", width: 22 },
  { header: "prize", key: "prize", width: 36 },
  { header: "babak", key: "babak", width: 12 },
  { header: "sesi", key: "sesi", width: 12 },
];
export function createParticipantWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mandiri Carnaval 2026 Admin";
  const sheet = workbook.addWorksheet("Participants", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = participantColumns;
  for (const key of ["full_name", "nip", "unit_kerja", "no_hp", "prize"])
    sheet.getColumn(key).numFmt = "@";
  const header = sheet.getRow(1);
  header.height = 26;
  header.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2866D5" },
  };
  header.alignment = { vertical: "middle" };
  sheet.autoFilter = "A1:G1";
  return { workbook, sheet };
}
export function workbookResponse(buffer, filename) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
