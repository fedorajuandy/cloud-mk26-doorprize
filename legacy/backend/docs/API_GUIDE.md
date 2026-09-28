# Wishing Tree backend API guide

## 1. Base URLs and setup

Use the backend **origin**, without `/api`, as `API`:

```js
const API = 'https://YOUR-BACKEND-TUNNEL.asse.devtunnels.ms';
// Local development on the same computer: http://localhost:6228
```

| Connection | URL / namespace | Access |
| --- | --- | --- |
| HTTP API | `${API}/api/...` | Depends on endpoint |
| Phone Socket.IO | `io(API)`; namespace `/`; path `/socket.io/` | Public submissions |
| Live Socket.IO receiver | `io(API + '/wishes/live')`; path `/socket.io/` | Login + `read_wishes` |
| Standby SSE receiver | `${API}/api/wishes/stream` | Public; no login or permission |

`io(API + '/api')` connects to a nonexistent namespace. A raw `new WebSocket()`
client is not compatible with Socket.IO. Use Socket.IO client v4. Phones connect
to the backend tunnel address, not `localhost` (which means the phone itself).

```sh
npm install
npx knex migrate:latest
# Bootstrap roles/accounts and seed permissions by name:
npx knex seed:run
npm start
```

The active seeds resolve permission IDs by name, so migration-assigned IDs cannot
accidentally grant a different permission. `03_initial_data.js` reapplies the
permission seed after creating the default roles/accounts. Repeated runs preserve
existing accounts and wishes. To update permissions alone on existing roles, run
`npx knex seed:run --specific=01_wish_permissions.js`.

| Role | Supported permissions |
| --- | --- |
| Super Admin | All 20 permissions listed below |
| Admin | `read_wishes` only (list, detail, Excel, authenticated live socket) |
| Anonymous phone/tablet | Public HTTP/Socket.IO submissions and SSE; no permission record needed |

Super Admin permissions: `create_user`, `read_user`, `update_user`, `delete_user`,
`change_password`, `create_role_permission`, `read_role_permission`,
`update_role_permission`, `delete_role_permission`, `create_permission`,
`read_permission`, `read_deleted_permission`, `update_permission`,
`delete_permission`, `revert_permission`, `read_wishes`, `read_deleted_wishes`,
`update_wishes`, `delete_wishes`, `recover_wishes`.

The seed merges legacy `*_user_data` grants into `*_wishes`, removes those aliases,
and reconciles supported grants for the two standard roles. Custom-role grants
are preserved. Unrelated custom permission records are not removed. Obsolete
customer/participant/OTP permissions are no longer seeded. There is no
`create_wishes` permission because submission is public.

If your database previously ran the old `user_data` base migration, editing that
file does not migrate existing tables. That database must be brought to the
`schema/schema.dbml` wishes structure separately before running this API.
Archived `old_seeds/` scripts are not part of the normal seed run.

Environment configuration (supply your own database credentials and JWT secret):

```dotenv
PORT=6228
DB_HOST=127.0.0.1
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=your_database
JWT_SECRET=your_secret
JWT_EXPIRES_IN=8h
ALLOWED_ORIGINS=https://YOUR-PHONE-FRONTEND,https://YOUR-STANDBY-FRONTEND
REALTIME_DEBUG=true
SOCKET_IO_PING_INTERVAL_MS=10000
SOCKET_IO_PING_TIMEOUT_MS=60000
SSE_HEARTBEAT_MS=15000
SSE_DRAIN_TIMEOUT_MS=30000
```

The four timeout values above are defaults; overrides must be positive integer
milliseconds. Restart the backend after environment changes. `ALLOWED_ORIGINS`
contains exact **frontend origins**, including the scheme and port, with no path
or trailing slash. Existing built-in origins are also accepted. There is no
wildcard trust for all dev tunnels. `REALTIME_DEBUG=true` logs connection lifecycle
and disconnect reasons; handshake errors and rejected origins are logged without
it. These diagnostics do not include credentials or submitted wish content.

### Frontend workspace: one forwarded port (recommended for development)

The adjacent `fe-mk26-wishing-tree` frontend now defaults to same-origin `/api`
and Socket.IO. In its `.env.local`, leave `VITE_API_URL` and `VITE_SOCKET_URL` unset
and set the local backend target (match the backend's actual `PORT`):

```dotenv
DEV_API_TARGET=http://127.0.0.1:6229
DEV_ALLOWED_HOSTS=YOUR-FRONTEND-TUNNEL.asse.devtunnels.ms
```

Forward frontend port **5001** and use its HTTPS tunnel address for `/phone`, `/ipad`,
and `/display`. Vite proxies `/api` (including SSE) and `/socket.io` to the local
backend; cookies stay on the frontend origin. Put that frontend's exact HTTPS
origin in backend `ALLOWED_ORIGINS`; the proxy preserves the Origin header rather
than bypassing backend checks. Remove any old localhost `VITE_*` overrides and
restart both services. The submission tablet needs no login; admin/display pages still do.

An alternate setup keeps a separate backend tunnel: set frontend `VITE_API_URL`
to `https://BACKEND-TUNNEL/api` and `VITE_SOCKET_URL` to `https://BACKEND-TUNNEL`.
A static production build requires equivalent reverse-proxy rules when using
same-origin defaults; the Vite development proxy is not included in `dist`.
See [Vite proxy configuration](https://vite.dev/config/server-options.html#server-proxy).

## 2. Authentication and sessions

Phone and tablet submission, and the SSE stream, are public. Admin HTTP operations
and the `/wishes/live` Socket.IO receiver require login and the relevant permission.
Public SSE exposes live wish events and the retained replay buffer; administrative
list/export/edit/delete endpoints remain protected.

### Login

`POST /api/login`, JSON body:

```json
{ "username": "your_username", "password": "your_password" }
```

Successful response (HTTP 200):

```json
{
  "status": 200,
  "message": "Login successful.",
  "data": {
    "token": "JWT",
    "user_id": 1,
    "username": "your_username",
    "role_id": 1,
    "role_name": "Super Admin"
  }
}
```

The current login also duplicates these data fields at the top level for legacy
clients and sets an HttpOnly `access_token` cookie with `Secure; SameSite=None`.
Use HTTPS and `credentials: 'include'` for cross-origin cookie login:

```js
const response = await fetch(`${API}/api/login`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password })
});
const result = await response.json();
if (!response.ok) throw new Error(result.message);
const token = result.data.token; // Keep private; never put it in a URL.
```

HTTP clients may instead send `Authorization: Bearer JWT`. Bearer authorization
wins over the cookie. Public SSE does not require either credential. Cookie sessions
are still used by the admin UI and authenticated Socket.IO receiver.

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/login` | Public; returns token and sets cookie |
| GET | `/api/session-status` | Auth required; top-level `expiredInSeconds` (null for no expiry) |
| POST | `/api/refresh-token` | Requires a still-valid token; replaces cookie; does **not** return a new Bearer token |
| POST | `/api/logout` | Auth required; requests cookie removal; clients must also discard Bearer tokens and close live connections |

Refresh before expiry and reopen authenticated live sockets so they authenticate
with the refreshed cookie. Already-open connections keep their original expiry.
Bearer-only clients need a fresh login to obtain a new token. Expired or invalid
tokens return 403; a missing token returns 401. Authenticated Socket.IO connections send
`session:expired` and close at expiry. Public SSE has no session expiry. For sockets, refresh credentials and call
`.connect()` explicitly after this server-initiated namespace disconnect.
Logout does not revoke an already-issued JWT on the server.

## 3. Wishes HTTP API

Requests use `Content-Type: application/json`. The HTTP body limit and Socket.IO
packet limit are 1 MiB; the wish field limit is smaller. JSON responses have
`status`, `message`, and optional `data`. IDs are decimal **strings**, not JavaScript
numbers. Database timestamps are returned as strings without a timezone offset;
interpret them using the configured database timezone.

### Local profanity rejection

Both `name` and `wish` are checked with `obscenity` (English) and
`@sideid/id-profanity-filter` (Indonesian) before opening a database connection.
This applies to public HTTP/Socket.IO creation and HTTP edits. Filtering works
without internet and uses a normalized detection copy, including common spaced,
punctuated, full-width and zero-width variants. Accepted text is not censored or
rewritten beyond the existing trimming. Fuzzy and arbitrary substring matching
are disabled to reduce false positives; this is a word filter, not a guarantee
against every evasion or inappropriate sentence.

Rejected HTTP requests return **400**; Socket.IO acknowledgements (or `wish:result`
when no acknowledgement callback is supplied) return the same status and message:

```json
{
  "status": 400,
  "message": "Nama atau harapan mengandung kata yang tidak pantas. Silakan gunakan kata-kata yang sopan."
}
```

No rejected content is inserted, updated, or broadcast. Existing frontend forms
show this message and retain the input so the visitor can correct it. Previously
stored wishes are not retroactively scanned.

### Custom blocked words

Edit `config/custom-bad-words.json` to add your own words or phrases alongside
both packages' built-in dictionaries. The file starts as an empty array. Example
structure (replace the placeholders with your actual blocked terms):

```json
["your-blocked-word", "your blocked phrase"]
```

Restart the backend after editing. Entries are literal, case-insensitive words or
phrases, not regex patterns, and do not match inside longer words. Matching
normalizes whitespace, full-width characters and invisible separators; the
existing separated-letter check also applies. Add other spelling/leet variants
explicitly when needed. Matches receive the same 400 rejection before database
access for names and wishes on both submission transports and edits.

### Wish model and validation

```json
{
  "id": "42",
  "name": "Ada",
  "wish": "Peace and happiness",
  "created_at": "2026-09-28 10:00:00",
  "updated_at": null,
  "deleted_at": null
}
```

`name` is optional/nullable, trimmed, and limited to 255 Unicode characters before
trimming; a blank name becomes null. `wish` must be a string, non-empty after
trimming, and at most 65,535 UTF-8 bytes. Unknown body fields are ignored.

| Method | Path | Body / query | Permission | Success `data` |
| --- | --- | --- | --- | --- |
| POST | `/api/wishes` | `{name?, wish}` | Public | Saved wish, HTTP 201 |
| GET | `/api/wishes` | List filters below | `read_wishes` | Paginated active wishes |
| GET | `/api/wishes/:id` | — | `read_wishes` | One active wish |
| PUT | `/api/wishes/:id` | `{name?, wish}` | `update_wishes` | Updated wish |
| DELETE | `/api/wishes/:id` | — | `delete_wishes` | `{id, permanent:false}` |
| GET | `/api/deleted-wishes` | List filters below | `read_deleted_wishes` | Paginated deleted wishes |
| PUT | `/api/wishes/:id/recover` | — | `recover_wishes` | Recovered wish |
| DELETE | `/api/admin/wishes/:id` | — | `delete_wishes` | `{id, permanent:true}` |
| DELETE | `/api/admin/wishes/wipe-all` | — | `delete_wishes` | `{deleted_count}` |
| GET | `/api/wishes/export/excel` | Search/date filters | `read_wishes` | XLSX download, not JSON |

All successful operations except creation return HTTP 200. PUT replaces both
editable fields: omitting `name` clears it. Soft-deleted wishes cannot be fetched
through the active item endpoint or updated until recovered. Permanent deletion
and wipe-all are irreversible. Wipe-all deletes active and soft-deleted wishes.
Old `/user-data` endpoints are no longer mounted.

List filters:

| Parameter | Meaning |
| --- | --- |
| `page` | Positive integer, default 1 |
| `limit` | Integer 1–100, default 20 |
| `search` | Name/wish substring pattern, at most 1,000 characters; SQL LIKE wildcards `%` and `_` are supported |
| `start_date` | Valid `YYYY-MM-DD`, inclusive, database timezone |
| `end_date` | Valid `YYYY-MM-DD`, inclusive through that day's end |

Dates can be supplied independently; start must not follow end. Records sort by
`created_at DESC, id DESC`. Empty lists return 200 with `records: []` and zero total
pages. Excel exports all matches without pagination; omit `page` and `limit`.

Example list response:

```json
{
  "status": 200,
  "message": "Wishes fetched.",
  "data": {
    "summary": { "total_wishes": 1 },
    "records": [{ "id": "42", "name": "Ada", "wish": "Peace and happiness", "created_at": "2026-09-28 10:00:00", "updated_at": null, "deleted_at": null }],
    "pagination": { "total_records": 1, "total_pages": 1, "current_page": 1, "limit": 20 }
  }
}
```

Copyable requests (set `API` and `TOKEN` locally; do not share the token):

```sh
curl -i "$API/api"
curl -i "$API/api/health"
curl -i -X POST "$API/api/wishes" \
  -H 'Content-Type: application/json' \
  --data '{"name":"Ada","wish":"Peace and happiness"}'
curl "$API/api/wishes?page=1&limit=20&search=Peace" \
  -H "Authorization: Bearer $TOKEN"
curl -X PUT "$API/api/wishes/42" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"Ada","wish":"Health and happiness"}'
curl "$API/api/wishes/export/excel?start_date=2026-09-01&end_date=2026-09-30" \
  -H "Authorization: Bearer $TOKEN" --output wishes.xlsx
```

Errors for wish operations:

| Status | Meaning |
| --- | --- |
| 400 | Invalid wish, ID, pagination, date, search, or malformed JSON |
| 401 | Missing authentication on a protected endpoint |
| 403 | Invalid/expired token or missing permission |
| 404 | Requested wish does not exist in the required active/deleted state |
| 413 | HTTP body exceeds the limit |
| 429 | Socket already processing another submission |
| 500 | Server/database failure |

Validation example: `{ "status": 400, "message": "wish must be a non-empty string." }`.
Tunnel-generated failures may be HTML or redirects, not this JSON envelope.

## 4. Phone Socket.IO submissions

Install `socket.io-client` v4 in the frontend. Create the connection once, outside
reactive renders. Use the root namespace and retain polling fallback for tunnels.

```js
import { io } from 'socket.io-client';
const phone = io(API, {
  path: '/socket.io',
  transports: ['polling', 'websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  timeout: 20000
});
phone.on('connect', () => setStatus('live'));
phone.on('disconnect', (reason, details) => {
  setStatus('reconnecting');
  console.warn('Phone disconnected', reason, details?.message);
});
phone.on('connect_error', error => {
  setStatus('reconnecting');
  console.warn('Phone connect error', error.message, error.description);
});

async function submitWish(name, wish) {
  if (!phone.connected) throw new Error('Wait until connected.');
  const result = await phone.timeout(10000).emitWithAck('wish:create', { name, wish });
  if (result.status !== 201) throw new Error(result.message);
  return result.data;
}
// On component teardown: phone.disconnect().
```

`setStatus` is your UI state setter. Disable submit while awaiting the result.
Submission acknowledgement is `{status:201, message:"Wish created.", data:WISH}`
only after database commit. If the sender supplies no acknowledgement callback,
the server emits `wish:result` with the same envelope. Errors have `status` and
`message`, with no saved `data`.

A timeout is an unknown save outcome: the wish may have committed. Do not enable
blind retries or submit inside a `connect` handler, which runs again on reconnect.
There is no submission idempotency key. Packets exceeding 1 MiB are rejected at
transport level and may close the socket rather than return an acknowledgement.
The public namespace receives submission results, not everyone's wishes.

## 5. Standby SSE and live Socket.IO receivers

SSE sends data **from server to tab**. A tab submitting wishes uses HTTP POST or
Socket.IO; it cannot submit through EventSource. The backend emits each change
immediately. Queue wishes in the tab to display one at a time.

### Public browser SSE

Open the stream without logging in. Do not gate the tablet connection on a protected
`GET /api/wishes` request: that is an admin list API, not a public stream health check.

```js
const stream = new EventSource(`${API}/api/wishes/stream`);
stream.onopen = () => setStatus('live');
stream.addEventListener('stream:ready', () => setStatus('live'));
stream.addEventListener('wish:created', event => {
  const wish = JSON.parse(event.data); // Direct wish object, not {data: wish}.
  enqueueWish(wish); // Your display queue; render submitted text with textContent.
});
stream.addEventListener('stream:reset', () => {
  // Reload GET /api/wishes if you need an existing-data snapshot.
  // Reconcile that snapshot with queued live events by wish ID.
});
stream.onerror = () => {
  // Native EventSource hides the HTTP status. Inspect Network and backend logs.
  setStatus('reconnecting');
  console.warn('SSE error; readyState:', stream.readyState);
  // CONNECTING (0): allow native retry; do not create another stream here.
  // CLOSED (2): inspect the HTTP response, then explicitly reopen after correction.
};
// On component teardown: stream.close().
```

Named SSE events need `addEventListener`; `onmessage` alone does not receive them.
In particular, set your frontend `status` to `live` on `open`/`stream:ready`, not only
when a wish arrives. Otherwise an idle but healthy stream may look disconnected.
On a network error, inspect the stream response and `/api` liveness endpoint.
No application cookie is required for the public stream.

### Curl or server-side SSE

```sh
curl -N -i "$API/api/wishes/stream"
# Resume using a previous SSE event ID:
curl -N "$API/api/wishes/stream" \
  -H 'Last-Event-ID: EPOCH:SEQUENCE'
```

Expected response is HTTP 200 and `Content-Type: text/event-stream`, followed by:

```text
retry: 3000

id: EPOCH:0
event: stream:ready
data: {"connected":true}

: heartbeat

id: EPOCH:1
event: wish:created
data: {"id":"42","name":"Ada","wish":"Peace","created_at":"2026-09-28 10:00:00","updated_at":null,"deleted_at":null}

```

Heartbeats occur every 15 seconds by default and are SSE comments. They are not
`message` events. `Last-Event-ID` takes priority over the optional `?after=EVENT_ID`.

### Authenticated Socket.IO receiver

```js
const live = io(`${API}/wishes/live`, { auth: { token } });
live.on('wish:created', ({ event_id, data }) => enqueueWish(data));
live.on('session:expired', () => setStatus('auth'));
live.on('connect_error', error => console.warn(error.message, error.data?.status));
// After login produces a fresh token:
// live.auth = { token: freshToken };
// live.connect();
```

Cookie sessions can instead use `{withCredentials:true}`. Register listeners once,
not on every reconnect. Refresh an HTTP snapshot on socket reconnect; this
namespace does not replay missed events. Expiry disconnects only the live namespace,
not another namespace sharing its transport.

### Events and replay

| Event | SSE `data` / socket `data` |
| --- | --- |
| `wish:created` | Full saved wish |
| `wish:updated` | Full updated wish |
| `wish:recovered` | Full recovered wish |
| `wish:deleted` | `{id, permanent}` |
| `wishes:cleared` | `{deleted_count}` |

Socket mutation events wrap that payload in `{event_id, data}`. SSE uses the `id:`
line and the direct payload. `stream:ready` and `stream:reset` are SSE-only control
events. `session:expired` is a control event on the authenticated Socket.IO namespace; it
has no replay ID.

SSE replays the most recent 256 mutation events in the current backend process.
A new connection without a cursor gets future events only. An unknown, too-old,
or previous-process cursor produces `stream:reset`; reload/reconcile the HTTP
snapshot. Persist processed event IDs if your display needs duplicate protection.
No exactly-once delivery/display guarantee is provided.

Temporary SSE write pressure is queued until the socket drains. A client exceeding
1 MiB of pending queue data or the configured drain timeout is disconnected;
normal EventSource replay can recover within the retained history. Use a single
backend instance: multi-process delivery needs a shared event store and Socket.IO
adapter. Database wishes persist through restarts; the replay buffer does not.

## 6. Other mounted HTTP endpoints

| Method | Path | Input / permission |
| --- | --- | --- |
| GET | `/api` | Public liveness check |
| GET | `/api/health` | Public database connectivity check |
| GET | `/api/settings` | Public; `data` contains `logo_url`, `login_bg_color` |
| PUT | `/api/settings` | `{logo_url, login_bg_color}`; `update_permission` |
| POST | `/api/users` | `{username,password,role_id}`; `create_user`; returns top-level `newId` |
| GET | `/api/users`, `/api/users/:id` | `read_user` |
| PUT | `/api/users/:id` | `{username,role_id}`; `update_user` |
| PUT | `/api/change-password/:id` | `{password}`; `change_password` |
| DELETE | `/api/users/:id` | Soft delete; `delete_user` |
| POST | `/api/role-permissions` | `{role_name,permission_ids:[]}`; `create_role_permission`; returns top-level `newId` |
| GET | `/api/role-permissions`, `/api/role-permissions/:id` | `read_role_permission` |
| PUT | `/api/role-permissions/:id` | `{role_name,permission_ids:[]}` replaces assignments; `update_role_permission` |
| DELETE | `/api/role-permissions/:id` | Soft delete; `delete_role_permission`; default role 1 cannot be deleted |
| POST | `/api/permissions` | `{permission_name}`; `create_permission` |
| GET | `/api/permissions`, `/api/permissions/:id` | `read_permission` |
| GET | `/api/deleted-permissions`, `/api/deleted-permissions/:id` | `read_deleted_permission` |
| PUT | `/api/permissions/:id` | `{permission_name}`; `update_permission` |
| DELETE | `/api/permissions/:id` | Soft delete; `delete_permission` |
| DELETE | `/api/revert-permissions/:id` | Recover permission; `revert_permission` |

Always pass an existing `role_id` when creating/updating users. These routes come
from the utility submodule; their legacy response shapes can include top-level
fields such as `newId`, unlike the wishes API's consistent `data` field.

## 7. VS Code tunnel disconnect troubleshooting

A working admin page does not prove that the other clients have the same origin,
cookie session, tunnel access, or long-lived transport behavior. The message
“Koneksi langsung terputus. Menghubungkan kembali…” is a UI state, not a transport
error. Capture `disconnect`/`connect_error` as shown above and enable
`REALTIME_DEBUG=true` on the backend.

1. Confirm every device can reach **the backend** tunnel's `/api`. VS Code forwarded
   ports are Private by default. Authenticate each test device to the tunnel, or
   deliberately set the development port to Public if anonymous phone testing is
   intended. Tunnel authentication and application JWT authentication are separate.
   See [VS Code port forwarding](https://code.visualstudio.com/docs/debugtest/port-forwarding).
2. Use HTTPS URLs consistently and the backend origin for `io(API)`. Keep VS Code,
   the forwarding session, and the backend running while testing.
3. Add each frontend's exact origin to `ALLOWED_ORIGINS` and restart the backend.
   Backend logs identify rejected origins. Do not use `*` with credentialed clients.
4. The phone and tablet submission flows are public. If `/api/wishes/stream`
   returns 401/403, check for an outdated backend deployment or tunnel-level
   authentication. Admin list APIs and the live Socket.IO namespace remain protected.
5. Probe Engine.IO and SSE directly:

   ```sh
   curl -i "$API/socket.io/?EIO=4&transport=polling"
   curl -N -i "$API/api/wishes/stream"
   ```

   The first should start with `0{"sid":...}` and advertise `pingInterval:10000`
   and `pingTimeout:60000` by default. The second should stream `stream:ready` plus
   heartbeat comments. A 302/HTML login response is the tunnel, not the wish service.
6. Check disconnect details:

   | Signal | Next check |
   | --- | --- |
   | Origin rejection / Engine.IO code 4 | Exact frontend allowlist |
   | Public SSE 401 | Old backend or tunnel authentication |
   | Public SSE 403 | Old backend, tunnel access, or proxy rejection |
   | `session:expired` / `io server disconnect` | Sign in/refresh and explicitly reconnect |
   | `ping timeout` | Network stall or suspended tab; inspect heartbeat timing |
   | `transport close` / `transport error` | Tunnel/proxy restart, upgrade failure, network loss |
   | `backpressure timeout` / `backpressure queue limit` | Display/tunnel not consuming the stream |
   | Healthy `stream:ready`, UI still reconnecting | Named event handlers and frontend state logic |

7. Keep polling fallback enabled while diagnosing upgrades; a temporary
   `transports:['polling']` test can isolate WebSocket proxy failures. Do not create
   new connections on every reactive state update or on every EventSource error.
8. If you control a reverse proxy, disable SSE buffering and forward WebSocket
   upgrades. Its idle/read timeout must exceed `pingInterval + pingTimeout` (70
   seconds with these defaults; for example configure 120 seconds). The backend
   cannot override the timeout policy of a hosted tunnel or prevent phone browsers
   from suspending a background tab. See [Socket.IO troubleshooting](https://socket.io/docs/v4/troubleshooting-connection-issues/).

The server's SSE backpressure handling follows [Node's response.write contract](https://nodejs.org/api/http.html#responsewritechunk-encoding-callback):
`false` means the data was accepted into a buffer and requires waiting for `drain`,
not immediate disconnection. SSE framing and browser behavior follow
[MDN's SSE guide](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).

## 8. Verification

`npm test` includes real local HTTP/Socket.IO/SSE transport tests with injected
database responses, plus regression tests for backpressure, session timer overflow,
namespace expiry, and JSON packet size. The MariaDB test is optional:
`TEST_MYSQL_SOCKET=/path/to/disposable/mysql.sock npm test`. It creates/drops only
its own randomly named test database. These local tests do not verify a particular
VS Code tunnel or the frontend's connection lifecycle.
