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
    buffer: Buffer.from(
      "unique_id,full_name,nip,unit_kerja\nbad-id,Invalid,,Finance",
    ),
  });
  await page.getByRole("button", { name: "Import file", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Nothing was imported");
  await expect(page.getByText(/Row 2 · nip/)).toBeVisible();
  const data = [
    "full_name,nip,unit_kerja,no_hp,prize,babak,sesi,unique_id",
    "Import Alpha,000001,Finance,081234,,1,1,import-alpha",
    "Import Beta,000002,Finance,081235,Laptop,2,2,import-beta",
    "Import Gamma,000003,Operations,081236,Laptop,1,1,import-gamma",
    ...Array.from(
      { length: 10 },
      (_, i) => `Import Other ${i},0001${i},Operations,,,3,1,import-other-${i}`,
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
  await page.getByLabel("Sesi", { exact: true }).fill("2");
  const filteredPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel" }).click();
  const filtered = await downloadedSheet(await filteredPromise);
  expect(filtered.rowCount).toBe(2);
  expect(filtered.getCell("B2").value).toBe("000002");
  expect(filtered.getCell("F2").value).toBe(2);
  expect(filtered.getCell("G2").value).toBe(2);
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
  sheet.addRow([
    "full_name",
    "nip",
    "unit_kerja",
    "prize",
    "babak",
    "unique_id",
  ]);
  sheet.addRow([
    "Import Excel",
    "000000123456789012",
    "Finance",
    "Tablet",
    4,
    "import-excel",
  ]);
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
  const contactRow = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: "Import Excel", exact: true }),
  });
  await contactRow.getByRole("button", { name: "Edit", exact: true }).click();
  const editDialog = page.getByRole("dialog");
  await editDialog
    .getByLabel("Email", { exact: true })
    .fill("contact@example.com");
  await editDialog
    .getByLabel("Profile picture URL", { exact: true })
    .fill("/mandiri.svg");
  await editDialog.getByRole("button", { name: /Save/ }).click();
  await expect(
    contactRow.getByRole("cell", { name: "contact@example.com", exact: true }),
  ).toBeVisible();
  await expect(
    contactRow.getByRole("img", { name: "Participant profile" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset all results", exact: true })
    .click();
  const resetDialog = page.getByRole("dialog", {
    name: "Reset all participant results",
  });
  const resetButton = resetDialog.getByRole("button", {
    name: "Reset all participant results",
    exact: true,
  });
  await expect(resetButton).toBeDisabled();
  await resetDialog
    .getByLabel("Type RESET ALL RESULTS to confirm")
    .fill("RESET ALL RESULTS");
  await resetButton.click();
  await expect(resetDialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Results reset for");
  const preserved = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: "Import Excel", exact: true }),
  });
  await expect(preserved).toBeVisible();
  await expect(
    preserved.getByRole("cell", { name: "Tablet", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Delete all participants", exact: true })
    .click();
  const purgeDialog = page.getByRole("dialog", {
    name: "Permanently delete all participants",
  });
  const purgeButton = purgeDialog.getByRole("button", {
    name: "Permanently delete all participants",
    exact: true,
  });
  await expect(purgeButton).toBeDisabled();
  await purgeDialog
    .getByLabel("Type DELETE ALL PARTICIPANTS to confirm")
    .fill("DELETE ALL PARTICIPANTS");
  await purgeButton.click();
  await expect(purgeDialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "participants permanently deleted.",
  );
  await page.getByRole("searchbox").fill("");
  await expect(page.getByText("0 records · Page 1 of 1")).toBeVisible();
  await page
    .getByRole("button", { name: "Add dummy participants", exact: true })
    .click();
  const seedDialog = page.getByRole("dialog", {
    name: "Add dummy participants",
    exact: true,
  });
  await expect(seedDialog).toContainText("Each run adds another 2,800 records");
  await seedDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("0 records · Page 1 of 1")).toBeVisible();
  await page
    .getByRole("button", { name: "Add dummy participants", exact: true })
    .click();
  await seedDialog
    .getByRole("button", { name: "Add 2,800 dummy participants", exact: true })
    .click();
  await expect(seedDialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "2,800 dummy participants added.",
  );
  await expect(page.getByText("2800 records · Page 1 of 280")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Participant 2800", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("2800 records · Page 2 of 280")).toBeVisible();
  const nameHeader = page.getByRole("columnheader", { name: /Full name/ });
  await nameHeader.getByRole("button").click();
  await expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
  await expect(page.getByText("2800 records · Page 1 of 280")).toBeVisible();
  await expect(page.locator("tbody tr").first()).toContainText(
    "Participant 0001",
  );
  await nameHeader.getByRole("button").click();
  await expect(nameHeader).toHaveAttribute("aria-sort", "descending");
  await expect(page.locator("tbody tr").first()).toContainText(
    "Participant 2800",
  );
  expect(errors).toEqual([]);
});

test("source CSV headers import into admin and registration filters work", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("testadmin");
  await page.getByLabel("Password").fill("Test-admin-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Import participants", exact: true })
    .click();
  await page.getByLabel("Participant file").setInputFiles({
    name: "source.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Kode,Nama,NIP,Telepon,Unit kerja,Line,Status,Registrasi UTC,Verifikasi UTC\nsource-browser,Ayu Source,001,08123,Finance,A,Verified,2026-09-30 08:00:00,",
    ),
  });
  await page.getByRole("button", { name: "Import file", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Line filter", { exact: true }).fill("A");
  await page
    .getByLabel("Registration status filter", { exact: true })
    .fill("Verified");
  await expect(
    page.getByRole("cell", { name: "Ayu Source", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "2026-09-30T08:00:00.000Z", exact: true }),
  ).toBeVisible();
  const row = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: "Ayu Source", exact: true }),
  });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByLabel("Registration status", { exact: true }),
  ).toHaveValue("Verified");
  await page
    .getByRole("dialog")
    .getByLabel("Invalid winner", { exact: true })
    .selectOption("1");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "Ayu Source", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Record status").selectOption("invalid");
  await expect(
    page.getByRole("cell", { name: "Ayu Source", exact: true }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Invalid winner", { exact: true })
    .selectOption("0");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "Ayu Source", exact: true }),
  ).toHaveCount(0);
});
