import { createSignal, Show } from "solid-js";
import Modal from "../../components/Modal.jsx";
import { api } from "../../lib/api.js";
export default function SeedParticipants(props) {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  async function seed(event) {
    event.preventDefault();
    if (busy()) return;
    setBusy(true);
    setError("");
    try {
      const result = await api("/participants/seed-dummy", {
        method: "POST",
        body: JSON.stringify({}),
      });
      props.done(result.inserted);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Add dummy participants" busy={busy()} close={props.close}>
      <form onSubmit={seed}>
        <p>
          Add 2,800 participants labeled “Dummy Participant”, each with a unique
          dummy NIP and no prize or babak assigned.
        </p>
        <p>
          Existing participants stay unchanged. Each run adds another 2,800
          records, which are eligible for the roulette draw.
        </p>
        <Show when={error()}>
          <p role="alert" class="error">
            {error()}
          </p>
        </Show>
        <div class="dialog-footer">
          <button
            type="button"
            class="secondary"
            disabled={busy()}
            onClick={() => props.close()}
          >
            Cancel
          </button>
          <button class="primary" disabled={busy()}>
            {busy() ? "Adding participants…" : "Add 2,800 dummy participants"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
