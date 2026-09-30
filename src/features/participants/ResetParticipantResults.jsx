import { createSignal, Show } from "solid-js";
import Modal from "../../components/Modal.jsx";
import { api } from "../../lib/api.js";
export default function ResetParticipantResults(props) {
  const [confirmation, setConfirmation] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  async function reset(event) {
    event.preventDefault();
    if (busy()) return;
    setBusy(true);
    setError("");
    try {
      const result = await api("/participants/reset-results", {
        method: "POST",
        body: JSON.stringify({ confirmation: confirmation() }),
      });
      props.done(result.updated);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Reset all participant results"
      busy={busy()}
      close={props.close}
    >
      <form onSubmit={reset}>
        <p>
          This clears prize, babak, and sesi for every participant, including
          archived records. Current filters do not apply. Participant details
          and archive status are preserved. Active participants become eligible
          for the draw again. Previous results cannot be restored by this
          action. Queued or published source-site awards are not canceled.
        </p>
        <Show when={error()}>
          <p role="alert" class="error">
            {error()}
          </p>
        </Show>
        <label>
          Type RESET ALL RESULTS to confirm
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
            disabled={busy() || confirmation() !== "RESET ALL RESULTS"}
          >
            {busy() ? "Resetting…" : "Reset all participant results"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
