import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../src/server/db";
import * as initial from "../database/migrations/001_schema";
import mysql, { type Connection } from "mysql2/promise";
import { randomBytes } from "node:crypto";
import { seed } from "../database/seed";
import { handleApi } from "../src/server/api";
const useMysql = process.env.MYSQL_TEST === "1";
const testDatabaseName = `mk26_test_${randomBytes(8).toString("hex")}`;
let mysqlAdmin: Connection | undefined;
if (useMysql) process.env.DB_NAME = testDatabaseName;
process.env.DB_CLIENT = useMysql ? "mysql2" : "sqlite";
process.env.DB_FILE = ":memory:";
process.env.JWT_SECRET = "test-only-secret-at-least-thirty-two-characters";
process.env.ADMIN_PASSWORD = "Test-admin-password-123";
process.env.ADMIN_USERNAME = "testadmin";
const db = createDatabase();
let adminCookie = "",
  operatorCookie = "";
async function request(
  path: string,
  method = "GET",
  data?: unknown,
  cookie = adminCookie,
  extra: Record<string, string> = {},
) {
  const response = await handleApi(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", cookie, ...extra },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    }),
    db,
  );
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
before(async () => {
  if (useMysql) {
    mysqlAdmin = await mysql.createConnection({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
    await mysqlAdmin.query(
      `CREATE DATABASE \`${testDatabaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  }
  const config = {
    migrationSource: {
      getMigrations: async () => ["001_schema"],
      getMigrationName: (name: unknown) => String(name),
      getMigration: async () => initial,
    },
  };
  await db.migrate.latest(config);
  // A second run must leave all existing tables and data intact.
  assert.deepEqual((await db.migrate.latest(config))[1], []);
  await seed(db);
  const result = await request("/login", "POST", {
    username: "testadmin",
    password: process.env.ADMIN_PASSWORD,
  });
  assert.equal(result.status, 200);
  adminCookie = result.cookie;
});
after(async () => {
  await db.destroy();
  if (mysqlAdmin) {
    await mysqlAdmin.query(`DROP DATABASE IF EXISTS \`${testDatabaseName}\``);
    await mysqlAdmin.end();
  }
});
test("authentication, origin checks, and safe user responses", async () => {
  assert.equal(
    (await request("/participants", "GET", undefined, "")).status,
    401,
  );
  assert.equal(
    (
      await request("/login", "POST", {
        username: "testadmin",
        password: "incorrect",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/participants", "POST", {}, adminCookie, {
        origin: "https://evil.example",
      })
    ).status,
    403,
  );
  const users = await request("/users");
  assert.equal(users.status, 200);
  assert.equal("password" in users.body.data.records[0], false);
  assert.equal((await request("/me")).body.data.role_name, "Super Admin");
});
test("participant lifecycle, validation, filters, pagination and archive", async () => {
  assert.equal(
    (await request("/participants", "POST", { full_name: "" })).status,
    422,
  );
  const data = {
    full_name: "Ayu Test",
    nip: "000123",
    unit_kerja: "Finance",
    no_hp: "081234",
    prize: null,
    babak: 0,
  };
  const created = await request("/participants", "POST", data);
  assert.equal(created.status, 201);
  const id = created.body.data.id;
  assert.equal((await request(`/participants/${id}`)).body.data.nip, "000123");
  assert.equal(
    (
      await request(`/participants/${id}`, "PUT", {
        prize: "Bicycle",
        babak: 2,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/participants?search=Ayu&babak=2&limit=1")).body.data
      .pagination.total,
    1,
  );
  assert.equal(
    (await request("/participants?babak=0")).body.data.pagination.total,
    0,
  );
  assert.equal((await request("/participants?page=-1")).status, 422);
  assert.equal((await request(`/participants/${id}`, "DELETE")).status, 200);
  assert.equal((await request(`/participants/${id}`)).status, 404);
  assert.equal(
    (await request("/participants?deleted=true")).body.data.records.length,
    1,
  );
  assert.equal(
    (await request(`/participants/${id}/restore`, "PUT")).status,
    200,
  );
  assert.equal(
    (await request(`/participants/${id}`)).body.data.prize,
    "Bicycle",
  );
  assert.equal(
    (await request("/participants/999999", "PUT", { prize: "None" })).status,
    404,
  );
  assert.equal(
    (await request("/participants", "POST", { ...data, babak: -1 })).status,
    422,
  );
});
test("role permissions, least privilege, and transactional role assignment", async () => {
  const role = await request("/roles", "POST", { role_name: "Read only" });
  const rid = role.body.data.id;
  const permission = (await request("/permissions")).body.data.records.find(
    (p: any) => p.permission_name === "view_participants",
  );
  assert.equal(
    (
      await request(`/role-permissions/${rid}`, "PUT", {
        permission_ids: [permission.id],
      })
    ).status,
    200,
  );
  const created = await request("/users", "POST", {
    username: "viewer",
    password: "Viewer-password-123",
    role_id: rid,
  });
  assert.equal(created.status, 201);
  const uid = created.body.data.id;
  operatorCookie = (
    await request("/login", "POST", {
      username: "viewer",
      password: "Viewer-password-123",
    })
  ).cookie;
  assert.equal(
    (await request("/participants", "GET", undefined, operatorCookie)).status,
    200,
  );
  assert.equal(
    (
      await request(
        "/participants",
        "POST",
        { full_name: "No", nip: "1", unit_kerja: "No" },
        operatorCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/users", "GET", undefined, operatorCookie)).status,
    403,
  );
  assert.equal(
    (
      await request(`/role-permissions/${rid}`, "PUT", {
        permission_ids: [999999],
      })
    ).status,
    422,
  );
  assert.equal(
    (await request(`/role-permissions/${rid}`)).body.data.permissions.length,
    1,
  );
  assert.equal((await request(`/roles/${rid}`, "DELETE")).status, 409);
  await request(`/role-permissions/${rid}`, "PUT", { permission_ids: [] });
  assert.equal(
    (await request("/participants", "GET", undefined, operatorCookie)).status,
    403,
  );
  const passwordChange = await request(`/users/${uid}`, "PUT", {
    password: "Changed-password-123",
  });
  assert.equal(passwordChange.status, 200);
  assert.equal(
    passwordChange.body.data.role_id,
    rid,
    "Password-only updates preserve the assigned role",
  );
  assert.equal(
    (await request("/me", "GET", undefined, operatorCookie)).status,
    401,
  );
  assert.equal((await request("/roles/1", "DELETE")).status, 409);
  assert.equal((await request("/users/1", "DELETE")).status, 409);
  assert.equal((await request("/users/1", "PUT", { role_id: 2 })).status, 409);
  assert.equal((await request(`/users/${uid}`, "DELETE")).status, 200);
  assert.equal((await request(`/roles/${rid}`, "DELETE")).status, 200);
});
test("permission registry and branding CRUD", async () => {
  const result = await request("/permissions", "POST", {
    permission_name: "custom_action",
  });
  const id = result.body.data.id;
  assert.equal(result.status, 201);
  assert.equal(
    (
      await request("/permissions", "POST", {
        permission_name: "custom_action",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/permissions/${id}`, "PUT", {
        permission_name: "custom_updated",
      })
    ).status,
    200,
  );
  assert.equal((await request(`/permissions/${id}`, "DELETE")).status, 200);
  assert.equal(
    (await request(`/permissions/${id}/restore`, "PUT")).status,
    200,
  );
  assert.equal(
    (
      await request("/settings", "PUT", {
        logo_url: "javascript:alert(1)",
        login_bg_color: "#ffffff",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request("/settings", "PUT", {
        logo_url: "/logo.svg",
        login_bg_color: "#123456",
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/settings", "GET", undefined, "")).body.data.login_bg_color,
    "#123456",
  );
  const logout = await request("/logout", "POST");
  assert.equal(logout.status, 200);
  assert.equal(logout.cookie, "admin_session=");
});
