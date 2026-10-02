import { createSignal, onMount, onCleanup, Show, For } from "solid-js";
import { api } from "../../lib/api.js";
export default function DoorprizeIntegration() {
  const [status, setStatus] = createSignal(null),
    [form, setForm] = createSignal(null);
  const [busy, setBusy] = createSignal(false),
    [error, setError] = createSignal(""),
    [notice, setNotice] = createSignal(""),
    [busyAction, setBusyAction] = createSignal("");
  let active = true,
    timer,
    loading = false;
  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      const data = await api("/integration/doorprize");
      if (active) {
        setStatus(data);
        if (!form()) setForm(data.settings);
      }
    } catch (error) {
      if (active) setError(error.message);
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    void refresh();
    timer = setInterval(refresh, 5000);
  });
  onCleanup(() => {
    active = false;
    clearInterval(timer);
  });
  const field = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function run(action, data = {}) {
    if (busy()) return;
    setBusy(true);
    setBusyAction(action);
    setError("");
    setNotice("");
    try {
      const result = await api(
        `/integration/doorprize${action === "save" ? "" : `/${action}`}`,
        {
          method: action === "save" ? "PUT" : "POST",
          body: JSON.stringify(data),
        },
      );
      setNotice(
        action === "queue"
          ? `${result.queued} winner(s) queued. Repeat to queue more than 100.`
          : action === "save"
            ? "Integration settings saved."
            : action === "test"
              ? "Connection test queued. The result will appear below; this does not import participants or publish prizes."
              : "Control request accepted. Status updates automatically.",
      );
      await refresh();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
      setBusyAction("");
    }
  }
  return (
    <section>
      <div class="page-heading">
        <div>
          <p class="eyebrow">SYSTEM SETTINGS</p>
          <h1>Doorprize integration</h1>
          <p class="muted">
            Sync participants from the source site and publish winner awards.
          </p>
        </div>
      </div>
      <Show when={error()}>
        <p class="error" role="alert">
          {error()}
        </p>
      </Show>
      <Show
        when={status() && form()}
        fallback={<p class="muted">Loading integration…</p>}
      >
        <div class="card settings-card integration-card">
          <h2>Sync settings</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run("save", form());
            }}
          >
            <fieldset disabled={busy()}>
              <label class="checkbox">
                <input
                  type="checkbox"
                  checked={form().enabled}
                  onChange={(event) =>
                    field("enabled", event.currentTarget.checked)
                  }
                />
                Automatic winner delivery
              </label>
              <p class="muted">
                When enabled, prize assignments for linked participants are
                queued automatically. When off, automatic deliveries are paused.
                Click “Queue current winners” to send up to 100 unqueued winners
                without enabling automatic delivery. Manually queued deliveries
                and retries continue while this setting is off.
              </p>
              <label>
                Participant import mode
                <select
                  aria-label="Participant import mode"
                  value={form().import_mode}
                  onChange={(event) =>
                    field("import_mode", event.currentTarget.value)
                  }
                >
                  <option value="link">
                    Link existing participants by NIP
                  </option>
                  <option value="create">
                    Link existing and create missing participants
                  </option>
                </select>
              </label>
              <p class="muted">
                The source provides only ID and NIP. New entries use NIP as
                their name and “Not provided” as unit kerja. Existing personal
                details and results are preserved. Duplicate NIPs or identity
                conflicts are skipped for review.
              </p>
              <label>
                Claim location
                <input
                  required
                  maxlength="160"
                  value={form().claim_location}
                  onInput={(event) =>
                    field("claim_location", event.currentTarget.value)
                  }
                />
              </label>
              <label>
                Winner message
                <textarea
                  maxlength="300"
                  value={form().description}
                  onInput={(event) =>
                    field("description", event.currentTarget.value)
                  }
                />
              </label>
              <label>
                Prize image path
                <input
                  maxlength="255"
                  placeholder="/prize-assets/prize.webp"
                  value={form().image_url || ""}
                  onInput={(event) =>
                    field("image_url", event.currentTarget.value || null)
                  }
                />
              </label>
              <label>
                Claim deadline (ISO 8601 with timezone)
                <input
                  placeholder="2026-10-03T18:00:00+07:00"
                  value={form().claim_deadline || ""}
                  onInput={(event) =>
                    field("claim_deadline", event.currentTarget.value || null)
                  }
                />
              </label>
              <p class="muted">
                Image path belongs to the source site. Blank image/deadline
                means no image/deadline. These defaults apply to newly queued
                awards.
              </p>
              <button class="primary" disabled={busy()}>
                Save integration settings
              </button>
            </fieldset>
          </form>
        </div>
        <div
          class="card settings-card integration-card"
          aria-label="Sync controller"
        >
          <h2>Sync controller</h2>
          <p>
            Source: {status().origin || "Not configured"} · Connection:{" "}
            {status().connection}
          </p>
          <Show when={!status().configured}>
            <p class="error">
              Configure DOORPRIZE_SOURCE_URL and DOORPRIZE_SOURCE_TOKEN on the
              backend server. The source site's Super Admin creates the token
              under Doorprize → Kunci integrasi.
            </p>
          </Show>
          <div class="page-actions">
            <button
              class="secondary"
              disabled={busy() || !status().configured || status().test_pending}
              onClick={() => run("test")}
            >
              {busyAction() === "test"
                ? "Queuing test…"
                : status().test_pending
                  ? "Test queued…"
                  : "Test connection"}
            </button>
            <button
              class="secondary"
              disabled={
                busy() ||
                !status().configured ||
                status().import.status === "running"
              }
              onClick={() => run("sync")}
            >
              Start participant sync
            </button>
            <button
              class="secondary"
              disabled={busy() || status().import.status !== "running"}
              onClick={() => run("pause")}
            >
              Pause participant sync
            </button>
            <button
              class="secondary"
              disabled={
                busy() || !["paused", "failed"].includes(status().import.status)
              }
              onClick={() => run("resume")}
            >
              Resume participant sync
            </button>
            <button
              class="primary"
              disabled={busy() || !status().configured}
              onClick={() => run("queue")}
            >
              Queue current winners
            </button>
            <button class="secondary" disabled={busy()} onClick={refresh}>
              Refresh status
            </button>
          </div>
          <div
            class="integration-feedback"
            aria-live="polite"
            aria-atomic="true"
          >
            <Show when={notice()}>
              <p class="success" role="status">
                {notice()}
              </p>
            </Show>
            <Show when={error()}>
              <p class="error">{error()}</p>
            </Show>
            <p
              classList={{
                success: status().connection === "Connected",
                error: !["Connected", "Not tested", "Test queued"].includes(
                  status().connection,
                ),
              }}
            >
              <strong>Connection: {status().connection}</strong>
              <Show when={status().connection === "Connected"}>
                {" "}
                — Source API and credentials verified.
              </Show>
            </p>
            <Show when={status().test_pending && status().worker_online}>
              <p>
                The worker will run the test shortly. Results refresh
                automatically every five seconds.
              </p>
            </Show>
            <Show when={status().retry_wait_seconds > 2}>
              <p>
                Next source request can run in approximately{" "}
                {status().retry_wait_seconds} seconds (rate limit or retry
                delay).
              </p>
            </Show>
            <Show when={!status().worker_online}>
              <p class="error">
                Delivery worker is offline.{" "}
                {status().test_pending
                  ? "Your test is queued and cannot run until the worker starts. "
                  : "Sync and delivery jobs cannot run until it starts. "}
                Run <code>npm run integration:worker</code> as a persistent
                process on the server, using the same environment and database
                as the web app.
              </p>
            </Show>
          </div>
          <div aria-label="Participant prize counts">
            <p>
              Without prizes:{" "}
              <strong>{status().participants?.without_prize ?? 0}</strong> ·
              With prizes:{" "}
              <strong>{status().participants?.with_prize ?? 0}</strong>
            </p>
            <p class="muted">
              Active, valid participants only; archived and invalid participants
              are excluded.
            </p>
          </div>
          <p>
            Participant sync: <strong>{status().import.status}</strong> ·
            Linked: {status().import.linked} · Created:{" "}
            {status().import.created} · Skipped: {status().import.skipped}
          </p>
          <Show when={status().import.error}>
            <p class="error">{status().import.error}</p>
          </Show>
          <p>
            Mapped participants: {status().linked} · Unmapped winners:{" "}
            {status().unmapped_winners} · Pending: {status().queue.pending || 0}{" "}
            · Sent: {status().queue.sent || 0} · Failed:{" "}
            {status().queue.failed || 0}
          </p>
          <p class="muted">
            Published awards cannot be edited or revoked through this
            integration. Local reset/delete does not cancel queued or published
            awards. Resolve prize corrections on the source site. Retries reuse
            the original batch and award IDs.
          </p>
        </div>
        <Show when={status().issues?.length}>
          <div class="card table-scroll integration-history">
            <table>
              <caption>Latest skipped source participants (up to 50)</caption>
              <thead>
                <tr>
                  <th>Source ID</th>
                  <th>NIP</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                <For each={status().issues}>
                  {(issue) => (
                    <tr>
                      <td>{issue.source_id}</td>
                      <td>{issue.nip}</td>
                      <td>{issue.reason}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
        <div class="card table-scroll integration-history">
          <table>
            <thead>
              <tr>
                <th>Batch</th>
                <th>First participant ID</th>
                <th>Winners</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Last error</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <For
                each={status().history}
                fallback={
                  <tr>
                    <td colspan="7">No deliveries yet.</td>
                  </tr>
                }
              >
                {(item) => (
                  <tr>
                    <td>{item.batch_id}</td>
                    <td>{item.participant_id}</td>
                    <td>{item.participant_count}</td>
                    <td>{item.status}</td>
                    <td>{item.attempts}</td>
                    <td>{item.last_error || "—"}</td>
                    <td>
                      <Show when={item.status === "failed"}>
                        <button
                          class="text-button"
                          disabled={busy()}
                          onClick={() => run("retry", { id: item.id })}
                        >
                          Retry original batch
                        </button>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </section>
  );
}
