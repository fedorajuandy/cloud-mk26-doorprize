# Doorprize integration deployment and operation

This CMS implements the supplied [source contract](DOORPRIZE-INTEGRATION.md). No source-system code changes are required for its documented HTTP integration. Winner publication uses HTTP; the source site's existing Redis/outbox/WebSocket system notifies logged-in participants. The source integration token stays on this backend and is never sent to the roulette browser or public `/api/settings`.

## Deploy

1. On the source site, Super Admin creates an integration token under **Doorprize → Kunci integrasi**.
2. Set these **server-only** environment variables for both this web process and the integration worker:

   ```dotenv
   DOORPRIZE_SOURCE_URL=https://familyday.id
   DOORPRIZE_SOURCE_TOKEN=YOUR_SECRET_TOKEN
   ```

   Use the actual source origin if different. HTTPS is required. Keep this token out of frontend/VITE variables, source control, URLs, screenshots, and logs. Token rotation at the same source is supported. Source origin is pinned after the first worker operation so a configuration mistake cannot send mapped IDs to another system.

3. Deploy the repository and dependencies; run `npm run db:migrate` before starting the updated app. Migration `008_doorprize_integration.js` here adds CMS-side tables. The source site separately needs its own migration `008_doorprize.js` as described in its guide; these are different databases/migrations.
4. Build/start the web server using the existing deployment process.
5. Run **`npm run integration:worker` as a persistent second process**, with the same working directory, environment, database, and code version as the web server. Configure your process supervisor to restart it after failure/reboot. `npm run integration:worker -- --once` processes at most one operation for diagnostics; it is not a replacement for the persistent worker. On platforms that suspend processes outside requests, use an always-running worker service with CPU allocated.
6. Open **Doorprize integration (left sidebar, below Participants)** as Super Admin. Verify the worker is online and click **Test connection**. The test requests only a minimal source participant page; it does not publish awards.
7. Choose/save the import mode and claim defaults, then **Start participant sync**. Inspect skipped identities before drawing. Enable automatic winner delivery when ready.

No production source credential is committed. Automated tests use fake source responses. A successful live connection and agreed synthetic participant draw still need to be verified after configuring the real source token.

## Import and matching

- Source endpoint: `GET /api/integrations/doorprize/participants`, 500 records/page, retaining `through` from the first page and following `nextAfter` until null.
- Sync is an explicitly started job, not continuous polling. Start another sync when new registrations should be included. Pause/resume retains the last committed cursor; restart begins at zero. Each page and its checkpoint commit together.
- **Link existing** (default) matches exact NIP. Because NIP is not unique locally, duplicate NIPs or NIPs already mapped to a different source ID are skipped. Review up to 50 latest skipped IDs/NIPs/reasons in admin; the source remains unchanged.
- **Create missing** also inserts absent participants using `unique_id=familyday:<source ID>`, NIP as the display name, and `Not provided` as unit kerja. The source contract exports only ID/NIP, so names, profile pictures, emails, attendance, and unit details cannot be fetched through it. New prize/babak/sesi/contact fields are null. Existing names, unique IDs, personal details, results and archive state are preserved.
- Source IDs live in `doorprize_links`; numeric local `participants.id` still identifies rows in the existing roulette APIs. Spreadsheet `unique_id` is independent and is not assumed to be a source ID. Link by NIP before publishing results.
- Source deletions are not mirrored as local deletions. Winner publication validates source ID/NIP again at the source; a now-invalid participant fails publication visibly.

## Roulette and winner delivery

The roulette app continues to use authenticated participant APIs:

```http
GET /api/participants?without_prize=true&sesi=1&page=1&limit=100
PATCH /api/participants/batch
Content-Type: application/json
```

```json
{ "updates": [{ "id": 101, "prize": "Laptop", "sesi": 1, "babak": 2 }] }
```

Single `PATCH/PUT /api/participants/:id` also works. When automatic delivery is enabled and the participant is mapped, the winner update and immutable delivery snapshot commit in one database transaction. If either fails, neither commits. The API response confirms local storage/queueing, not source acknowledgment; use integration status to confirm publication. Unmapped participant updates still work locally but are not sent; admin shows the unmapped-winner count.

The worker normally starts delivery within a few seconds. Database leases serialize workers and space outgoing HTTP calls at least 1.1 seconds apart, below the source's 120/minute quota when this deployment is the sole client of that key. Both imports and publications share this gate. Batches contain at most 100 winners and at most 256 KiB UTF-8 JSON. If several callers use the same token outside this deployment, quota is shared and the source may still return 429.

- `participantId` and `nip` come from the saved source mapping, not from guessed frontend values.
- `prizeName` is the local prize (maximum 160 characters for linked publication).
- `sesi` and `babak` remain internal: neither is sent as a field or appended to the award description. Newly queued awards use only the configured description. Existing immutable queued/published snapshots are unchanged.
- Claim location is mandatory (default **Meja Doorprize**). Message, local source prize-image path, and deadline are configurable. Defaults are copied at queue time; later settings changes do not mutate queued payloads.
- `imageUrl` is a source-local `/prize-assets/name.webp|png|jpg|jpeg`, not this CMS's profile image and not an external URL.
- Every award gets a random external ID; every batch gets a random batch ID. Retries send the exact stored payload/IDs, including after process restarts or ambiguous network failures. The source acknowledges matching batch ID/count before delivery becomes `sent`.
- Transport failures, malformed acknowledgments, and 5xx retry with exponential backoff and jitter. 429 waits at least one minute. Other 4xx become `failed`; fix the source-side problem and use **Retry original batch**. A retry never creates a fresh batch ID to bypass a conflict.
- Repeated assignments of the same prize do not enqueue duplicates. Changing babak/sesi alone does not publish another prize or modify the already-copied source description. Direct replacement of an already queued/published prize is rejected while integration is enabled because the source contract has no correction endpoint.

This is not a server-side random draw or eligibility lock. Frontend draw selection is still client-controlled, and the existing winner APIs do not implement a general multi-operator reservation protocol.

## Admin controls

- **Save integration settings:** claim defaults, import mode, automatic winner delivery. Disabling automatic delivery pauses automatic capture and automatic batches; an in-flight request may still finish. Explicitly queued manual batches and operator retries continue.
- **Test connection:** queues a minimal source API read for the worker.
- **Start participant sync / Pause / Resume:** control the cursor import job; pause takes effect at the next page boundary.
- **Queue current winners:** captures up to 100 mapped active winners not already captured, useful for prizes assigned while delivery was off or before mapping. Works while automatic delivery is off; the worker sends these explicitly authorized batches. Repeat for more than 100.
- **Refresh status:** worker heartbeat, connection state, import totals/skips, delivery batch counts, last 50 deliveries and errors. Status refreshes every five seconds while this panel is open.
- **Retry original batch:** retry a failed batch after resolving the problem. Pending batches retry automatically when due.

**Local reset/delete does not revoke or cancel source prizes or queued batches.** Delivery snapshots/history survive participant purge. Reset clears the local mapping's current-prize marker, so a later new assignment can create a new distinct award, including the same prize. Only do this for a genuine new draw; the source allows multiple distinct awards per participant. Resolve corrections/revocations on the source site, since the supplied contract provides no revoke/update endpoint. Do not reset/purge production results assuming that will undo publication.

## CMS control API (Super Admin cookie required)

| Method | Route                               | Body / result                                                                                                           |
| ------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/integration/doorprize`        | Settings, configured flag, origin, worker status, import progress/issues, queue counts and last 50 deliveries; no token |
| PUT    | `/api/integration/doorprize`        | `{enabled,import_mode,claim_location,description,image_url,claim_deadline}`                                             |
| POST   | `/api/integration/doorprize/test`   | `{}`; schedule connectivity check                                                                                       |
| POST   | `/api/integration/doorprize/sync`   | `{}`; start a fresh cursor import                                                                                       |
| POST   | `/api/integration/doorprize/pause`  | `{}`; pause imports                                                                                                     |
| POST   | `/api/integration/doorprize/resume` | `{}`; resume paused/failed imports                                                                                      |
| POST   | `/api/integration/doorprize/queue`  | `{}`; return `{data:{queued:N}}` winners captured                                                                       |
| POST   | `/api/integration/doorprize/retry`  | `{id:DELIVERY_ID}`; retry failed batch unchanged                                                                        |

The roulette app still uses the existing cookie authentication and same-origin integration; it must not use the source bearer token. If hosted on a different origin, deploy a same-origin reverse proxy/BFF consistent with the backend's APP_ORIGIN checks. This feature does not enable browser CORS or expose a source integration key.

Manual winner delivery requires migration `011_manual_winner_delivery.js` (`npm run db:migrate`) and restarting both the app and integration worker. Keep the worker running; the button queues work rather than sending synchronously. Existing automatic pending batches remain paused while automatic delivery is off.

The integration page separates **Sync settings** from **Sync controller**. Source connection status, actions, worker status and participant counts are in the controller. GET `/api/integration/doorprize` includes `participants.with_prize` and `participants.without_prize`: global counts of active, valid participants split by whether prize is null. Archived and invalid records are excluded. Counts refresh with integration status every five seconds or via Refresh status.
