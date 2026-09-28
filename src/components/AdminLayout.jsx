import { A, useNavigate } from "@solidjs/router";
import {
  createContext,
  createSignal,
  onMount,
  Show,
  useContext,
} from "solid-js";
import { api } from "../lib/api.js";
const UserContext = createContext();
export const useAdmin = () => useContext(UserContext);
export default function AdminLayout(props) {
  const navigate = useNavigate();
  const [user, setUser] = createSignal();
  const [logo, setLogo] = createSignal("/abracodebra.svg");
  const [dark, setDark] = createSignal(false);
  const [error, setError] = createSignal("");
  onMount(async () => {
    setDark(localStorage.getItem("theme") === "dark");
    try {
      const [account, settings] = await Promise.all([
        api("/me"),
        api("/settings"),
      ]);
      setUser(account);
      setLogo(settings.logo_url);
    } catch (e) {
      setError(e.message);
    }
  });
  function theme() {
    const next = !dark();
    setDark(next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }
  async function logout() {
    try {
      await api("/logout", { method: "POST" });
      navigate("/login", { replace: true });
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div class="app-shell" classList={{ dark: dark() }}>
      <aside class="sidebar">
        <div class="brand">
          <img src={logo()} alt="Company logo" />
          <strong>
            MK26 <span>ADMIN CMS</span>
          </strong>
        </div>
        <nav>
          <span class="nav-label">WORKSPACE</span>
          <A href="/" end activeClass="active">
            Participants
          </A>
          <Show when={user()?.role_id === 1}>
            <A href="/admin-settings" activeClass="active">
              System settings
            </A>
          </Show>
        </nav>
        <div class="sidebar-footer">
          <button
            class="theme-switch"
            role="switch"
            aria-checked={dark()}
            aria-label="Dark mode"
            onClick={theme}
            title={dark() ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span>{dark() ? "☾ Dark mode" : "☀ Light mode"}</span>
            <span class="switch-track" aria-hidden="true">
              <span class="switch-thumb" />
            </span>
          </button>
          <div class="identity">
            <strong>{user()?.username}</strong>
            <small>{user()?.role_name}</small>
          </div>
          <button class="logout" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main>
        <Show when={error()}>
          <p role="alert" class="error">
            {error()}
          </p>
        </Show>
        <Show
          when={user()}
          fallback={<p class="muted">Loading your workspace…</p>}
        >
          {(u) => (
            <UserContext.Provider value={u()}>
              {props.children}
            </UserContext.Provider>
          )}
        </Show>
      </main>
    </div>
  );
}
