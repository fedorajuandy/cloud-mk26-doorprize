import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { API_URL, connectWishes, fetchAllWishes } from "../services/wishes";
import { readWishCache, writeWishCache } from "../lib/wishCache";
import { applyWishEvent } from "../lib/wishState";
import { createWishScene } from "../lib/wishScene";
import "../wishes.css";

export default function WishDisplay() {
  const params = new URLSearchParams(location.search);
  const transport = params.get("transport") === "ws" ? "ws" : "sse";
  const [status, setStatus] = createSignal("connecting");
  const [count, setCount] = createSignal(0);
  const [round, setRound] = createSignal(0);
  const [cacheError, setCacheError] = createSignal(false);
  const [syncError, setSyncError] = createSignal(false);
  let container,
    scene,
    disconnect,
    interval,
    cacheTimer,
    disposed = false,
    syncing = false,
    again = false;
  let records = [],
    buffer = [],
    ready = false;
  const seen = new Set();
  const controller = new AbortController();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const cacheKey = `${API_URL}:${user.id || user.username || "display"}`;
  function publish(newRecords = []) {
    if (disposed) return;
    setCount(records.length);
    scene?.update(records, newRecords);
    if (cacheTimer) return;
    cacheTimer = setTimeout(() => {
      cacheTimer = null;
      writeWishCache(cacheKey, records)
        .then(() => setCacheError(false))
        .catch(() => setCacheError(true));
    }, 400);
  }
  function receive(type, data, id) {
    if (disposed || (id && seen.has(id))) return;
    if (id) {
      seen.add(id);
      if (seen.size > 1024) seen.delete(seen.values().next().value);
    }
    if (syncing) buffer.push({ type, data });
    const isNew =
      ["wish:created", "wish:recovered"].includes(type) &&
      !records.some((row) => String(row.id) === String(data.id));
    records = applyWishEvent(records, type, data);
    publish(isNew ? [data] : []);
  }
  async function reconcile() {
    if (disposed) return;
    if (syncing) {
      again = true;
      return;
    }
    syncing = true;
    buffer = [];
    try {
      let snapshot = await fetchAllWishes(controller.signal);
      if (disposed) return;
      // Events received during paginated reads win over the HTTP snapshot.
      for (const event of buffer)
        snapshot = applyWishEvent(snapshot, event.type, event.data);
      const previous = new Set(records.map((row) => String(row.id)));
      const newRecords = ready
        ? snapshot.filter((row) => !previous.has(String(row.id)))
        : [];
      records = snapshot;
      ready = true;
      setSyncError(false);
      publish(newRecords);
    } catch (err) {
      if (disposed) return;
      setSyncError(true);
      if ([401, 403].includes(err.response?.status)) {
        setStatus("auth");
        disconnect?.();
      }
    } finally {
      syncing = false;
      buffer = [];
      if (again && !disposed) {
        again = false;
        void reconcile();
      }
    }
  }
  onMount(async () => {
    scene = createWishScene(container, setRound);
    try {
      records = await readWishCache(cacheKey);
      if (disposed) return;
      ready = records.length > 0;
      setCount(records.length);
      scene.update(records);
    } catch {
      setCacheError(true);
    }
    if (disposed) return;
    disconnect = connectWishes(transport, {
      onEvent: receive,
      onStatus: (value) => {
        if (status() !== "auth") setStatus(value);
      },
      onReady: reconcile,
      onReset: reconcile,
    });
    void reconcile();
    interval = setInterval(() => {
      if (status() !== "auth") void reconcile();
    }, 60000);
    window.addEventListener("online", reconcile);
  });
  onCleanup(() => {
    disposed = true;
    controller.abort();
    disconnect?.();
    scene?.dispose();
    clearInterval(interval);
    clearTimeout(cacheTimer);
    window.removeEventListener("online", reconcile);
  });
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* Some iPad browsers do not expose fullscreen; the display remains usable. */
    }
  }
  return (
    <main class="live-display">
      <div class="display-stars" aria-hidden="true" />
      <header class="display-header">
        <span class="display-title">
          <i classList={{ connected: status() === "live" }} /> WISHING TREE{" "}
          <span>· LIVE DISPLAY</span>
        </span>
        <div class="display-controls">
          <a
            href={
              transport === "sse"
                ? "/display?transport=ws"
                : "/display?transport=sse"
            }
          >
            {transport.toUpperCase()} ⇄
          </a>
          <button onClick={fullscreen} aria-label="Toggle fullscreen">
            ⛶
          </button>
        </div>
      </header>
      <div ref={container} class="wish-scene" aria-label="Animated wishes" />
      <Show when={!count()}>
        <section class="display-empty">
          <span>✦</span>
          <h1>
            Every wish begins
            <br />
            with a little hope.
          </h1>
          <p>
            {status() === "live"
              ? "Be the first to add yours."
              : "Waiting for wishes…"}
          </p>
        </section>
      </Show>
      <footer class="display-footer">
        <span role="status">
          {status() === "live"
            ? "● Live"
            : status() === "auth"
              ? "Session expired or access denied · playing saved wishes"
              : "Reconnecting · playing saved wishes"}
          <Show when={syncError() && status() !== "auth"}>
            {" "}
            · Sync unavailable
          </Show>
          <Show when={cacheError()}> · Local backup unavailable</Show>
        </span>
        <span>
          {count()} wishes · Round {round()}
          <Show when={status() === "auth"}>
            {" "}
            · <a href="/login?returnTo=%2Fdisplay">Sign in</a>
          </Show>
        </span>
      </footer>
    </main>
  );
}
