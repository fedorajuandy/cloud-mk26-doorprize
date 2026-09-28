# MK26 Doorprize Admin

A SolidStart 2 fullstack CMS using TypeScript, Solid, HTTP JSON API routes, Knex, and MySQL. The schema in `schema/schema.dbml` is the source of truth. The old projects are retained under `legacy/` for reference; they are not built or served. The existing `utils/utility_javascript` submodule is also not a runtime dependency.

## Setup

Requires Node.js 24+ and MySQL 8+. Use a **new database** for this application. The migration creates the six DBML tables; it does not modify or import an existing Wishes installation.

1. Run `npm ci`.
2. Copy `.env.example` to `.env` if you do not already have one. If using the previous project's `.env`, update it with the new settings rather than overwriting it blindly.
3. Create an empty MySQL database and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
4. Generate `JWT_SECRET` with `openssl rand -hex 32`. Set `ADMIN_USERNAME` and an `ADMIN_PASSWORD` of at least 12 characters.
5. Set `APP_ORIGIN` to the exact browser origin (default `http://localhost:6229`).
6. Run:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:6229` and sign in with the seeded account. There is no default admin password. Seeding preserves existing users and passwords. You may remove `ADMIN_PASSWORD` from the environment after setup.

For local development without MySQL, set `DB_CLIENT=sqlite` and `DB_FILE=./admin.sqlite` before migrating and seeding. MySQL remains the production default. No database is changed automatically at startup.

## Admin features

- Participants: create, read, edit, archive, restore, search, date/round filters, and server pagination.
- All participant fields: full name, NIP, unit kerja, phone number (`no_hp`), prize, and round (`babak`). NIP and phone numbers remain strings so leading zeros are preserved.
- Administrators: create accounts, assign roles, update passwords, archive, and restore.
- Roles and permission registry CRUD, plus a permission-assignment checklist.
- Branding: logo URL and login background color.
- Light/dark mode, error feedback, empty states, and confirmation dialogs.

Only admin CMS pages are served. There are no phone/tablet submission pages, public registration pages, live displays, WebSocket connections, or SSE endpoints. Browser operations use same-origin `fetch` calls to `/api`.

## Authorization and data rules

Login issues an eight-hour signed HttpOnly, SameSite=Strict cookie. Passwords use bcrypt and must be 12–72 characters and at most 72 UTF-8 bytes. Every protected API request reloads the account, role, and permissions from the database, so permission changes take effect immediately. Changing a password invalidates existing sessions for that account. Logout clears the browser cookie; JWTs are stateless and are otherwise valid until expiry or a password/account change. Login attempts are limited per username in each server process; use shared gateway throttling when deploying multiple replicas.

Role ID 1 is the protected Super Admin role and has full access. Role ID 2 is the built-in Administrator role. Both role records are protected. Super Admin accounts cannot be demoted or archived, and an administrator cannot archive their own account. System settings, accounts, roles, and the permission registry require Super Admin. Participant access uses:

- `view_participants`
- `create_participants`
- `update_participants`
- `delete_participants`

The initial Administrator role receives all four. New roles receive no permissions until assigned. Additional registry keys can be stored, but have no application effect unless implemented in server authorization rules.

DELETE is a soft delete. Administrative tables record creator/updater/deleter IDs; participant timestamps follow the DBML without added actor columns. Unique values stay reserved while archived. A role with active users cannot be archived. Archiving a role or permission archives its assignments; restoring the record does not silently regrant those assignments. `system_settings` is managed as one shared configuration record. `uint(2)` for `babak` is treated as an unsigned integer (MySQL's display width does not restrict the value to two digits).

## HTTP API

Success: `{ "data": ... }`. Errors: `{ "error": { "message": "..." } }`.

| Method                  | Path                                                                               | Purpose                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| POST                    | `/api/login`                                                                       | `{username, password}`; sets the session cookie                                                 |
| POST                    | `/api/logout`                                                                      | Clears the browser cookie                                                                       |
| GET                     | `/api/me`                                                                          | Current account and permissions                                                                 |
| GET                     | `/api/settings`                                                                    | Public login branding                                                                           |
| PUT                     | `/api/settings`                                                                    | Update `{logo_url, login_bg_color}` (Super Admin)                                               |
| GET, POST               | `/api/participants`                                                                | List or create                                                                                  |
| GET, PUT, PATCH, DELETE | `/api/participants/:id`                                                            | Read, update, or archive                                                                        |
| PUT                     | `/api/participants/:id/restore`                                                    | Restore an archived participant                                                                 |
| GET, POST               | `/api/users`, `/api/roles`, `/api/permissions`                                     | List or create (Super Admin)                                                                    |
| GET, PUT, PATCH, DELETE | `/api/users/:id`, `/api/roles/:id`, `/api/permissions/:id`                         | Read, update, or archive                                                                        |
| PUT                     | `/api/users/:id/restore`, `/api/roles/:id/restore`, `/api/permissions/:id/restore` | Restore                                                                                         |
| GET                     | `/api/role-permissions`, `/api/role-permissions/:roleId`                           | Roles with active permission assignments                                                        |
| PUT                     | `/api/role-permissions/:roleId`                                                    | Atomically replace assignments with `{permission_ids: [1, 2]}`; use an empty list to remove all |

List endpoints accept `page` (default 1), `limit` (default 20, maximum 100), `search`, and `deleted=true`. Participants also accept `start_date`, `end_date` (YYYY-MM-DD, inclusive), and `babak`. Responses contain `records` and `pagination: {page, limit, total, total_pages}`. Dates are interpreted in the database's timezone. All write payloads are JSON; unknown fields are rejected. PUT/PATCH accept partial fields. A user's password can be changed with PUT `/api/users/:id` and `{password: "..."}`. Password hashes are never returned.

Example participant payload:

```json
{
  "full_name": "Ayu Pratama",
  "nip": "00012345",
  "unit_kerja": "Finance",
  "no_hp": "08123456789",
  "prize": null,
  "babak": null
}
```

`full_name`, `nip`, and `unit_kerja` are required. Optional fields can be null. NIP is not unique because the supplied DBML does not require uniqueness. Large participant IDs should be treated as opaque strings by API consumers.

## Production

```sh
npm run typecheck
npm test
npm run build
npm start
```

Build on the target OS/architecture because the optional SQLite driver is native. Deploy the generated `.output` directory with environment variables; `npm start` loads the root `.env` for local deployments. Set `COOKIE_SECURE=true` under HTTPS and `APP_ORIGIN` to the public origin. Run migrations and the initial seed explicitly before serving traffic. Nitro is pinned to the current v3 beta required by the SolidStart 2 Vite integration; keep the lockfile when installing.

## Verification

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

API tests run against an isolated in-memory SQLite database. Browser tests run the **production build** on port 6339 with a temporary database, then remove it. They cover login, participant creation/edit/archive/restore, role creation and permissions, account creation, branding, dark mode, logout, and read-only role access. They do not access the database configured in `.env`. Run `npm run test:mysql` to run the same API suite through the MySQL driver. It uses connection credentials from `.env`, creates a uniquely named temporary database, and drops that database on completion; the account needs CREATE/DROP DATABASE privileges. It never uses the configured `DB_NAME`. Verify deployment credentials and schema creation in the target environment.

Framework reference: [SolidStart 2 configuration](https://docs.solidjs.com/solid-start/v2/reference/config/solid-start).
