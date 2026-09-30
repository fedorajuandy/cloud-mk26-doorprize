import { createSignal, Show } from "solid-js";
import Modal from "../../components/Modal.jsx";
import { api } from "../../lib/api.js";
export default function DeleteAllParticipants(props) {
  const [confirmation, setConfirmation] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  async function remove(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/participants/purge", {
        method: "DELETE",
        body: JSON.stringify({ confirmation: confirmation() }),
      });
      props.done(result.deleted);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Permanently delete all participants"
      busy={busy()}
      close={props.close}
    >
      <form onSubmit={remove}>
        <p>
          This permanently deletes every participant, including archived records
          and winners. Current filters do not apply. This cannot be undone.
          Admin accounts and system settings are preserved. Queued or published
          source-site awards are not canceled.
        </p>
        <Show when={error()}>
          <p role="alert" class="error">
            {error()}
          </p>
        </Show>
        <label>
          Type DELETE ALL PARTICIPANTS to confirm
          <input
            value={confirmation()}
            onInput={(event) => setConfirmation(event.currentTarget.value)}
            autocomplete="off"
            disabled={busy()}
          />
        </label>
        <div class="dialog-footer">
          <button
            type="button"
            class="secondary"
            disabled={busy()}
            onClick={() => props.close()}
          >
            Cancel
          </button>
          <button
            class="danger-button"
            disabled={busy() || confirmation() !== "DELETE ALL PARTICIPANTS"}
          >
            {busy() ? "Deleting…" : "Permanently delete all participants"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
