import { createSignal, Show } from "solid-js";
import Modal from "../../components/Modal.jsx";
import { api } from "../../lib/api.js";
export default function ResetParticipantResults(props) {
  const [confirmation, setConfirmation] = createSignal("");
  const [scope, setScope] = createSignal("all");
  const [prize, setPrize] = createSignal("");
  const [babak, setBabak] = createSignal("");
  const [sesi, setSesi] = createSignal("");
  const needs = (key) =>
    scope() === key ||
    scope() === "specific" ||
    (scope() === "babak_prize" && ["babak", "prize"].includes(key));
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
        body: JSON.stringify({
          confirmation: confirmation(),
          scope: scope(),
          ...(needs("prize") ? { prize: prize() } : {}),
          ...(needs("babak") ? { babak: Number(babak()) } : {}),
          ...(needs("sesi") ? { sesi: Number(sesi()) } : {}),
        }),
      });
      props.done(result.updated);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Reset participant results" busy={busy()} close={props.close}>
      <form onSubmit={reset}>
        <label>
          Reset scope
          <select
            aria-label="Reset scope"
            value={scope()}
            disabled={busy()}
            onChange={(event) => {
              setScope(event.currentTarget.value);
              setConfirmation("");
            }}
          >
            <option value="all">Semua hasil</option>
            <option value="babak">Per babak</option>
            <option value="babak_prize">Per hadiah dalam babak</option>
            <option value="specific">Per sesi dalam hadiah dan babak</option>
          </select>
        </label>
        <Show when={needs("babak")}>
          <label>
            Babak
            <input
              required
              type="number"
              min="0"
              max="4294967295"
              step="1"
              value={babak()}
              disabled={busy()}
              onInput={(e) => {
                setBabak(e.currentTarget.value);
                setConfirmation("");
              }}
            />
          </label>
        </Show>
        <Show when={needs("prize")}>
          <label>
            Exact prize
            <input
              required
              maxlength="16000"
              value={prize()}
              disabled={busy()}
              onInput={(e) => {
                setPrize(e.currentTarget.value);
                setConfirmation("");
              }}
            />
          </label>
        </Show>
        <Show when={needs("sesi")}>
          <label>
            Sesi
            <input
              required
              type="number"
              min="0"
              max="4294967295"
              step="1"
              value={sesi()}
              disabled={busy()}
              onInput={(e) => {
                setSesi(e.currentTarget.value);
                setConfirmation("");
              }}
            />
          </label>
        </Show>
        <p>
          This clears prize, babak, and sesi and sets is_invalid to false for
          {scope() === "all"
            ? "every participant"
            : "participants matching the reset scope above"}
          , including invalid winners and archived records. Table filters do not
          apply. All fields in the selected scope must match. Participant
          details and archive status are preserved. Active participants become
          eligible for the draw again. Previous results cannot be restored by
          this action. Queued or published source-site awards are not canceled.
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
            {busy()
              ? "Resetting…"
              : scope() === "all"
                ? "Reset all participant results"
                : "Reset matching participant results"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
