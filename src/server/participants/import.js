import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { authorize } from "../auth.js";
import { HttpError, fail } from "../errors.js";
import { json, readBytes } from "../http.js";
import { participant } from "../validation.js";
import { validateWorkbookArchive } from "./archive.js";
const MAX_FILE = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const fields = ["full_name", "nip", "unit_kerja", "no_hp", "prize", "babak"];
const aliases = {
  full_name: "full_name",
  nama: "full_name",
  nama_lengkap: "full_name",
  nip: "nip",
  unit_kerja: "unit_kerja",
  no_hp: "no_hp",
  phone_number: "no_hp",
  prize: "prize",
  hadiah: "prize",
  babak: "babak",
  round: "babak",
};
const metadata = new Set(["id", "created_at", "updated_at", "deleted_at"]);
function headerName(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}
function headers(values) {
  if (values.length > 32) fail(422, "Use at most 32 columns.");
  const seen = new Set();
  const keys = values.map((value) => {
    const name = headerName(value);
    if (!name) return null;
    const key = Object.hasOwn(aliases, name)
      ? aliases[name]
      : metadata.has(name)
        ? name
        : null;
    if (!key) fail(422, `Unrecognized column: ${String(value).slice(0, 100)}.`);
    if (seen.has(key)) fail(422, `Duplicate column: ${key}.`);
    seen.add(key);
    return key;
  });
  for (const required of ["full_name", "nip", "unit_kerja"])
    if (!seen.has(required)) fail(422, `Missing required column: ${required}.`);
  return keys;
}
function cellText(cell, key) {
  const value = cell?.value;
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (["nip", "no_hp"].includes(key)) {
      if (
        !Number.isSafeInteger(value) ||
        value < 0 ||
        String(value).length > 15
      )
        throw new Error(
          "Store NIP and phone numbers as Excel Text cells to preserve every digit.",
        );
      return /^0+$/.test(cell.numFmt || "")
        ? String(value).padStart(cell.numFmt.length, "0")
        : String(value);
    }
    return String(value);
  }
  if (typeof value === "object" && value.richText)
    return value.richText.map((part) => part.text).join("");
  if (
    typeof value === "object" &&
    value.hyperlink &&
    typeof value.text === "string"
  )
    return value.text;
  throw new Error(
    "Use plain text or numbers; formulas, dates, booleans, and error cells are not supported.",
  );
}
async function parseUpload(file) {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (/\.csv$/i.test(file.name)) {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      fail(422, "CSV must use UTF-8 encoding.");
    }
    let rows;
    try {
      rows = parse(text, {
        bom: true,
        skip_empty_lines: true,
        max_record_size: 65536,
        to: MAX_ROWS + 2,
      });
    } catch {
      fail(
        422,
        "Invalid CSV. Use comma-separated UTF-8 data with quoted fields where needed.",
      );
    }
    if (!rows.length) fail(422, "The file is empty.");
    const keys = headers(rows[0]);
    return {
      keys,
      rows: rows.slice(1).map((values, i) => ({
        number: i + 2,
        values: keys.map((key, index) => () => values[index] ?? ""),
      })),
    };
  }
  try {
    await validateWorkbookArchive(buffer);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail(422, "Invalid Excel file. Upload an unencrypted .xlsx workbook.");
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    fail(422, "Invalid Excel file. Upload an unencrypted .xlsx workbook.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) fail(422, "The workbook has no worksheet.");
  if (sheet.rowCount > MAX_ROWS + 1)
    fail(
      422,
      `Import accepts at most ${MAX_ROWS} rows on the first worksheet.`,
    );
  if (sheet.columnCount > 32) fail(422, "Use at most 32 columns.");
  let headerValues;
  try {
    headerValues = Array.from({ length: sheet.columnCount }, (_, i) =>
      cellText(sheet.getRow(1).getCell(i + 1)),
    );
  } catch (error) {
    fail(422, `Invalid header row: ${error.message}`);
  }
  const keys = headers(headerValues);
  const rows = [];
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    rows.push({
      number,
      values: keys.map((key, i) => () => cellText(row.getCell(i + 1), key)),
    });
  });
  return { keys, rows };
}
export async function importParticipants({ db, user, request, method }) {
  authorize(user, "create_participants");
  if (method !== "POST") fail(405, "Method not allowed.");
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().startsWith("multipart/form-data;"))
    fail(415, "Upload multipart/form-data with a file field.");
  const buffer = await readBytes(request, MAX_FILE + 65536);
  let form;
  try {
    form = await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": type },
      body: buffer,
    }).formData();
  } catch {
    fail(400, "Invalid multipart upload.");
  }
  const files = form.getAll("file");
  if (files.length !== 1 || typeof files[0] === "string" || !files[0]?.name)
    fail(422, "Upload exactly one file in the file field.");
  const file = files[0];
  if (!/\.(xlsx|csv)$/i.test(file.name))
    fail(
      415,
      "Supported formats are .xlsx and .csv. Save older .xls files as .xlsx first.",
    );
  if (file.size > MAX_FILE) fail(413, "File exceeds the 5 MB upload limit.");
  if (!file.size) fail(422, "The file is empty.");
  const { keys, rows } = await parseUpload(file);
  if (rows.length > MAX_ROWS)
    fail(422, `Import accepts at most ${MAX_ROWS} rows.`);
  const records = [],
    errors = [];
  let invalidRows = 0;
  for (const row of rows) {
    let rowInvalid = false;
    const record = {},
      raw = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (metadata.has(key)) continue;
      try {
        const value = row.values[i]().trim();
        raw.push(value);
        if (!key && value) throw new Error("A populated column has no header.");
        if (fields.includes(key))
          record[key] =
            key === "babak"
              ? value === ""
                ? null
                : /^\d+$/.test(value)
                  ? Number(value)
                  : value
              : value || null;
      } catch (error) {
        rowInvalid = true;
        if (errors.length < 50)
          errors.push({
            row: row.number,
            field: key || "header",
            message: error.message,
          });
      }
    }
    if (!rowInvalid && raw.every((value) => value === "")) continue;
    const result = participant.safeParse(record);
    if (!result.success) {
      rowInvalid = true;
      for (const issue of result.error.issues)
        if (errors.length < 50)
          errors.push({
            row: row.number,
            field: issue.path.join("."),
            message: issue.message,
          });
    }
    if (rowInvalid) invalidRows++;
    else
      records.push({ no_hp: null, prize: null, babak: null, ...result.data });
  }
  if (invalidRows)
    return Response.json(
      {
        error: {
          message: `${invalidRows} invalid row(s). Nothing was imported.`,
          details: errors,
          invalid_rows: invalidRows,
        },
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  if (!records.length) fail(422, "The file has no participant rows to import.");
  await db.transaction(async (trx) => {
    for (let i = 0; i < records.length; i += 100)
      await trx("participants").insert(records.slice(i, i + 100));
  });
  return json({ imported: records.length, mode: "append" }, 201);
}
