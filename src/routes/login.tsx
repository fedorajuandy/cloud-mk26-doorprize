import { createSignal, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { api } from "../lib/api";
export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = createSignal(""),
    [password, setPassword] = createSignal(""),
    [error, setError] = createSignal(""),
    [busy, setBusy] = createSignal(false);
  const [settings, setSettings] = createSignal({
    logo_url: "/abracodebra.svg",
    login_bg_color: "#f3f4f6",
  });
  onMount(async () => {
    try {
      setSettings(await api("/settings"));
    } catch {
      setError("Brand settings could not be loaded. You can still sign in.");
    }
  });
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/login", {
        method: "POST",
        body: JSON.stringify({ username: username(), password: password() }),
      });
      navigate("/", { replace: true });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      class="login-page"
      style={{ "background-color": settings().login_bg_color }}
    >
      <section class="login-card">
        <img class="login-logo" src={settings().logo_url} alt="Company logo" />
        <p class="eyebrow">MK26 DOORPRIZE</p>
        <h1>Admin portal</h1>
        <p class="muted">Sign in to manage your participants.</p>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              required
              maxlength="50"
              autocomplete="username"
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              autocomplete="current-password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
          </label>
          <Show when={error()}>
            <p class="error" role="alert">
              {error()}
            </p>
          </Show>
          <button class="primary" disabled={busy()}>
            {busy() ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <small class="muted">Authorized administrators only</small>
      </section>
    </main>
  );
}
