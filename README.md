# MK26 Doorprize Admin

A SolidStart 2 fullstack CMS using JavaScript, Solid, HTTP JSON API routes, Knex, and MySQL. The schema in `schema/schema.dbml` is the source of truth. The existing `utils/utility_javascript` submodule is also not a runtime dependency.

## Setup

Requires Node.js 24+ and MySQL 8+ (or compatible MariaDB). You can use either a new database or an existing database with compatible admin tables.

1. Run `npm ci`.
2. Copy `.env.example` to `.env` if you do not already have one. If using the previous project's `.env`, update it with the new settings rather than overwriting it blindly.
3. Choose an existing compatible database or create an empty MySQL database, then set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
4. Generate `JWT_SECRET` with `openssl rand -hex 32`. Set `ADMIN_USERNAME` and an `ADMIN_PASSWORD` of at least 8 characters.
5. Set `APP_ORIGIN` to the exact browser origin (default `http://localhost:6229`).
6. Run:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:6229` and sign in with the seeded account. There is no default admin password. Seeding preserves existing users, password hashes, roles, and branding. `ADMIN_PASSWORD` is only required when creating the first account; existing installations can seed participant permissions without supplying a new password. You may remove it from the environment after setup.

For local development without MySQL, set `DB_CLIENT=sqlite` and `DB_FILE=./admin.sqlite` before migrating and seeding. MySQL remains the production default. No database is changed automatically at startup.

## Repository layout

```text
config/                  Shared database configuration
migrations/              JavaScript schema migrations and indexes
seeds/                   Idempotent admin/permission initialization
scripts/                 Native Node database and browser-test runners
src/
  components/            Shared layout, modal, and CRUD UI
  features/              Participant and settings screens
  lib/                   Browser HTTP client
  routes/                Thin SolidStart page and API entrypoints
  server/
    services/            Record, role-assignment, and settings operations
    api.js               HTTP dispatch and error handling
    auth.js              Sessions and permission checks
    http.js              Bounded JSON parsing and response helpers
    validation.js        Input schemas
schema/schema.dbml       Database model
knexfile.js              Knex CLI configuration
vite.config.js           SolidStart and production-server build
```

All application code, migrations, scripts, configuration, and tests use `.js` or `.jsx`. No application transpiler is needed for database commands or API tests. `jsconfig.json` supplies editor configuration; ESLint checks JavaScript and Solid reactivity. The structure follows the separation used in `activity-tracker`, while keeping SolidStart 2 and the current API contract.

## Upgrading an existing database

Run `npm run db:migrate`, then `npm run db:seed`. The runner tracks this application's migrations in **`cms_migrations`** rather than sharing another application's migration history. It validates required columns in existing tables before creating missing tables, preserves existing records and constraints, and adds the participant indexes. Existing migration history is untouched; removed historical migration files are not needed. No application table or data is dropped. Unrelated historical database tables are not read by the application and are not automatically deleted.

If an existing table is incompatible, migration stops with the table name and missing columns before making application schema changes. Schema adoption is forward-only because rolling it back could drop pre-existing admin data. Run upgrades against a backed-up database. Re-running the migration or seed commands is supported.

## Execution efficiency

- One pooled database instance per server process; account and role authentication share a joined query, with no grant query for Super Admin.
- Permission lists are grouped in linear time. Grant replacement uses batch updates/inserts under a role lock instead of a query per permission.
- Request parsing, validation, and password hashing happen before write transactions acquire row locks.
- List queries select a bounded page; count and page queries execute independently, and user lists exclude password hashes at the SQL level.
- Participant archive/order and round filters have composite indexes. Substring search intentionally remains a portable `LIKE` query; at very large data sizes, use database-specific full-text search and cursor pagination.
- Browser searches are debounced and obsolete requests are aborted. Permission/branding panels fetch their data on demand.

## Admin features

- Participants: create, read, edit, archive, restore, search, prize/null-prize/date/round filters, and selectable server pagination.
- Import participants from Excel or CSV with row validation and an Excel template; export all matching records or the current page as XLSX.
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

Individual-record DELETE is a soft delete; the Super Admin participant purge is a permanent delete. Administrative tables record creator/updater/deleter IDs; participant timestamps follow the DBML without added actor columns. Unique values stay reserved while archived. A role with active users cannot be archived. Archiving a role or permission archives its assignments; restoring the record does not silently regrant those assignments. `system_settings` is managed as one shared configuration record. `uint(2)` for `babak` is treated as an unsigned integer (MySQL's display width does not restrict the value to two digits).

## HTTP API

See [the backend integration guide](docs/API_GUIDE.md) for authentication, complete endpoint/payload documentation, participant filters, file import/export, and copyable curl/browser examples.

Success: `{ "data": ... }`. Errors: `{ "error": { "message": "..." } }`.

| Method                  | Path                                                                               | Purpose                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| POST                    | `/api/login`                                                                       | `{username, password}`; sets the session cookie                                                 |
| POST                    | `/api/logout`                                                                      | Clears the browser cookie                                                                       |
| GET                     | `/api/me`                                                                          | Current account and permissions                                                                 |
| GET                     | `/api/settings`                                                                    | Public login branding                                                                           |
| PUT                     | `/api/settings`                                                                    | Update `{logo_url, login_bg_color}` (Super Admin)                                               |
| GET, POST               | `/api/participants`                                                                | List or create                                                                                  |
| PATCH                   | `/api/participants/batch`                                                          | Atomically update supplied fields for up to 100 participants                                    |
| GET, PUT, PATCH, DELETE | `/api/participants/:id`                                                            | Read, update, or archive                                                                        |
| PUT                     | `/api/participants/:id/restore`                                                    | Restore an archived participant                                                                 |
| GET, POST               | `/api/users`, `/api/roles`, `/api/permissions`                                     | List or create (Super Admin)                                                                    |
| GET, PUT, PATCH, DELETE | `/api/users/:id`, `/api/roles/:id`, `/api/permissions/:id`                         | Read, update, or archive                                                                        |
| PUT                     | `/api/users/:id/restore`, `/api/roles/:id/restore`, `/api/permissions/:id/restore` | Restore                                                                                         |
| GET                     | `/api/role-permissions`, `/api/role-permissions/:roleId`                           | Roles with active permission assignments                                                        |
| PUT                     | `/api/role-permissions/:roleId`                                                    | Atomically replace assignments with `{permission_ids: [1, 2]}`; use an empty list to remove all |

List endpoints accept `page` (default 1), `limit` (default 20, maximum 100), `search`, and `deleted=true`. Participants also accept `start_date`, `end_date` (YYYY-MM-DD, inclusive), `babak`, exact `prize`, `sesi`, and `without_prize=true`. Responses contain `records` and `pagination: {page, limit, total, total_pages}`. Dates are interpreted in the database's timezone. All write payloads are JSON; unknown fields are rejected. PUT/PATCH accept partial fields. A user's password can be changed with PUT `/api/users/:id` and `{password: "..."}`. Password hashes are never returned.

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
npm run lint
npm test
npm run build
npm start
```

Build on the target OS/architecture because the optional SQLite driver is native. Deploy the generated `.output` directory with environment variables; `npm start` loads the root `.env` for local deployments. Set `COOKIE_SECURE=true` under HTTPS and `APP_ORIGIN` to the public origin. Run migrations and the initial seed explicitly before serving traffic. Nitro is pinned to the current v3 beta required by the SolidStart 2 Vite integration; keep the lockfile when installing.

## Verification

```sh
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

API and migration tests run against isolated in-memory SQLite databases. Migration regressions cover an existing admin schema, unrelated migration history, preservation of rows, repeated runs, and rejection of incompatible tables. Browser tests run the **production build** on port 6339 with a temporary database, then remove it. They cover login, participant creation/edit/archive/restore, role creation and permissions, account creation, branding, dark mode, logout, and read-only role access. They do not access the database configured in `.env`. Run `npm run test:mysql` to run the same API suite through the MySQL driver. It uses connection credentials from `.env`, creates a uniquely named temporary database, and drops that database on completion; the account needs CREATE/DROP DATABASE privileges. It never uses the configured `DB_NAME`. Verify deployment credentials and schema creation in the target environment.

Framework reference: [SolidStart 2 configuration](https://docs.solidjs.com/solid-start/v2/reference/config/solid-start).

## Optional dummy participants and cleanup

Super Admins can select **Participants → Add dummy participants → Add 2,800 dummy participants**. The table refreshes and clears filters after success. Alternatively, after migration, explicitly run `npm run db:seed:dummy` to append **2,800** dummy participants. They are labeled `Participant 0001` through `2800`, have run-specific NIPs, and start with null prize, sesi, babak, and phone. Inserts are batched in one transaction. This is never run by `db:seed`, migrations, or application startup. Running it again adds another 2,800 records.

Super Admins can use **Participants → Delete all participants** and type `DELETE ALL PARTICIPANTS` to permanently remove **all** participants, including archived records, real entries, and winners, regardless of current filters. Admin accounts, roles, permissions, settings, and migration history remain intact. Participant IDs are not reset.

The equivalent CLI command is:

```sh
npm run db:purge:participants -- --confirm="DELETE ALL PARTICIPANTS"
```

Neither cleanup nor dummy seeding is automatic. These commands act on the database configured in `.env`.

Session support: run `npm run db:migrate` to add nullable `participants.sesi`. Admin forms, filters, CRUD/batch APIs, CSV/XLSX imports, templates, and exports support it. New indexes `(deleted_at, sesi, id)` and `(deleted_at, sesi, babak, id)` support session-only and session/round filtering with ID pagination; the existing babak-only index remains.

To keep participants but clear the draw results, Super Admins can use **Participants → Reset all results** and type `RESET ALL RESULTS`. This resets prize, babak, and sesi to null for all active and archived participants without deleting anyone. Filters do not restrict the reset; participant details and archive status are preserved.

Run `npm run db:migrate` for nullable participant `email` and `profile_picture` fields. Both support CRUD/batch updates, admin editing, sorting, CSV/XLSX import/export, and null defaults. Email is searchable; profile pictures use image URLs or local paths and render as thumbnails. No additional indexes are introduced for these optional display/contact fields.

`unique_id` is now required and unique for participant creation/imports. Run `npm run db:migrate` to backfill existing participants with UUIDs and add the unique constraint. Import spreadsheets must include a `unique_id` column; exports append it as column J. Dummy participants get random UUID v4 IDs. Numeric `id` remains the API route/batch identifier.

## Source-site doorprize integration

See [deployment and operation](docs/DOORPRIZE-SETUP.md) and the [source API contract](docs/DOORPRIZE-INTEGRATION.md). Configure server-only `DOORPRIZE_SOURCE_URL`/`DOORPRIZE_SOURCE_TOKEN`, migrate, and run `npm run integration:worker` as a persistent second process. Super Admin controls are under **Doorprize integration (left sidebar, below Participants)**. Participant syncing, automatic winner delivery, persistent retries, and delivery status use server-to-server HTTP; the source site notifies its participants in real time. The integration starts disabled and defaults to linking existing participants by NIP.

Source spreadsheet import accepts `Kode,Nama,NIP,Telepon,Unit kerja,Line,Status,Registrasi UTC,Verifikasi UTC`. Run `npm run db:migrate` for the optional registration fields. See the API guide's source-spreadsheet mapping; registration Status is distinct from active/archived state. The supplied header-only file must have data rows added before import.
