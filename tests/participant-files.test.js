import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { testDatabase } from "./helpers/database.js";
import { seed } from "../seeds/001_admin.js";
import { handleApi } from "../src/server/api.js";
import { tokenFor } from "../src/server/auth.js";
process.env.JWT_SECRET =
  "participant-file-tests-secret-more-than-32-characters";
process.env.ADMIN_PASSWORD = "Participant-tests-password-123";
process.env.ADMIN_USERNAME = "fileadmin";
let fixture, db, cookie, viewerCookie;
const headers = ["full_name", "nip", "unit_kerja", "no_hp", "prize", "babak"];
before(async () => {
  fixture = await testDatabase();
  db = fixture.db;
  await db.migrate.latest();
  await seed(db);
  const admin = await db("users").first();
  cookie = `admin_session=${await tokenFor(admin)}`;
  const [roleId] = await db("roles").insert({ role_name: "File viewer" });
  const [userId] = await db("users").insert({
    username: "fileviewer",
    password: admin.password,
    role_id: roleId,
  });
  const permission = await db("permissions")
    .where({ permission_name: "view_participants" })
    .first();
  await db("role_permissions").insert({
    role_id: roleId,
    permission_id: permission.id,
  });
  viewerCookie = `admin_session=${await tokenFor({ id: userId, password: admin.password })}`;
});
after(async () => {
  await fixture?.close();
});
beforeEach(async () => {
  await db("participants").delete();
});
function request(path, options = {}, auth = cookie) {
  return handleApi(
    new Request(`http://localhost/api${path}`, {
      ...options,
      headers: { cookie: auth, ...options.headers },
    }),
    db,
  );
}
function upload(content, filename = "participants.csv", auth = cookie) {
  const form = new FormData();
  form.append("file", new Blob([content]), filename);
  return request("/participants/import", { method: "POST", body: form }, auth);
}
async function workbookBytes(rows, configure) {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet("Participants");
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  configure?.(sheet);
  return book.xlsx.writeBuffer();
}
async function readWorkbook(response) {
  assert.equal(
    response.status,
    200,
    response.status === 200 ? "" : await response.text(),
  );
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  return book.worksheets[0];
}
async function rows(path = "/participants?limit=100") {
  const response = await request(path);
  assert.equal(response.status, 200);
  return (await response.json()).data;
}
async function sample() {
  await db("participants").insert([
    {
      full_name: "No prize",
      nip: "0001",
      unit_kerja: "Finance",
      no_hp: "001234",
      prize: null,
      babak: 0,
      deleted_at: null,
    },
    {
      full_name: "First laptop",
      nip: "0002",
      unit_kerja: "Finance",
      no_hp: null,
      prize: "Laptop",
      babak: 1,
      deleted_at: null,
    },
    {
      full_name: "Second laptop",
      nip: "0003",
      unit_kerja: "Operations",
      no_hp: null,
      prize: "Laptop",
      babak: 2,
      deleted_at: null,
    },
    {
      full_name: "Other prize",
      nip: "0004",
      unit_kerja: "Operations",
      no_hp: null,
      prize: "Bicycle",
      babak: 2,
      deleted_at: null,
    },
    {
      full_name: "Archived",
      nip: "0005",
      unit_kerja: "Finance",
      no_hp: null,
      prize: null,
      babak: 2,
      deleted_at: db.fn.now(),
    },
  ]);
}
test("participant filters combine null prize, same prize, babak and pagination", async () => {
  await sample();
  const page = await rows("/participants?page=2&limit=2");
  assert.equal(page.pagination.total, 4);
  assert.equal(page.pagination.total_pages, 2);
  assert.equal(page.records.length, 2);
  assert.deepEqual(
    (await rows("/participants?without_prize=true")).records.map(
      (row) => row.nip,
    ),
    ["0001"],
  );
  assert.equal((await rows("/participants?prize=Laptop")).pagination.total, 2);
  assert.equal((await rows("/participants?babak=2")).pagination.total, 2);
  assert.deepEqual(
    (await rows("/participants?prize=Laptop&babak=2")).records.map(
      (row) => row.nip,
    ),
    ["0003"],
  );
  assert.equal(
    (await rows("/participants?without_prize=true&babak=0")).pagination.total,
    1,
  );
  assert.equal(
    (await rows("/participants?without_prize=true&deleted=true")).pagination
      .total,
    1,
  );
  for (const query of [
    "prize=Laptop&without_prize=true",
    "without_prize=1",
    "babak=-1",
    "limit=101",
    "page=0",
    "start_date=2026-09-29&end_date=2026-09-28",
  ])
    assert.equal((await request(`/participants?${query}`)).status, 422);
});
test("CSV import preserves text identifiers, quotes, Unicode, multiline fields and nulls", async () => {
  const response = await upload(
    '\uFEFFfull_name,nip,unit_kerja,no_hp,prize,babak\r\n"Ayu, Putri",001234567890123456,"Finance\nJakarta",08123456789,,0\r\nÉka,0002,Operations,,,\r\n',
  );
  assert.equal(response.status, 201, await response.clone().text());
  assert.equal((await response.json()).data.imported, 2);
  const imported = (await rows()).records;
  const ayu = imported.find((row) => row.full_name === "Ayu, Putri");
  assert.equal(ayu.nip, "001234567890123456");
  assert.equal(ayu.no_hp, "08123456789");
  assert.equal(ayu.prize, null);
  assert.equal(ayu.babak, 0);
  assert.equal(ayu.unit_kerja, "Finance\nJakarta");
  assert.equal(imported[0].no_hp, null);
});
test("invalid CSV rows are reported and the entire import is rejected", async () => {
  const response = await upload(
    "full_name,nip,unit_kerja,babak\nValid,001,Finance,1\nInvalid,,Finance,abc\n",
  );
  assert.equal(response.status, 422);
  const error = (await response.json()).error;
  assert.equal(error.invalid_rows, 1);
  assert.ok(
    error.details.some((issue) => issue.row === 3 && issue.field === "nip"),
  );
  assert.equal((await rows()).pagination.total, 0);
  for (const content of [
    "full_name,nip\nName,001",
    "full_name,nip,unit_kerja,nip\nName,001,Finance,002",
    "full_name,nip,unit_kerja,unexpected\nName,001,Finance,X",
    "full_name,nip,unit_kerja\n",
    'full_name,nip,unit_kerja\n"broken,001,Finance',
  ])
    assert.equal((await upload(content)).status, 422);
});
test("Excel import preserves text and zero-padded identifiers and ignores further worksheets", async () => {
  const response = await upload(
    await workbookBytes(
      [
        ["Text ID", "001234567890123456", "Finance", "08123", null, 2],
        ["Padded ID", 123, "Finance", "000456", "Laptop", 0],
      ],
      (sheet) => {
        sheet.getCell("B3").numFmt = "000000";
        sheet.workbook.addWorksheet("Ignored").addRow(["not participant data"]);
      },
    ),
    "participants.xlsx",
  );
  assert.equal(response.status, 201, await response.clone().text());
  assert.deepEqual(
    (await rows()).records.map((row) => row.nip),
    ["000123", "001234567890123456"],
  );
});
test("Excel formulas and lossy numeric identifiers are rejected without partial inserts", async () => {
  const response = await upload(
    await workbookBytes([
      ["Valid", "001", "Finance"],
      [
        "Formula",
        "002",
        "Finance",
        null,
        { formula: '"Laptop"', result: "Laptop" },
        1,
      ],
    ]),
    "participants.xlsx",
  );
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.details[0].row, 3);
  assert.equal((await rows()).pagination.total, 0);
  assert.equal(
    (
      await upload(
        await workbookBytes([["Large ID", 1234567890123456, "Finance"]]),
        "participants.xlsx",
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await upload(
        await workbookBytes([], (sheet) => {
          sheet.getCell("A1").value = {
            formula: '"full_name"',
            result: "full_name",
          };
        }),
        "participants.xlsx",
      )
    ).status,
    422,
  );
  assert.equal(
    (await upload("not a workbook", "participants.xlsx")).status,
    422,
  );
});
test("upload limits, file formats, method checks and role permissions are enforced", async () => {
  assert.equal((await upload("x", "file.xls")).status, 415);
  assert.equal((await upload("x".repeat(5 * 1024 * 1024 + 1))).status, 413);
  const large =
    "full_name,nip,unit_kerja\n" +
    Array.from({ length: 5001 }, (_, i) => `Name,${i},Finance`).join("\n");
  assert.equal((await upload(large)).status, 422);
  assert.equal(
    (
      await upload(
        "full_name,nip,unit_kerja\nName,001,Finance",
        "data.csv",
        viewerCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/participants/import", { method: "GET" })).status,
    405,
  );
  assert.equal((await request("/participants/export", {}, "")).status, 401);
  assert.equal(
    (await request("/participants/import-template", {}, viewerCookie)).status,
    403,
  );
  assert.equal(
    (await request("/participants/export", {}, viewerCookie)).status,
    200,
  );
});
test("Excel export uses the same filters, supports all/page scopes and produces a reusable template", async () => {
  await sample();
  let sheet = await readWorkbook(
    await request("/participants/export?prize=Laptop&babak=2"),
  );
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.getCell("B2").value, "0003");
  assert.equal(sheet.getCell("E2").value, "Laptop");
  sheet = await readWorkbook(
    await request("/participants/export?without_prize=true&babak=0"),
  );
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.getCell("D2").value, "001234");
  assert.equal(sheet.getCell("F2").value, 0);
  sheet = await readWorkbook(
    await request("/participants/export?page=2&limit=1&scope=page"),
  );
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.getCell("B2").value, "0003");
  sheet = await readWorkbook(
    await request("/participants/export?page=2&limit=1"),
  );
  assert.equal(sheet.rowCount, 5);
  sheet = await readWorkbook(
    await request("/participants/export?search=missing"),
  );
  assert.equal(sheet.rowCount, 1);
  const template = await request("/participants/import-template");
  assert.match(
    template.headers.get("content-disposition"),
    /participants-template.xlsx/,
  );
  sheet = await readWorkbook(template);
  assert.deepEqual(sheet.getRow(1).values.slice(1), headers);
  assert.equal(sheet.getColumn(2).numFmt, "@");
  assert.equal(
    (await request("/participants/export?scope=invalid")).status,
    422,
  );
  assert.equal(
    (await request("/participants/export?without_prize=true&prize=Laptop"))
      .status,
    422,
  );
});
test("Excel export writes formula-looking participant text as text, not formulas", async () => {
  await db("participants").insert({
    full_name: "=1+1",
    nip: "000123",
    unit_kerja: "@Finance",
    prize: '=HYPERLINK("https://example.com")',
  });
  const sheet = await readWorkbook(await request("/participants/export"));
  assert.equal(sheet.getCell("A2").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("A2").value, "=1+1");
  assert.equal(sheet.getCell("E2").formula, undefined);
  assert.equal(sheet.getCell("B2").value, "000123");
});

function batchUpdate(updates, auth = cookie) {
  return request(
    "/participants/batch",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ updates }),
    },
    auth,
  );
}
test("batch updates preserve omitted fields and support distinct assignments, null and zero", async () => {
  await sample();
  const before = await db("participants").whereNull("deleted_at").orderBy("id");
  const response = await batchUpdate([
    { id: before[0].id, prize: "Travel", babak: 3 },
    { id: String(before[1].id), prize: null },
    { id: before[2].id, babak: 0 },
    { id: before[3].id, prize: "Travel", babak: 3 },
  ]);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).data.updated, 4);
  const after = await db("participants").whereNull("deleted_at").orderBy("id");
  for (let i = 0; i < before.length; i++) {
    for (const field of [
      "full_name",
      "nip",
      "no_hp",
      "unit_kerja",
      "created_at",
      "deleted_at",
    ])
      assert.deepEqual(after[i][field], before[i][field]);
  }
  assert.equal(after[0].prize, "Travel");
  assert.equal(after[0].babak, 3);
  assert.equal(after[1].prize, null);
  assert.equal(after[1].babak, before[1].babak);
  assert.equal(after[2].babak, 0);
  assert.equal(after[2].prize, before[2].prize);
  assert.equal(after[3].prize, "Travel");
  assert.equal(
    (await batchUpdate([{ id: before[0].id, babak: null }])).status,
    200,
  );
  assert.equal(
    (await db("participants").where({ id: before[0].id }).first()).babak,
    null,
  );
});
test("batch updates reject invalid, missing, archived and unauthorized records atomically", async () => {
  await sample();
  const before = await db("participants").orderBy("id");
  const id = before[0].id;
  for (const updates of [
    [],
    [{ id }],
    [
      { id, prize: "Changed" },
      { id: String(id), babak: 2 },
    ],
    [{ id, babak: -1 }],
    [{ id, babak: "2" }],
    [{ id, full_name: null }],
    [{ id, deleted_at: null }],
    [{ id: 0, prize: "Changed" }],
    [
      { id, prize: "Changed" },
      { id: before[1].id, babak: -1 },
    ],
    Array.from({ length: 101 }, (_, i) => ({ id: i + 1, babak: 2 })),
  ])
    assert.equal((await batchUpdate(updates)).status, 422);
  for (const missingId of [999999, before.at(-1).id])
    assert.equal(
      (
        await batchUpdate([
          { id, prize: "Changed" },
          { id: missingId, babak: 2 },
        ])
      ).status,
      404,
    );
  assert.equal(
    (await batchUpdate([{ id, babak: 2 }], viewerCookie)).status,
    403,
  );
  assert.equal((await batchUpdate([{ id, babak: 2 }], "")).status, 401);
  assert.equal((await request("/participants/batch")).status, 405);
  assert.deepEqual(await db("participants").orderBy("id"), before);
});
