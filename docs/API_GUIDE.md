# Mandiri Carnaval 2026 Doorprize — HTTP API guide

This guide is for teams integrating with the participant/admin backend. All routes are served by the same SolidStart application as the admin CMS. Set the base URL to the deployed application origin; local examples use `http://localhost:6230`.

## Authentication

Sign in with an existing admin account. The response sets an eight-hour `admin_session` cookie. Send that cookie on subsequent requests. Passwords and JWT secrets are never returned. There is no separate bearer-token endpoint.

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
| `created_at` | Timestamp      | Server-managed                                                      |
| `updated_at` | Timestamp/null | Server-managed                                                      |
| `deleted_at` | Timestamp/null | Archive timestamp                                                   |

Blank optional strings become null. NIP is **not unique** in the supplied schema. Sending the same participant twice creates two records. The API does not silently merge, deduplicate, or overwrite by NIP.

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
  -d '{"full_name":"Ayu Pratama","nip":"000123","unit_kerja":"Finance","no_hp":"08123456789","prize":null,"babak":null}' \
  "$BASE_URL/api/participants"

curl --fail-with-body -b "$COOKIE_JAR" -X PATCH \
  -H 'Content-Type: application/json' -d '{"prize":"Laptop","babak":2}' \
  "$BASE_URL/api/participants/42"
```

Creation and updates return the participant in `data`. Archiving returns `{"data":null}`. Unknown body fields are rejected. There is no permanent-delete API.

## Import participants from Excel or CSV

`POST /api/participants/import`

Send exactly one file in the multipart field `file`. Supported formats are `.xlsx` and comma-separated UTF-8 `.csv` (UTF-8 BOM accepted). Older `.xls` files must first be saved as `.xlsx`. Limits: 5 MiB file size, 5,000 data rows, 32 columns, and 25 MiB expanded XLSX archive. The total multipart request must fit within 5 MiB plus 64 KiB. XLSX imports read the **first worksheet**, with headers in row 1. Fully blank data rows are skipped.

Download the empty Excel template:

```sh
curl --fail-with-body -b "$COOKIE_JAR" \
  "$BASE_URL/api/participants/import-template" -o participants-template.xlsx
```

Required headers: `full_name`, `nip`, `unit_kerja`.

Optional headers: `no_hp`, `prize`, `babak`.

Headers are case-insensitive and spaces/hyphens normalize to underscores, so `Full name`, `Unit kerja`, and `Phone number` work. Additional aliases: `nama`/`nama_lengkap` → `full_name`, `phone_number` → `no_hp`, `hadiah` → `prize`, `round` → `babak`. `id`, `created_at`, `updated_at`, and `deleted_at` columns are ignored if present. Other unknown or duplicate columns are rejected.

Example CSV:

```csv
full_name,nip,unit_kerja,no_hp,prize,babak
Ayu Pratama,000123456789012345,Finance,08123456789,,
"Budi, Santoso",000456,Operations,08129876543,Laptop,2
```

Store NIP and phone numbers as **text** in Excel. Numeric identifiers longer than 15 digits are rejected because Excel may already have lost precision. Simple zero-padding number formats are recognized, but text is preferred. Blank optional cells become null. Formulas, dates, booleans, and error cells are not accepted as participant values; paste values as text/numbers first. CSV text is preserved literally and is never evaluated as a formula. Quotes, commas inside quoted fields, and multiline quoted CSV fields are supported. CSV validation row numbers refer to parsed records including the header; XLSX row numbers refer to worksheet rows.

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

Imports are **append-only and transactional**. Existing records are unchanged. All rows are validated before any insert; any invalid row means nothing is imported. Uploading the same file again will append duplicates. Newly imported records are active and get new IDs/timestamps. There is no upsert or overwrite mode.

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

The workbook contains the six participant input fields in the same order as the import template. IDs and audit timestamps are omitted. NIP/phone values are exported as Excel text, blank prizes remain blank, and strings beginning with `=` are written as text rather than executable formulas. The header is frozen, columns have readable widths, and Excel filtering is enabled. Exported files can be imported again, subject to the import limits; doing so appends new records.

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
| GET                     | `/api/settings`                 | Current `logo_url` and `login_bg_color` settings                                    |
| PUT                     | `/api/settings`                 | `{logo_url:"/logo.svg", login_bg_color:"#f3f4f6"}`                                  |

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
