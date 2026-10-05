import PDFDocument from "pdfkit";
import { authorize } from "../auth.js";
import { fail } from "../errors.js";
import { winnerRecords } from "./winners-export.js";
const blue = "#003D79",
  yellow = "#FFB700";
const keys = ["full_name", "nip", "unit_kerja", "no_hp", "prize"];
const widths = [135, 85, 110, 80, 101];
export async function renderWinnersPdf(records) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 42,
    autoFirstPage: false,
    info: { Title: "Family Day 2026 - Official Winner List" },
  });
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  let y,
    page = 0;
  const text = (value) => String(value ?? "").replace(/[\r\n\t]+/g, " ");
  function newPage() {
    doc.addPage();
    page++;
    doc.rect(42, 38, 511, 65).fill(blue);
    doc
      .font("Helvetica-Bold")
      .fontSize(19)
      .fillColor("white")
      .text("FAMILY DAY 2026", 58, 53);
    doc
      .font("Helvetica")
      .fontSize(10)
      .text("Memaknai Perjalanan, Tumbuh Dalam Kebersamaan", 58, 80);
    doc.rect(42, 103, 511, 3).fill(yellow);
    doc
      .font("Helvetica-Bold")
      .fontSize(19)
      .fillColor(blue)
      .text("OFFICIAL WINNER LIST", 42, 124, { width: 511, align: "center" });
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(blue)
      .text("Active, valid winners - grouped by prize", 42, 150, {
        width: 511,
        align: "center",
      });
    doc.moveTo(42, 791).lineTo(553, 791).strokeColor(yellow).stroke();
    doc
      .fontSize(7)
      .fillColor(blue)
      .text("Family Day 2026", 42, 802, { lineBreak: false });
    doc.text(`Halaman ${page}`, 480, 802, { lineBreak: false });
    y = 177;
  }
  function heading(prize, continuation = false) {
    doc.font("Helvetica-Bold").fontSize(12).fillColor(blue);
    const title = text(prize) + (continuation ? " (continued)" : "");
    const h = Math.min(44, doc.heightOfString(title, { width: 511 }));
    doc.text(title, 42, y, { width: 511, height: h, ellipsis: true });
    y += h + 7;
    doc.moveTo(42, y).lineTo(553, y).strokeColor(yellow).stroke();
    y += 6;
    doc.rect(42, y, 511, 25).fill(blue);
    let x = 42;
    keys.forEach((key, i) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("white")
        .text(key, x + 5, y + 8, { width: widths[i] - 10, lineBreak: false });
      x += widths[i];
    });
    y += 25;
  }
  newPage();
  let current = null,
    index = 0;
  for (const [position, record] of records.entries()) {
    if (record.prize !== current) {
      if (y > 650) newPage();
      current = record.prize;
      index = 0;
      heading(current);
    }
    doc.font("Helvetica").fontSize(8);
    const values = keys.map((key) => text(record[key]));
    const height = Math.min(
      140,
      Math.max(
        27,
        ...values.map(
          (v, i) => doc.heightOfString(v, { width: widths[i] - 10 }) + 12,
        ),
      ),
    );
    if (y + height > 775) {
      newPage();
      heading(current, true);
    }
    if (index % 2 === 0) doc.rect(42, y, 511, height).fill("#F0F5FA");
    let x = 42;
    values.forEach((value, i) => {
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#18354B")
        .text(value, x + 5, y + 6, {
          width: widths[i] - 10,
          height: height - 10,
          ellipsis: true,
        });
      x += widths[i];
    });
    y += height;
    index++;
    doc
      .moveTo(42, y)
      .lineTo(553, y)
      .strokeColor("#DCE5ED")
      .lineWidth(0.4)
      .stroke();
    const next = records[position + 1];
    if (next && next.prize !== current) y += 20;
  }
  if (!records.length)
    doc
      .fontSize(12)
      .fillColor(blue)
      .text("No active, valid winners to export.", 42, y);
  doc.end();
  return done;
}
export async function exportWinnersPdf({ db, user, method }) {
  authorize(user, "view_participants");
  if (method !== "GET") fail(405, "Method not allowed.");
  const buffer = await renderWinnersPdf(await winnerRecords(db));
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="winners-by-prize.pdf"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
