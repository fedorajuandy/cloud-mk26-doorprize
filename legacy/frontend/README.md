# Wishing Tree frontend

Solid + Vite frontend for `../cloud-mk26-wishing-tree`.

```sh
npm install
cp .env.example .env.local
npm run dev
```

By default HTTP, SSE, and Socket.IO use the frontend origin. Vite proxies `/api`
and `/socket.io` to `DEV_API_TARGET` (default `http://127.0.0.1:6229`). Forward the
frontend port 5001 in VS Code and open that HTTPS address on all devices; the
phone/tablet no longer tries to reach its own localhost. Restart Vite after env changes.

For a tunnel, set `DEV_ALLOWED_HOSTS` to the exact frontend tunnel hostname if Vite
rejects it, and add the exact frontend origin to backend `ALLOWED_ORIGINS` (the proxy
preserves the client's Origin). Only the admin/display pages require login. Keep both
Vite and the backend running. Private tunnels also require tunnel authentication
on each device; application login is separate.

To use a separate reachable backend, set `VITE_API_URL` to its full `/api` URL;
`VITE_SOCKET_URL` can override its Socket.IO origin. These values are embedded at
build time. Remove old localhost overrides from `.env.local` for tunnel testing.

## Routes

- `/`: authenticated wishes table, search, date filters, pagination and Excel export.
  Super admins can add/edit/delete/restore wishes and permanently delete records.
- `/phone`: public name/wish form using Socket.IO with polling/WebSocket fallback and a
  server acknowledgement. A timeout is an unknown outcome; submissions are never
  automatically retried because the backend does not have idempotency keys.
- `/ipad`: public kiosk. Submits via HTTP POST and listens to SSE for delivery
  confirmation. SSE only sends data from server to client. The form still accepts
  HTTP submissions if its SSE stream is unavailable.
- `/display` or `/display?transport=sse`: signed-in SSE display.
- `/display?transport=ws`: same display using the authenticated Socket.IO namespace.

Both display transports receive wishes submitted through either form. The
display needs an account with `read_wishes` for its snapshot and admin operations.
Phone/iPad submissions and the SSE stream are public. Login preserves the requested route. Expired display sessions retain
cached playback and show a sign-in link instead of redirecting mid-animation.

The wall uses Three.js's CSS3DRenderer, a perspective camera, depth layers and
left-to-right motion. Text is inserted through `textContent`. New arrivals are
inserted visibly immediately, held for five seconds, then move with the wall.
A round tracks a snapshot of wish IDs; new entries join normal rotation on the next
round. Deleted IDs are skipped and updates replace displayed text. Motion-reduction
preferences use stationary cards with timed replacement. Long wishes are visually
clamped on cards; the full text remains available in the admin table.

## Connection loss and playback

IndexedDB stores a snapshot per API/account in the display browser. Playback uses
memory and continues if either transport drops. Reloading the frontend with the
backend unavailable restores that snapshot. Storage failures are shown on screen;
in that case only the current tab's in-memory copy is available. This is not a full
offline app install: a reload still needs the frontend assets to be available.

The client fetches all pages on startup, reconnect, SSE reset and every 60 seconds.
Events arriving during a refresh are buffered and applied over the snapshot;
event IDs are deduplicated and record IDs remain strings. Deleted/cleared wishes
are removed from the scene and persisted snapshot. Server data is authoritative.
There is no need to wait for an animation round to finish before fetching.

A `.txt` file is unnecessary for browser playback and cannot be written silently
to an arbitrary local path. IndexedDB is more suitable, but browser data can be
cleared or evicted; the backend database remains the durable source. Clear site
storage when decommissioning a shared display.

The backend currently uses offset pagination rather than a transactionally frozen
snapshot. Large concurrent mutations can shift page boundaries; the next periodic
reconciliation repairs any temporary omissions. A revisioned snapshot/cursor API
would provide stronger synchronization guarantees if the event volume requires it.
Bursts are bounded to 36 visible cards; every wish remains in the rotation, though
very large bursts can shorten an immediate card's on-screen time.

## Deployment

```sh
npm run build
```

Serve `dist` with SPA fallback to `index.html` for direct route navigation. The default
same-origin setup requires production proxy rules for `/api` and `/socket.io`; Vite
proxy settings apply only to development. Alternatively build with a reachable
`VITE_API_URL` and `VITE_SOCKET_URL`. Configure
the frontend origin in backend `ALLOWED_ORIGINS`, use HTTPS/WSS in production, and
ensure cookie authentication works across the selected origins. Prefer same-site
frontend/backend deployment for admin/display cookie compatibility. The reverse proxy must
forward WebSocket upgrades and disable buffering on `/api/wishes/stream`.
The backend schema and wish permissions must already be migrated/seeded; this
frontend change does not modify the database.

## Verification

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Unit tests cover event reduction, bigint IDs, replay deduplication and loop behavior.
Browser tests start an isolated HTTP/SSE/Socket.IO fixture (port 6239) and frontend
(port 4173), covering forms, both display transports, deletion, mobile admin layout,
and persisted recovery. They do not write to the real backend database.

Renderer reference: [Three.js CSS3DRenderer](https://threejs.org/docs/pages/CSS3DRenderer.html).

Manual reconnect: the phone form has a visible Reconnect button. On the iPad
form, tap the hidden 48 × 48 px control in the top-left corner to reopen SSE.
Both controls preserve the form and are disabled while a wish is being submitted.

Tunnel proxy regression: `npx playwright test --config=playwright.proxy.config.js`.
Backend contracts and troubleshooting: [API guide](../cloud-mk26-wishing-tree/docs/API_GUIDE.md).
