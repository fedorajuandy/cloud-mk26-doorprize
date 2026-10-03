# Mandiri Carnaval 2026 Doorprize — HTTP API guide

This guide is for teams integrating with the participant/admin backend. All routes are served by the same SolidStart application as the admin CMS. Set the base URL to the deployed application origin; local examples use `http://localhost:6230`.

## Authentication

Sign in with an existing admin account. The response sets an `admin_session` cookie. New JWTs have no expiry by default (`JWT_TTL_SECONDS=0`); set a positive lifetime in seconds to enable expiry, e.g. `28800` for eight hours. The browser cookie lasts up to 400 days in non-expiring mode; clearing browser cookies still requires signing in again. Existing tokens retain their original expiry—sign in again after deployment. Send that cookie on subsequent requests. Passwords and JWT secrets are never returned. There is no separate bearer-token endpoint.

```sh
BASE_URL="http://localhost:6230"
COOKIE_JAR="$(mktemp)"

curl --fail-with-body -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"YOUR_PASSWORD"}' \
  "$BASE_URL/api/login"

curl --fail-with-body -b "$COOKIE_JAR" "$BASE_URL/api/me"
```

For browser code on the same origin, use `fetch('/api/...', { credentials: 'same-origin' })`. The session cookie is HttpOnly. Cross-origin browser writes are rejected; use a same-origin integration or a server-side client with a cookie jar. The API does not enable cross-origin CORS access. Configure the application's `APP_ORIGIN` to its public origin and use HTTPS with `COOKIE_SECURE=true` in production.

`POST /api/logout` clears the caller's browser cookie. Password changes invalidate that account's existing sessions. Each authenticated request reads the current account and permissions, so archived accounts/roles and permission changes take effect immediately.

| Action                                                                | Required permission     |
| --------------------------------------------------------------------- | ----------------------- |
| List/read participants, export XLSX                                   | `view_participants`     |
| Create participants, import files, download import template           | `create_participants`   |
| Update/restore participants                                           | `update_participants`   |
| Archive participants                                                  | `delete_participants`   |
| Admin users, roles, permission registry, assignments, branding writes | Super Admin (role ID 1) |

Super Admin has all permissions. Public endpoints are login, logout, and GET `/api/settings` (login branding).

## Response conventions

JSON success responses use `{ "data": ... }`. Create and import endpoints return `201`; other successful JSON operations return `200`. Binary Excel downloads return an XLSX body instead of JSON.

Errors use:

```json
{ "error": { "message": "You do not have permission to do this." } }
```

| Status | Meaning                                                 |
| ------ | ------------------------------------------------------- |
| 400    | Malformed JSON/multipart body, or missing body          |
| 401    | Missing/invalid/expired session or invalid login        |
| 403    | Insufficient permission or disallowed request origin    |
| 404    | Unknown endpoint or missing/archived record             |
| 405    | HTTP method not supported                               |
| 409    | Duplicate unique value or protected/referenced record   |
| 413    | Request/file exceeds a size limit                       |
| 415    | Unsupported content type or file extension              |
| 422    | Invalid fields, filters, import rows, or export size    |
| 429    | Too many login attempts                                 |
| 503    | Session-signing configuration unavailable               |
| 500    | Unexpected server/database failure; inspect server logs |

Send JSON with `Content-Type: application/json`. Upload files as multipart, and let the HTTP client generate its boundary. JSON bodies are limited to 64 KiB. All database IDs should be treated as opaque values; participant IDs can be returned as strings by MySQL to preserve large integer precision.

## Participant fields

| Field        | Type           | Rules                                                               |
| ------------ | -------------- | ------------------------------------------------------------------- |
| `id`         | Integer/string | Server-generated; cannot be set by CRUD/import                      |
| `full_name`  | String         | Required, nonblank, at most 255 characters                          |
| `nip`        | String         | Required, nonblank, at most 255 characters; preserves leading zeros |
| `unit_kerja` | String         | Required, nonblank, at most 255 characters                          |
| `no_hp`      | String/null    | Optional, at most 20 characters; phone number                       |
| `prize`      | String/null    | Optional, at most 16,000 characters                                 |
| `babak`      | Integer/null   | Optional, 0–4,294,967,295 inclusive                                 |
| `sesi`       | Integer/null   | Optional, 0–4,294,967,295 inclusive                                 |
| `created_at` | Timestamp      | Server-managed                                                      |
| `updated_at` | Timestamp/null | Server-managed                                                      |
| `deleted_at` | Timestamp/null | Archive timestamp                                                   |

Blank optional strings become null. NIP is **not unique** in the supplied schema. Different unique IDs can share a NIP; reusing a unique ID is rejected. The API does not silently merge, deduplicate, or overwrite by NIP.

## List participants: pagination and filters

`GET /api/participants`

All filters are optional. Records are ordered by descending `id`. Only active participants are included unless `deleted=true` is supplied.

| Query parameter | Default      | Meaning                                                                                 |
| --------------- | ------------ | --------------------------------------------------------------------------------------- |
| `page`          | `1`          | Page number, 1–1,000,000                                                                |
| `limit`         | `20`         | Records per page, 1–100                                                                 |
| `without_prize` | `false`      | `true` returns only SQL NULL prizes; `false` leaves prize unrestricted                  |
| `prize`         | Unrestricted | Equality comparison for one prize name; URL-encode spaces/special characters            |
| `babak`         | Unrestricted | One round, including `0`                                                                |
| `sesi`          | Unrestricted | One session, including `0`                                                              |
| `search`        | Empty        | Substring search across name, NIP, unit kerja, phone, and prize; maximum 255 characters |
| `start_date`    | Unrestricted | Inclusive created date, `YYYY-MM-DD`                                                    |
| `end_date`      | Unrestricted | Inclusive created date, `YYYY-MM-DD`                                                    |
| `deleted`       | `false`      | `true` lists archived records instead of active records                                 |

When multiple filters are present, **all must match**. `prize=Laptop&babak=2` returns participants whose prize is Laptop and whose round is 2. Either filter can also be used alone. `without_prize=true&babak=2` is supported. Combining `without_prize=true` with `prize` is contradictory and returns `422`.

`without_prize=true` means SQL NULL, not the text `"null"` or an empty string already stored by another system. To filter a literal prize named `null`, use `prize=null`. Prize equality follows the database collation (typically case-insensitive in MySQL); it is not substring matching. Date filters use the database's stored timezone. `start_date` must not be after `end_date`. Boolean query values must be `true` or `false`. SQL wildcard characters `%` and `_` retain their search wildcard meaning.

Examples:

```sh
# 3: all active participants, page 2, 50 records per page
curl --fail-with-body -b "$COOKIE_JAR" \
  "$BASE_URL/api/participants?page=2&limit=50"

# 4: participants without a prize
curl --fail-with-body -b "$COOKIE_JAR" \
  "$BASE_URL/api/participants?without_prize=true&page=1&limit=100"

# 5: same prize and round (omit either query parameter to use only the other)
curl --fail-with-body -b "$COOKIE_JAR" --get \
  --data-urlencode 'prize=Laptop' --data-urlencode 'babak=2' \
  --data-urlencode 'page=1' --data-urlencode 'limit=50' \
  "$BASE_URL/api/participants"
```

Example response:

```json
{
  "data": {
    "records": [
      {
        "id": "42",
        "full_name": "Ayu Pratama",
        "nip": "000123456789012345",
        "unit_kerja": "Finance",
        "no_hp": "08123456789",
        "prize": "Laptop",
        "babak": 2,
        "created_at": "2026-09-28T10:00:00.000Z",
        "updated_at": null,
        "deleted_at": null
      }
    ],
    "pagination": { "page": 1, "limit": 50, "total": 1, "total_pages": 1 }
  }
}
```

`total` counts matching records before pagination. An empty result has `records: []`, `total: 0`, and `total_pages: 1`. An out-of-range page is empty; the API does not silently change the requested page. Iterate through `total_pages` to read the entire collection.

## Participant CRUD

| Method    | Route                           | Description                                     |
| --------- | ------------------------------- | ----------------------------------------------- |
| POST      | `/api/participants`             | Create a participant                            |
| GET       | `/api/participants/:id`         | Read an active participant                      |
| PUT/PATCH | `/api/participants/:id`         | Update supplied fields only                     |
| DELETE    | `/api/participants/:id`         | Archive, preserving the row                     |
| PUT       | `/api/participants/:id/restore` | Restore an archived participant; no body needed |

```sh
curl --fail-with-body -b "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d '{"unique_id":"participant-001","full_name":"Ayu Pratama","nip":"000123","unit_kerja":"Finance","no_hp":"08123456789","prize":null,"babak":null}' \
  "$BASE_URL/api/participants"

curl --fail-with-body -b "$COOKIE_JAR" -X PATCH \
  -H 'Content-Type: application/json' -d '{"prize":"Laptop","babak":2}' \
  "$BASE_URL/api/participants/42"
```

Creation and updates return the participant in `data`. Archiving returns `{"data":null}`. Unknown body fields are rejected. Individual deletes are soft deletes; the Super Admin-only purge endpoint below permanently deletes all participants.

## Batch participant updates

`PATCH /api/participants/batch` requires `update_participants` permission and the same authenticated session as individual updates.

Send an `updates` array containing 1–100 objects. Each object must have a unique participant `id` (positive integer or decimal string) and at least one field to change. The JSON request must fit within 64 KiB.

```sh
curl --fail-with-body -b "$COOKIE_JAR" -X PATCH \
  "$BASE_URL/api/participants/batch" \
  -H 'Content-Type: application/json' \
  -d '{"updates":[{"id":101,"babak":2,"prize":"Laptop"},{"id":102,"babak":2,"prize":"Laptop"},{"id":103,"prize":null}]}'
```

```json
{ "data": { "updated": 3, "ids": ["101", "102", "103"] } }
```

- Omitted fields remain unchanged. For example, supplying only `babak` preserves the existing prize and personal details.
- Explicit `null` clears `prize`, `babak`, `sesi`, or `no_hp`; `babak: 0` sets round zero. Blank prize/phone strings also become null, matching individual updates.
- Other editable participant fields (`full_name`, `nip`, `unit_kerja`, `no_hp`) are optional and use the same validation as individual updates. Required text fields cannot be cleared.
- Numeric IDs and timestamps cannot be changed. `updated_at` is set automatically for each targeted record. Unknown fields, duplicate IDs, empty updates, and invalid values return `422`.
- Every ID must identify an active participant. A missing or archived participant returns `404`.
- The entire batch is atomic: any validation or database failure leaves all participants unchanged. No records are inserted. Success counts targeted records, including assignments that already had the requested value.
- Use separate requests for more than 100 participants; atomicity applies to each request independently.

## Import participants from Excel or CSV

`POST /api/participants/import`

Send exactly one file in the multipart field `file`. Supported formats are `.xlsx` and comma-separated UTF-8 `.csv` (UTF-8 BOM accepted). Older `.xls` files must first be saved as `.xlsx`. Limits: 20 MiB file size, 50,000 data rows, 32 columns, and 100 MiB expanded XLSX archive. The total multipart request must fit within 20 MiB plus 64 KiB. XLSX imports read the **first worksheet**, with headers in row 1. Fully blank data rows are skipped.

Download the empty Excel template:

```sh
curl --fail-with-body -b "$COOKIE_JAR" \
  "$BASE_URL/api/participants/import-template" -o participants-template.xlsx
```

Required headers: `unique_id`, `full_name`, `nip`, `unit_kerja`.

Optional headers: `no_hp`, `prize`, `babak`, `sesi`, `email`, `profile_picture`, `line`, `status`, `registered_at`, `verified_at`.

Headers are case-insensitive and spaces/hyphens normalize to underscores, so `Full name`, `Unit kerja`, and `Phone number` work. Additional aliases: `nama`/`nama_lengkap` → `full_name`, `phone_number` → `no_hp`, `hadiah` → `prize`, `round` → `babak`, `session` → `sesi`. `id`, `created_at`, `updated_at`, and `deleted_at` columns are ignored if present. Other unknown or duplicate columns are rejected.

Example CSV:

```csv
full_name,nip,unit_kerja,no_hp,prize,babak,unique_id
Ayu Pratama,000123456789012345,Finance,08123456789,,,participant-001
"Budi, Santoso",000456,Operations,08129876543,Laptop,2,participant-002
```

Store unique IDs, NIP and phone numbers as **text** in Excel. Numeric identifiers longer than 15 digits are rejected because Excel may already have lost precision. Simple zero-padding number formats are recognized, but text is preferred. Blank optional cells become null. Formulas, dates, booleans, and error cells are not accepted as participant values; paste values as text/numbers first. CSV text is preserved literally and is never evaluated as a formula. Quotes, commas inside quoted fields, and multiline quoted CSV fields are supported. CSV validation row numbers refer to parsed records including the header; XLSX row numbers refer to worksheet rows.

```sh
curl --fail-with-body -b "$COOKIE_JAR" \
  -F 'file=@participants.xlsx' "$BASE_URL/api/participants/import"

curl --fail-with-body -b "$COOKIE_JAR" \
  -F 'file=@participants.csv' "$BASE_URL/api/participants/import"
```

Success (`201`):

```json
{ "data": { "imported": 250, "mode": "append" } }
```

Imports are **append-only and transactional**. Existing records are unchanged. All rows are validated before any insert; any invalid row means nothing is imported. Uploading the same unique IDs again returns `409` and imports nothing. Newly imported records are active and get new IDs/timestamps. There is no upsert or overwrite mode.

Row validation failure (`422`):

```json
{
  "error": {
    "message": "1 invalid row(s). Nothing was imported.",
    "invalid_rows": 1,
    "details": [
      {
        "row": 3,
        "field": "nip",
        "message": "Invalid input: expected string, received null"
      }
    ]
  }
}
```

At most 50 field errors are returned; `invalid_rows` counts all invalid rows. The admin import dialog shows these errors and allows a corrected file to be selected.

## Export filtered participants as Excel

`GET /api/participants/export`

Accepts the **same filters** as GET `/api/participants`, plus:

| Parameter | Default | Meaning                                                                     |
| --------- | ------- | --------------------------------------------------------------------------- |
| `scope`   | `all`   | `all` exports all matching rows; `page` applies the supplied `page`/`limit` |

`scope=all` ignores page boundaries, but validates any supplied `page`/`limit`. It exports at most 10,000 rows; larger results return `422` without silently truncating. Narrow the filters or use `scope=page` to download successive pages. An empty result still returns a valid workbook with headers.

```sh
# All active participants
curl --fail-with-body -b "$COOKIE_JAR" \
  "$BASE_URL/api/participants/export" -o participants.xlsx

# All participants without a prize
curl --fail-with-body -b "$COOKIE_JAR" \
  "$BASE_URL/api/participants/export?without_prize=true" -o without-prize.xlsx

# Same prize and round
curl --fail-with-body -b "$COOKIE_JAR" --get \
  --data-urlencode 'prize=Laptop' --data-urlencode 'babak=2' \
  "$BASE_URL/api/participants/export" -o laptop-round-2.xlsx

# Page 2 of the same filtered collection
curl --fail-with-body -b "$COOKIE_JAR" --get \
  --data-urlencode 'prize=Laptop' --data-urlencode 'babak=2' \
  --data-urlencode 'scope=page' --data-urlencode 'page=2' --data-urlencode 'limit=50' \
  "$BASE_URL/api/participants/export" -o laptop-round-2-page-2.xlsx
```

Response headers:

```text
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="participants.xlsx"
Cache-Control: no-store
```

The workbook contains the fifteen participant input fields in the same order as the import template. Numeric database IDs and audit timestamps are omitted; `unique_id` is included. NIP/phone values are exported as Excel text, blank prizes remain blank, and strings beginning with `=` are written as text rather than executable formulas. The header is frozen, columns have readable widths, and Excel filtering is enabled. Exported files can be imported again, subject to the import limits; this requires unique IDs not already present in the target database.

## Admin/system endpoints

These routes support the existing admin CMS. They require Super Admin except GET `/api/settings`.

| Methods                 | Route                           | Payload/purpose                                                                     |
| ----------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| GET, POST               | `/api/users`                    | List or create `{username, password, role_id}`; default role ID 2                   |
| GET, PUT, PATCH, DELETE | `/api/users/:id`                | Read/update/archive; password omitted from responses                                |
| PUT                     | `/api/users/:id/restore`        | Restore an account                                                                  |
| GET, POST               | `/api/roles`                    | List or create `{role_name}`                                                        |
| GET, PUT, PATCH, DELETE | `/api/roles/:id`                | Read/update/archive                                                                 |
| PUT                     | `/api/roles/:id/restore`        | Restore a role                                                                      |
| GET, POST               | `/api/permissions`              | List or create `{permission_name}`                                                  |
| GET, PUT, PATCH, DELETE | `/api/permissions/:id`          | Read/update/archive                                                                 |
| PUT                     | `/api/permissions/:id/restore`  | Restore a permission                                                                |
| GET                     | `/api/role-permissions`         | All active roles with their active permission arrays                                |
| GET                     | `/api/role-permissions/:roleId` | One role with its permissions                                                       |
| PUT                     | `/api/role-permissions/:roleId` | Atomically replace grants with `{permission_ids:[1,2]}`; empty array removes grants |
| GET                     | `/api/settings`                 | Current `logo_url`, `favicon_url`, and `login_bg_color` settings                    |
| PUT                     | `/api/settings`                 | `{logo_url:"/logo.svg", favicon_url:"/mandiri.svg", login_bg_color:"#f3f4f6"}`      |

User/role/permission list routes accept `page`, `limit`, `search`, and `deleted=true` and use the same `records`/`pagination` response structure. User passwords must contain 8–72 characters and at most 72 UTF-8 bytes; change a password with PUT `/api/users/:id` and `{password:"NEW_PASSWORD"}`. Roles 1 and 2 are protected. Super Admin accounts cannot be demoted/archived, and the current account cannot archive itself. A role with active users cannot be archived. Permission names use lowercase letters, digits, and underscores, beginning with a letter. Logo URLs must be a local absolute path or HTTPS URL; background colors must be six-digit hex values.

## Browser example

```js
// Authentication already performed on the same application origin.
const params = new URLSearchParams({
  prize: "Laptop",
  babak: "2",
  page: "1",
  limit: "50",
});
const response = await fetch(`/api/participants?${params}`, {
  credentials: "same-origin",
});
const payload = await response.json();
if (!response.ok) throw new Error(payload.error.message);
console.log(payload.data.records, payload.data.pagination);

const form = new FormData();
form.append("file", document.querySelector("input[type=file]").files[0]);
const imported = await fetch("/api/participants/import", {
  method: "POST",
  credentials: "same-origin",
  body: form,
}); // Do not manually set multipart Content-Type.
console.log(await imported.json());
```

Favicon settings accept local image paths outside `/api/` or HTTPS URLs. `favicon_url` is optional on PUT; omitting it preserves the current icon. The default is `/mandiri.svg`. Public `GET /api/favicon` redirects to the saved icon with `Cache-Control: no-store`, so it works on the login page too. In admin, change **System settings → UI customization → Browser tab icon URL**. Saving refreshes the current tab icon; other tabs use the new icon on their next page load. Use a version query (e.g. `/favicon.png?v=2`) when replacing an image at the same URL.

## Permanently delete all participants

`DELETE /api/participants/purge` is available to **Super Admins only**, with the normal session and origin checks. Send:

```json
{ "confirmation": "DELETE ALL PARTICIPANTS" }
```

Success: `{"data":{"deleted":2800}}`. The count is zero if already empty. This is a hard delete of every participant, including archived records and winners; filters do not restrict it and records cannot be restored. Admin accounts, roles, permissions, settings, and migration history are preserved. IDs are not reset. Missing/incorrect confirmation returns `422`; non-Super Admin accounts return `403`.

The ordinary `DELETE /api/participants/:id` remains a soft delete. The optional 2,800-row dummy seeder is available in the admin UI and via `npm run db:seed:dummy` (see README).

## Add dummy participants

`POST /api/participants/seed-dummy` requires a Super Admin session and an empty JSON object `{}`. Returns `201` with `{"data":{"inserted":2800}}` after all inserts commit. This appends 2,800 labeled dummy participants with unused five-digit dummy NIPs (`00001`–`99999`) and null prize/babak/sesi/phone. Existing records remain unchanged. Each request appends another batch; requests are not automatically deduplicated. Existing five-digit NIPs, including archived ones, are skipped. If fewer than 2,800 are available, the request returns `409` without inserting records. Unknown fields return `422`, other methods `405`, and non-Super Admins `403`. The normal origin checks apply. The admin UI exposes this under **Participants → Add dummy participants**.

## Participant sessions (`sesi`)

`sesi` is an optional nullable unsigned integer (0–4,294,967,295), independent of `babak`. Existing participants and older imports default to null. Create, PUT/PATCH, and batch updates accept `sesi`; omitting it preserves the existing value on updates, while explicit null clears it. MySQL `uint(2)` does not limit the value to two digits.

Use `GET /api/participants?sesi=1&babak=2&prize=Laptop` for winners in a specific session/round/prize, or `GET /api/participants?sesi=1&without_prize=true` for eligible participants in a session. All supplied filters combine with AND; omitting `sesi` includes all sessions. The same filters apply to `/api/participants/export`.

CSV/XLSX imports accept optional `sesi` (alias `session`), with blank cells treated as null. Excel templates and exports append `sesi` as column G, preserving the prior six columns. Dummy participants start with null sesi. A batch winner assignment can be sent as:

```json
{ "updates": [{ "id": 101, "sesi": 1, "babak": 2, "prize": "Laptop" }] }
```

## Reset all participant results

`POST /api/participants/reset-results` requires a Super Admin session. Send `{"confirmation":"RESET ALL RESULTS"}`. One atomic update sets `prize`, `babak`, and `sesi` to null and `is_invalid` to false for **all participants, including archived records**, regardless of filters. Participant details and archive status remain unchanged; changed rows receive a new `updated_at`. Active participants become eligible for draws again.

Returns `200` with `{"data":{"updated":2800}}`, counting rows whose results changed. Repeating the reset returns zero if prize, babak, and sesi are already null and is_invalid is false. Incorrect confirmation returns `422`; non-Super Admins receive `403`. The admin action is **Participants → Reset all results** and requires typing `RESET ALL RESULTS` before confirming.

## Sorting lists and exports

List routes support `sort_by` and `sort_order=asc|desc` (defaults: `id`, `desc`). Participant sort fields: `id`, `unique_id`, `full_name`, `nip`, `unit_kerja`, `no_hp`, `email`, `profile_picture`, `line`, `status`, `registered_at`, `verified_at`, `prize`, `sesi`, `babak`, `created_at`, `updated_at`. Other lists allow `id` plus `username`/`role_id` for users, `role_name` for roles, or `permission_name` for permissions. User `role_id` sorts by the displayed role name. Unsupported fields or directions return `422`.

Sorting happens before pagination. Ties use descending ID for stable page boundaries. Numeric fields sort numerically; NIP and phone remain text. Nulls follow database ordering (first ascending, last descending on supported MySQL/SQLite). Participant exports accept the same sort parameters, including current-page exports. Example: `/api/participants?sesi=1&sort_by=full_name&sort_order=asc&page=1&limit=100`.

Admin table data-column headers toggle ascending/descending order and return to page 1. Arrows and accessible sort state indicate the current direction. The Actions column is not sortable.

## Participant email and profile picture

- `email`: optional valid email address, at most 255 characters; null or blank clears it. It is not unique. Participant search includes email.
- `profile_picture`: optional image URL (HTTP/HTTPS) or local absolute path such as `/photos/participant.png`, at most 16,000 characters; null or blank clears it. Data URLs, protocol-relative URLs, and executable schemes are rejected. This field stores a reference, not an uploaded image or base64 content.

Both fields are returned by participant APIs and supported in create, PUT/PATCH, and batch updates. Omitted values preserve existing data during updates; old records/imports and dummy records default to null. Resetting draw results preserves both fields. Admin forms allow editing them and the table shows a lazy-loaded picture thumbnail with an unavailable-image fallback. Sorting supports both fields (pictures sort by their stored path).

CSV/XLSX imports accept optional `email` and `profile_picture` headers. Templates and exports append these as columns H and I, keeping the original seven columns intact. Exports contain picture URLs as text, not embedded images. Example:

```json
{
  "updates": [
    {
      "id": 101,
      "email": "person@example.com",
      "profile_picture": "https://example.com/photos/101.png"
    }
  ]
}
```

## Required participant unique IDs

`unique_id` is required on creation and CSV/XLSX import: a nonblank string up to 255 characters. Surrounding whitespace is trimmed; leading zeros are preserved. Imported IDs need not be UUIDs. Format Excel identifiers as Text to avoid numeric precision loss. The database enforces uniqueness, including archived participants; comparisons follow the database collation. Duplicate IDs within a file or already in the database return `409` and roll back the entire import. Imports append, never upsert by unique ID.

The admin form requires Unique ID. APIs return it, search includes it, and `sort_by=unique_id` is supported. It may be changed through PUT/PATCH or batch updates, subject to uniqueness; omitting it preserves the value, and null/blank is rejected. Existing numeric `id` remains the route and batch identifier. Resetting results preserves unique IDs.

Templates/exports append `unique_id` as text in column J. Spreadsheet imports require a `unique_id` header; old files must add this column. The migration backfills missing IDs on existing participants with random UUID v4 values before adding the NOT NULL constraint and unique index. Dummy seeding generates a fresh random UUID v4 for each participant.

## Login background image

Settings include nullable `login_bg_image` (maximum 2,048 characters), accepting a local absolute image path or HTTPS URL. Super Admins can save it through `PUT /api/settings` alongside the existing branding fields. Omission preserves the saved image; blank or null clears it. Public `GET /api/settings` returns it for the login page. The image covers the area behind the sign-in card; `login_bg_color` remains the fallback when no image is configured or the image cannot load. Admin: **System settings → UI customization → Login background image URL**. The branding preview uses the same image/color settings.

## Source-site synchronization

See [Doorprize integration setup](DOORPRIZE-SETUP.md) for control routes and deployment. Existing single/batch winner updates atomically queue source publication when enabled and linked; API success confirms local persistence, not remote acknowledgment. The source provides only ID/NIP, and accepts awards rather than mutable participant prize fields. Local reset/purge does not revoke queued or published source awards. Source credentials are backend-only and separate from roulette browser authentication.

## Source registration spreadsheet

The source CSV headers map as follows (CSV and XLSX both supported):

| Source header  | Participant API/database field                               |
| -------------- | ------------------------------------------------------------ |
| Kode           | `unique_id` (required, unique text; preserves leading zeros) |
| Nama           | `full_name` (required)                                       |
| NIP            | `nip` (required text)                                        |
| Telepon        | `no_hp` (optional text)                                      |
| Unit kerja     | `unit_kerja` (required)                                      |
| Line           | `line` (optional text, max 255)                              |
| Status         | `status` (optional text, max 100)                            |
| Registrasi UTC | `registered_at` (optional UTC timestamp)                     |
| Verifikasi UTC | `verified_at` (optional UTC timestamp)                       |

`status` is the source registration status, independent of CMS `deleted_at`/archive state. No enum is imposed because the supplied sample contains headers only. Both registration timestamps are separate from CMS-created/updated timestamps. They accept ISO 8601 timestamps with offsets, or `YYYY-MM-DD HH:mm:ss[.SSS]` interpreted as UTC; supported Excel date cells also work. Values normalize to `YYYY-MM-DDTHH:mm:ss.sssZ` and are stored/exported as text consistently across MySQL and SQLite. Blank optional values become null; malformed dates reject the entire import. Canonical English import headers continue to work.

CRUD/batch APIs accept the four new optional fields; omission preserves them on updates. Source HTTP synchronization (which only returns ID/NIP) and dummy seeding leave them null for new rows. Resetting draw results preserves them. List/export filters accept exact `line` and `status`, combined with existing filters. Search includes both text fields and sorting supports all four fields. New indexes `(deleted_at, line, id)` and `(deleted_at, status, id)` support these filtered pages. Templates and Excel exports append `line`, `status`, `registered_at`, `verified_at` as columns K–N; earlier columns retain their positions.

## Invalid winners

Participants have `is_invalid` (non-null boolean, default `false`). Set it with participant create/update or `PATCH /api/participants/batch`, for example `{"updates":[{"id":123,"is_invalid":true}]}`. Omitted values remain unchanged on updates. Invalidating retains the prize, babak, sesi, and participant details; set `false` to restore eligibility.

List and Excel export default to `is_invalid=false`, excluding absent/disqualified participants from valid winner results and draw candidates. Use `is_invalid=true` to review invalid records, or `is_invalid=all` for both. This combines with prize, babak, sesi, search, archive, registration, pagination, and sorting filters. `deleted` remains independent. The admin Record status selector includes **Invalid winners**; Archived records includes both validity states. Edit **Invalid winner** to mark or restore a record.

Excel export uses the same filters and sorting as the table. `scope=all` exports all matching rows (maximum 10,000); `scope=page` exports the current page. The appended `is_invalid` column supports round-trip import: CSV accepts `true`/`false` or `1`/`0`, XLSX also accepts boolean cells, and blank/omitted defaults to false. JSON APIs require actual booleans. Dummy and source-created participants default to false.

Reset all results clears prize/babak/sesi and sets is_invalid to false, making active disqualified participants eligible again. Invalid participants are excluded from newly queued source awards and unmapped-winner counts. Existing queued or published awards are not revoked by invalidation; corrections to those awards must be handled on the source site.

Deploy migration `010_participant_invalid.js` with `npm run db:migrate`. Existing participants become valid by default. Composite indexes cover archive/validity pagination and babak/sesi filtering.

### Scoped winner reset

`POST /api/participants/reset-results` (Super Admin) accepts `confirmation: "RESET ALL RESULTS"` and a `scope`:

- `all` (default): no filter fields; preserves the existing reset-all request.
- `prize`: requires `prize` (nonblank exact prize name).
- `babak`: requires `babak` (nonnegative integer).
- `sesi`: requires `sesi` (nonnegative integer).
- `specific`: requires `prize`, `babak`, and `sesi`; all must match.

Example: `{"confirmation":"RESET ALL RESULTS","scope":"specific","prize":"Laptop","babak":1,"sesi":2}`.

Matching participants have prize/babak/sesi cleared and `is_invalid=false`, including archived participants. Details and archive status are preserved. Only matching integration links have their last-prize markers cleared. Queued/published source awards remain unchanged. The response contains `data.updated` (changed participants). The admin reset dialog supplies its own scope independently of table filters; missing scoped fields or extra fields return 422.

Admin reset options, in order: **Semua hasil** (`all`), **Per babak** (`babak`), **Per hadiah dalam babak** (`babak_prize`), **Per sesi dalam hadiah dan babak** (`specific`). The older standalone `prize` and `sesi` API scopes remain supported for compatibility but are no longer shown in admin.

For a prize within a round, POST `/api/participants/reset-results` with `{"confirmation":"RESET ALL RESULTS","scope":"babak_prize","babak":1,"prize":"Hadiah B"}`. Both fields are required; matching participants across all sesi are reset. Other prizes and other babak remain unchanged.

### Winners by prize workbook

`GET /api/participants/export-winners` requires `view_participants`. Downloads `winners-by-prize.xlsx` with one worksheet per prize and exactly `full_name`, `nip`, `unit_kerja`, `no_hp`, `prize` columns. Includes all active, valid participants with a non-null prize, independently of table filters and pagination (maximum 50,000 winners). Rows sort by prize/name/ID. Worksheet names are sanitized, shortened and disambiguated; the prize column retains the full original name. An empty result returns a header-only Winners worksheet. The admin **Export winners** button uses this endpoint.
