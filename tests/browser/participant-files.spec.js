import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
async function downloadedSheet(download) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await download.path());
  return workbook.worksheets[0];
}
test("participant file import, shared filters, Excel export and theme indicator", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await page.getByLabel("Username").fill("testadmin");
  await page.getByLabel("Password").fill("Test-admin-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Participants", exact: true }),
  ).toBeVisible();
  const theme = page.getByRole("switch", { name: "Dark mode" });
  await expect(theme).toHaveAttribute("aria-checked", "false");
  await expect(theme).toContainText("Light mode");
  await theme.click();
  await expect(theme).toHaveAttribute("aria-checked", "true");
  await expect(theme).toContainText("Dark mode");
  await page.reload();
  await expect(theme).toHaveAttribute("aria-checked", "true");
  await theme.click();

  await page
    .getByRole("button", { name: "Import participants", exact: true })
    .click();
  const templatePromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Excel template" }).click();
  const template = await templatePromise;
  expect(template.suggestedFilename()).toBe("participants-template.xlsx");
  expect((await downloadedSheet(template)).getCell("B1").value).toBe("nip");
  await page.getByLabel("Participant file").setInputFiles({
    name: "invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("full_name,nip,unit_kerja\nInvalid,,Finance"),
  });
  await page.getByRole("button", { name: "Import file", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Nothing was imported");
  await expect(page.getByText(/Row 2 · nip/)).toBeVisible();
  const data = [
    "full_name,nip,unit_kerja,no_hp,prize,babak",
    "Import Alpha,000001,Finance,081234,,1",
    "Import Beta,000002,Finance,081235,Laptop,2",
    "Import Gamma,000003,Operations,081236,Laptop,1",
    ...Array.from(
      { length: 10 },
      (_, i) => `Import Other ${i},0001${i},Operations,,,3`,
    ),
  ];
  await page.getByLabel("Participant file").setInputFiles({
    name: "participants.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(data.join("\n")),
  });
  await page.getByRole("button", { name: "Import file", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "13 participants imported",
  );
  await page.getByRole("searchbox").fill("Import");
  await page.getByLabel("Prize filter").selectOption("none");
  await page.getByLabel("Babak", { exact: true }).fill("1");
  await expect(
    page.getByRole("cell", { name: "Import Alpha", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Import Beta", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Prize filter").selectOption("exact");
  await page.getByLabel("Prize name").fill("Laptop");
  await page.getByLabel("Babak", { exact: true }).fill("2");
  await expect(
    page.getByRole("cell", { name: "Import Beta", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Import Gamma", exact: true }),
  ).toHaveCount(0);
  const filteredPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel" }).click();
  const filtered = await downloadedSheet(await filteredPromise);
  expect(filtered.rowCount).toBe(2);
  expect(filtered.getCell("B2").value).toBe("000002");
  expect(filtered.getCell("F2").value).toBe(2);
  await page.screenshot({
    path: "test-results/participant-file-controls.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("searchbox").fill("Import");
  await page.getByLabel("Rows per page").selectOption("10");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("13 records · Page 2 of 2")).toBeVisible();
  await page.getByLabel("Export scope").selectOption("page");
  const pagePromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel" }).click();
  expect((await downloadedSheet(await pagePromise)).rowCount).toBe(4);

  await page
    .getByRole("button", { name: "Import participants", exact: true })
    .click();
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet("Participants");
  sheet.addRow(["full_name", "nip", "unit_kerja", "prize", "babak"]);
  sheet.addRow(["Import Excel", "000000123456789012", "Finance", "Tablet", 4]);
  await page.getByLabel("Participant file").setInputFiles({
    name: "participants.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await book.xlsx.writeBuffer()),
  });
  await page.getByRole("button", { name: "Import file", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "1 participants imported",
  );
  await page.getByRole("searchbox").fill("Import Excel");
  await expect(
    page.getByRole("cell", { name: "000000123456789012" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
