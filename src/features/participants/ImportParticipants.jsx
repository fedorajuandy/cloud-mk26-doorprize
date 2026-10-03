import { createSignal, For, Show } from "solid-js";
import { api, download } from "../../lib/api.js";
import Modal from "../../components/Modal.jsx";
export default function ImportParticipants(props) {
  const [file, setFile] = createSignal(null),
    [busy, setBusy] = createSignal(false),
    [error, setError] = createSignal(""),
    [details, setDetails] = createSignal([]);
  async function template() {
    setError("");
    try {
      await download(
        "/participants/import-template",
        "participants-template.xlsx",
      );
    } catch (error) {
      setError(error.message);
    }
  }
  async function submit(event) {
    event.preventDefault();
    if (!file()) return;
    setBusy(true);
    setError("");
    setDetails([]);
    const form = new FormData();
    form.append("file", file());
    try {
      const result = await api("/participants/import", {
        method: "POST",
        body: form,
      });
      props.done(result.imported);
    } catch (error) {
      setError(error.message);
      setDetails(error.details || []);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Import participants"
      close={() => props.close()}
      busy={busy()}
    >
      <form onSubmit={submit}>
        <p>
          Upload an Excel (.xlsx) or UTF-8 CSV file with a header row. Excel
          imports use the first worksheet.
        </p>
        <p class="muted">
          Required columns: <code>unique_id</code>, <code>full_name</code>,{" "}
          <code>nip</code>, <code>unit_kerja</code>. Optional:{" "}
          <code>no_hp</code>, <code>prize</code>, <code>babak</code>,{" "}
          <code>sesi</code>, <code>email</code>, <code>profile_picture</code>,{" "}
          <code>line</code>, <code>status</code>, <code>registered_at</code>,{" "}
          <code>verified_at, is_invalid</code>.
        </p>
        <p class="muted">
          Source spreadsheet headers are also accepted: Kode, Nama, NIP,
          Telepon, Unit kerja, Line, Status, Registrasi UTC, Verifikasi UTC.
          Kode must be unique. Blank optional cells become null; unzoned
          registration/verification times are interpreted as UTC.
        </p>
        <button
          type="button"
          class="text-button"
          onClick={template}
          disabled={busy()}
        >
          Download Excel template
        </button>
        <label class="import-file">
          Participant file
          <input
            type="file"
            accept=".xlsx,.csv"
            required
            disabled={busy()}
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0] || null);
              setError("");
              setDetails([]);
            }}
          />
        </label>
        <p class="muted">
          Up to 20 MB and 50,000 rows. Store unique IDs, NIP and phone numbers
          as text to preserve leading zeros. Import adds new records; reusing a
          unique ID rejects the whole import.
        </p>
        <Show when={error()}>
          <p class="error" role="alert">
            {error()}
          </p>
        </Show>
        <Show when={details().length}>
          <ul class="import-errors">
            <For each={details()}>
              {(issue) => (
                <li>
                  Row {issue.row} · {issue.field}: {issue.message}
                </li>
              )}
            </For>
          </ul>
          <p class="muted">
            Showing up to 50 errors. Correct the file and upload again.
          </p>
        </Show>
        <footer class="dialog-footer">
          <button
            type="button"
            class="secondary"
            disabled={busy()}
            onClick={() => props.close()}
          >
            Cancel
          </button>
          <button class="primary" disabled={busy() || !file()}>
            {busy() ? "Importing…" : "Import file"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
