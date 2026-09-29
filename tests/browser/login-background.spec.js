import { test, expect } from "@playwright/test";
test("login background setting saves an image and falls back to color when cleared", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("testadmin");
  await page.getByLabel("Password").fill("Test-admin-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "System settings" }).click();
  await page
    .getByRole("button", { name: "UI customization", exact: true })
    .click();
  await page
    .getByLabel("Login background image URL", { exact: true })
    .fill("/mandiri.svg");
  await page.getByLabel("Login background", { exact: true }).fill("#123456");
  await page
    .getByRole("button", { name: "Save branding", exact: true })
    .click();
  await expect(page.getByText(/Branding saved/)).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator(".login-page")).toHaveCSS(
    "background-image",
    /mandiri\.svg/,
  );
  await expect(page.locator(".login-page")).toHaveCSS(
    "background-color",
    "rgb(18, 52, 86)",
  );
  await page.getByLabel("Username").fill("testadmin");
  await page.getByLabel("Password").fill("Test-admin-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "System settings" }).click();
  await page
    .getByRole("button", { name: "UI customization", exact: true })
    .click();
  await page.getByLabel("Login background image URL", { exact: true }).fill("");
  await page
    .getByRole("button", { name: "Save branding", exact: true })
    .click();
  await expect(page.getByText(/Branding saved/)).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator(".login-page")).toHaveCSS(
    "background-image",
    "none",
  );
  await expect(page.locator(".login-page")).toHaveCSS(
    "background-color",
    "rgb(18, 52, 86)",
  );
});
