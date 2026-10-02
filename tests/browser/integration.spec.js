import { test, expect } from "@playwright/test";
test("Super Admin can configure integration and review status without exposing a token", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("testadmin");
  await page.getByLabel("Password").fill("Test-admin-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("link", { name: "Doorprize integration", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Doorprize integration", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Delivery worker is offline/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sync settings", exact: true }),
  ).toHaveCount(0);
  const controller = page.getByLabel("Sync controller", { exact: true });
  await expect(
    controller.getByRole("button", { name: "Test connection", exact: true }),
  ).toBeVisible();
  await expect(controller.getByText(/Connection:/).first()).toBeVisible();
  await expect(controller.getByLabel("Participant prize counts")).toContainText(
    "Without prizes:",
  );
  await expect(controller.getByLabel("Participant prize counts")).toContainText(
    "With prizes:",
  );
  await expect(
    controller.getByRole("button", {
      name: "Save integration settings",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Sync settings", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Test connection", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Claim location", { exact: true })
    .fill("Meja Pengambilan");
  await page
    .getByLabel("Participant import mode", { exact: true })
    .selectOption("create");
  await page
    .getByRole("button", { name: "Save integration settings", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Integration settings saved.",
  );
  await page.reload();
  await page
    .getByRole("link", { name: "Doorprize integration", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sync settings", exact: true })
    .click();
  await expect(page.getByLabel("Claim location", { exact: true })).toHaveValue(
    "Meja Pengambilan",
  );
  await expect(
    page.getByLabel("Participant import mode", { exact: true }),
  ).toHaveValue("create");

  await expect(
    page.getByLabel("Automatic winner delivery", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Sync controller", exact: true })
    .click();
  await expect(page.getByText("No deliveries yet.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Queue current winners", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Queue current winners", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("0 winner(s) queued");
});

test("connection test shows pending, worker-offline, success and failure beside controls", async ({
  page,
}) => {
  let connection = "Not tested",
    pending = false;
  let online = false;
  await page.route("**/api/integration/doorprize", async (route) => {
    await route.fulfill({
      json: {
        data: {
          configured: true,
          origin: "https://source.example",
          connection,
          test_pending: pending,
          retry_wait_seconds: 0,
          worker_online: online,
          settings: {
            enabled: false,
            import_mode: "link",
            claim_location: "Meja Doorprize",
            description: "",
            image_url: null,
            claim_deadline: null,
          },
          import: { status: "idle", linked: 0, created: 0, skipped: 0 },
          linked: 0,
          unmapped_winners: 0,
          queue: {},
          history: [],
          issues: [],
        },
      },
    });
  });
  await page.route("**/api/integration/doorprize/test", async (route) => {
    pending = true;
    connection = "Test queued";
    await route.fulfill({ status: 202, json: { data: { accepted: true } } });
  });
  await page.goto("/login");
  await page.getByLabel("Username").fill("testadmin");
  await page.getByLabel("Password").fill("Test-admin-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("link", { name: "Doorprize integration", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Test connection", exact: true })
    .click();
  const feedback = page.locator(".integration-feedback");
  await expect(feedback).toContainText(
    "Your test is queued and cannot run until the worker starts.",
  );
  await expect(
    page.getByRole("button", { name: "Test queued…", exact: true }),
  ).toBeDisabled();
  online = true;
  pending = false;
  connection = "Connected";
  await page
    .getByRole("button", { name: "Refresh status", exact: true })
    .click();
  await expect(feedback).toContainText("Source API and credentials verified.");
  await page
    .getByRole("button", { name: "Test connection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Test queued…", exact: true }),
  ).toBeDisabled();
  pending = false;
  connection = "Source returned HTTP 401.";
  await page
    .getByRole("button", { name: "Refresh status", exact: true })
    .click();
  await expect(feedback).toContainText("Source returned HTTP 401.");
  await expect(
    page.getByRole("button", { name: "Test connection", exact: true }),
  ).toBeEnabled();
});
