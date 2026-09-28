import { test, expect } from "@playwright/test";
test("admin signs in, manages participants, roles, accounts, permissions, and branding", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Username").fill("testadmin");
  await page.getByLabel("Password").fill("Test-admin-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Participants", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add participant" }).click();
  await page.getByLabel("Full name").fill("Ayu Browser");
  await page.getByLabel("NIP", { exact: false }).fill("0012345");
  await page.getByLabel("Unit kerja").fill("Finance");
  await page.getByLabel("Phone number").fill("08123456789");
  await page.getByRole("dialog").getByLabel("Babak").fill("1");
  await page.getByLabel("Prize").fill("Bicycle");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("cell", { name: "Ayu Browser", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Prize").fill("Laptop");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("cell", { name: "Laptop", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/participants.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Archive record" }).click();
  await expect(page.getByText("No participants found")).toBeVisible();
  await page.getByLabel("Record status").selectOption("true");
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: "Restore record" }).click();
  await page.getByLabel("Record status").selectOption("false");
  await expect(page.getByRole("cell", { name: "Ayu Browser" })).toBeVisible();
  await page.getByRole("link", { name: "System settings" }).click();
  await page.getByRole("button", { name: "Roles", exact: true }).click();
  await page.getByRole("button", { name: "Add role", exact: false }).click();
  await page.getByLabel("Role name").fill("Event staff");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("cell", { name: "Event staff" })).toBeVisible();
  await page
    .getByRole("button", { name: "Role permissions", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Role", exact: true })
    .selectOption({ label: "Event staff" });
  await page.getByLabel("view_participants", { exact: true }).check();
  await page.getByRole("button", { name: "Save permissions" }).click();
  await expect(page.getByText("Role permissions saved.")).toBeVisible();
  await page.getByRole("button", { name: "Admin management" }).click();
  await page.getByRole("button", { name: "Add administrator" }).click();
  await page.getByLabel("Username").fill("eventstaff");
  await page.getByLabel("Password").fill("Eventstaff-password-123");
  await page
    .getByRole("dialog")
    .getByLabel("Role")
    .selectOption({ label: "Event staff" });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("cell", { name: "eventstaff", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "UI customization" }).click();
  await page.getByLabel("Login background").fill("#eaf0ff");
  await page.getByRole("button", { name: "Save branding" }).click();
  await expect(page.getByRole("status")).toContainText("Branding saved");
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Username").fill("eventstaff");
  await page.getByLabel("Password").fill("Eventstaff-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Ayu Browser" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add participant" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "System settings" })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Participants", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
