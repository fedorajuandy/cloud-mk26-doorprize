import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { connectWishes, phoneSocket, wishesApi } from "../services/wishes";
import "../wishes.css";

export default function SubmitWish(props) {
  const isPhone = props.transport === "ws";
  const [name, setName] = createSignal("");
  const [wish, setWish] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal("connecting");
  const [error, setError] = createSignal("");
  const [success, setSuccess] = createSignal(false);
  const [liveConfirmed, setLiveConfirmed] = createSignal(false);
  let savedId;
  const received = new Set();
  let socket,
    disconnect,
    disposed = false,
    connectionGeneration = 0;
  function streamStatus(value, generation) {
    if (disposed || generation !== connectionGeneration) return;
    setStatus(value);
  }
  function reconnect() {
    if (busy() || disposed) return;
    const generation = ++connectionGeneration;
    socket?.removeAllListeners();
    socket?.disconnect();
    disconnect?.();
    setStatus("connecting");
    if (isPhone) {
      socket = phoneSocket();
      socket.on("connect", () => setStatus("live"));
      socket.on("disconnect", () => setStatus("offline"));
      socket.on("connect_error", () => setStatus("offline"));
    } else {
      disconnect = connectWishes("sse", {
        onStatus: (value) => streamStatus(value, generation),
        onEvent: (type, row) => {
          if (type !== "wish:created") return;
          received.add(String(row.id));
          if (received.size > 100)
            received.delete(received.values().next().value);
          if (String(row.id) === savedId) setLiveConfirmed(true);
        },
      });
    }
  }
  onMount(reconnect);
  onCleanup(() => {
    disposed = true;
    socket?.disconnect();
    disconnect?.();
  });
  async function submit(event) {
    event.preventDefault();
    if (busy()) return;
    setError("");
    setLiveConfirmed(false);
    savedId = undefined;
    const payload = { name: name().trim(), wish: wish().trim() };
    if (!payload.name || !payload.wish)
      return setError("Silakan isi nama dan harapan Anda.");
    if (new TextEncoder().encode(payload.wish).length > 65535)
      return setError("Harapan terlalu panjang. Silakan persingkat.");
    if (isPhone && !socket?.connected)
      return setError("Koneksi terputus. Tunggu hingga tersambung kembali.");
    setBusy(true);
    try {
      if (isPhone) {
        const result = await socket
          .timeout(10000)
          .emitWithAck("wish:create", payload);
        if (result.status !== 201)
          throw Object.assign(new Error(result.message), { definite: true });
      } else {
        const response = await wishesApi.post("/wishes", payload);
        savedId = String(response.data.data.id);
        setLiveConfirmed(received.has(savedId));
      }
      setSuccess(true);
      setName("");
      setWish("");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (!err.response && !err.definite
            ? "Konfirmasi belum diterima. Harapan mungkin sudah tersimpan. Periksa layar sebelum mengirim ulang."
            : err.message || "Harapan belum terkirim. Silakan coba lagi."),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main class="submission-page">
      <Show when={!isPhone}>
        <button
          type="button"
          class="kiosk-reconnect"
          aria-label="Reconnect SSE"
          title="Reconnect SSE"
          disabled={busy()}
          onClick={reconnect}
        >
          ↻
        </button>
      </Show>
      <form class="submission-form" onSubmit={submit}>
        <header>
          <span class="event-badge">EVENT TECH 2026</span>
          <h1>Wishing Tree</h1>
          <p>Silakan masukkan nama dan harapan Anda.</p>
          <Show when={isPhone}>
            <button type="button" class="phone-reconnect" disabled={busy()} onClick={reconnect}>
              ↻ Reconnect
            </button>
          </Show>
        </header>
        <Show
          when={!success()}
          fallback={
            <section class="submission-success" role="status">
              <span class="success-mark">✓</span>
              <h2>Terima kasih!</h2>
              <p>
                Harapan Anda telah terkirim.
                <br />
                Semoga harapan baik menjadi kenyataan.
              </p>
              <Show when={liveConfirmed()}>
                <p>Harapan telah diterima oleh siaran langsung.</p>
              </Show>
            </section>
          }
        >
          <section class="submission-fields">
            <label for="wish-name">Nama *</label>
            <input
              id="wish-name"
              autocomplete="name"
              placeholder="Contoh: Budiman Santoso"
              maxlength="255"
              required
              value={name()}
              onInput={(e) => setName(e.target.value)}
              disabled={busy()}
            />
            <label for="wish-message">Harapan *</label>
            <textarea
              id="wish-message"
              rows="2"
              placeholder="Contoh: Semoga sukses terus!"
              required
              value={wish()}
              onInput={(e) => setWish(e.target.value)}
              disabled={busy()}
            />
          </section>
        </Show>
        <footer>
          <Show when={error()}>
            <p class="form-error" role="alert">
              {error()}
            </p>
          </Show>
          <Show when={status() !== "live"}>
            <p class="connection-note" role="status">
              {status() === "connecting"
                ? "Menghubungkan…"
                : status() === "auth"
                  ? "Sesi siaran langsung berakhir. "
                  : "Koneksi langsung terputus. Menghubungkan kembali…"}
              <Show when={status() === "auth"}>
                <a href="/login?returnTo=%2Fipad">Masuk kembali</a>
              </Show>
            </p>
          </Show>
          <Show
            when={!success()}
            fallback={
              <button
                type="button"
                onClick={() => {
                  setSuccess(false);
                  setError("");
                }}
              >
                Kirim harapan lainnya
              </button>
            }
          >
            <button
              type="submit"
              disabled={busy() || (isPhone && status() !== "live")}
            >
              {busy() ? "Mengirim…" : "Submit"}
            </button>
          </Show>
        </footer>
      </form>
    </main>
  );
}
