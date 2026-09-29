import { createSignal, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { loginBackground } from "../lib/branding.js";
import { api } from "../lib/api.js";
export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = createSignal(""),
    [password, setPassword] = createSignal(""),
    [error, setError] = createSignal(""),
    [busy, setBusy] = createSignal(false);
  const [settings, setSettings] = createSignal({
    logo_url: "/abracodebra.svg",
    login_bg_color: "#f3f4f6",
    login_bg_image: null,
  });
  onMount(async () => {
    try {
      setSettings(await api("/settings"));
    } catch {
      setError("Brand settings could not be loaded. You can still sign in.");
    }
  });
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/login", {
        method: "POST",
        body: JSON.stringify({ username: username(), password: password() }),
      });
      navigate("/", { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main class="login-page" style={loginBackground(settings())}>
      <section class="login-card">
        <img class="login-logo" src={settings().logo_url} alt="Company logo" />
        <p class="eyebrow">MANDIRI CARNAVAL 2026 DOORPRIZE</p>
        <h1>Admin portal</h1>
        <p class="muted">Sign in to manage your participants</p>
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
