import {
  createSignal,
  createEffect,
  For,
  onMount,
  Show,
  Switch,
  Match,
} from "solid-js";
import { useAdmin } from "../../components/AdminLayout.jsx";
import { loginBackground } from "../../lib/branding.js";
import CrudTable from "../../components/CrudTable.jsx";
import { allRecords, api } from "../../lib/api.js";
export default function Settings() {
  const user = useAdmin();
  const [tab, setTab] = createSignal("users"),
    [roles, setRoles] = createSignal([]),
    [permissions, setPermissions] = createSignal([]);
  const [selectedRole, setSelectedRole] = createSignal(""),
    [selected, setSelected] = createSignal([]),
    [error, setError] = createSignal(""),
    [notice, setNotice] = createSignal(""),
    [busy, setBusy] = createSignal(false);
  const [brandingLoading, setBrandingLoading] = createSignal(true);
  const [branding, setBranding] = createSignal({
    logo_url: "",
    favicon_url: "/mandiri.svg",
    login_bg_color: "#f3f4f6",
    login_bg_image: null,
  });
  async function loadRoles() {
    const result = await api("/role-permissions");
    setRoles(result);
    if (selectedRole()) chooseRole(selectedRole());
  }
  async function loadPermissions() {
    setPermissions(await allRecords("/permissions"));
  }
  async function load() {
    setError("");
    try {
      if (tab() === "branding") {
        setBrandingLoading(true);
        setBranding(await api("/settings"));
        setBrandingLoading(false);
      } else if (tab() === "access")
        await Promise.all([loadRoles(), loadPermissions()]);
      else await loadRoles();
    } catch (e) {
      setError(e.message);
    }
  }
  onMount(() => {
    if (user.role_id === 1) void load();
  });
  createEffect(() => {
    const active = tab();
    if (user.role_id === 1 && (active === "access" || active === "branding"))
      void load();
  });
  function chooseRole(id) {
    setSelectedRole(id);
    setSelected(
      roles()
        .find((r) => String(r.id) === id)
        ?.permissions.map((p) => p.id) || [],
    );
    setNotice("");
  }
  async function savePermissions(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/role-permissions/${selectedRole()}`, {
        method: "PUT",
        body: JSON.stringify({ permission_ids: selected() }),
      });
      await loadRoles();
      setNotice("Role permissions saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveBranding(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/settings", {
        method: "PUT",
        body: JSON.stringify({
          logo_url: branding().logo_url,
          favicon_url: branding().favicon_url,
          login_bg_color: branding().login_bg_color,
          login_bg_image: branding().login_bg_image || null,
        }),
      });
      const icon = document.querySelector('link[rel="icon"]');
      if (icon) icon.setAttribute("href", `/api/favicon?v=${Date.now()}`);
      setNotice(
        "Branding saved. Tab icon updated. It will appear the next time a page is opened.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Show
      when={user.role_id === 1}
      fallback={
        <p class="error">System settings are available to Super Admins only.</p>
      }
    >
      <nav class="tabs" aria-label="System settings">
        <For
          each={[
            ["users", "Admin management"],
            ["roles", "Roles"],
            ["access", "Role permissions"],
            ["permissions", "Permission registry"],
            ["branding", "UI customization"],
          ]}
        >
          {([id, title]) => (
            <button
              classList={{ active: tab() === id }}
              onClick={() => {
                setTab(id);
                setError("");
                setNotice("");
              }}
            >
              {title}
            </button>
          )}
        </For>
      </nav>
      <Show when={error()}>
        <p class="error" role="alert">
          {error()}{" "}
          <button class="text-button" onClick={load}>
            Retry
          </button>
        </p>
      </Show>
      <Show when={notice()}>
        <p role="status" class="success">
          {notice()}
        </p>
      </Show>
      <Switch>
        <Match when={tab() === "users"}>
          <CrudTable
            resource="users"
            title="Administrators"
            singular="Administrator"
            description="Manage internal accounts and their role assignments."
            fields={[
              { key: "username", label: "Username", required: true, max: 50 },
              {
                key: "password",
                label: "Password",
                type: "password",
                required: true,
                max: 72,
              },
              {
                key: "role_id",
                defaultValue: 2,
                label: "Role",
                type: "select",
                required: true,
                options: roles().map((r) => ({
                  value: r.id,
                  label: r.role_name,
                })),
              },
            ]}
            columns={["username", "role_id"]}
            canCreate
            canUpdate
            canDelete
          />
        </Match>
        <Match when={tab() === "roles"}>
          <CrudTable
            resource="roles"
            title="Roles"
            singular="Role"
            description="Create roles for your team. The two built-in roles are protected."
            fields={[
              { key: "role_name", label: "Role name", required: true, max: 50 },
            ]}
            columns={["role_name"]}
            canCreate
            canUpdate
            canDelete
            changed={load}
          />
        </Match>
        <Match when={tab() === "permissions"}>
          <CrudTable
            resource="permissions"
            title="Permissions"
            singular="Permission"
            description="Register permission keys. Participant access uses view_, create_, update_, and delete_participants."
            fields={[
              {
                key: "permission_name",
                label: "Permission key",
                required: true,
                max: 100,
              },
            ]}
            columns={["permission_name"]}
            canCreate
            canUpdate
            canDelete
            changed={load}
          />
        </Match>
        <Match when={tab() === "access"}>
          <div class="page-heading">
            <div>
              <p class="eyebrow">SYSTEM SETTINGS</p>
              <h1>Role permissions</h1>
              <p class="muted">Choose which actions each role can perform.</p>
            </div>
          </div>
          <form class="card settings-card" onSubmit={savePermissions}>
            <label>
              Role
              <select
                value={selectedRole()}
                onChange={(e) => chooseRole(e.currentTarget.value)}
              >
                <option value="">Select a role</option>
                <For each={roles()}>
                  {(r) => <option value={r.id}>{r.role_name}</option>}
                </For>
              </select>
            </label>
            <Show when={selectedRole()}>
              <Show
                when={selectedRole() !== "1"}
                fallback={
                  <p class="muted">
                    Super Admin has full access. Its permissions cannot be
                    revoked.
                  </p>
                }
              >
                <fieldset disabled={busy()}>
                  <legend>Allowed actions</legend>
                  <For
                    each={permissions()}
                    fallback={<p>No permissions registered yet.</p>}
                  >
                    {(p) => (
                      <label class="checkbox">
                        <input
                          type="checkbox"
                          checked={selected().includes(p.id)}
                          onChange={(e) =>
                            setSelected((ids) =>
                              e.currentTarget.checked
                                ? [...ids, p.id]
                                : ids.filter((id) => id !== p.id),
                            )
                          }
                        />
                        {p.permission_name}
                      </label>
                    )}
                  </For>
                </fieldset>
                <button class="primary" disabled={busy()}>
                  {busy() ? "Saving…" : "Save permissions"}
                </button>
              </Show>
            </Show>
          </form>
        </Match>
        <Match when={tab() === "branding"}>
          <div class="page-heading">
            <div>
              <p class="eyebrow">SYSTEM SETTINGS</p>
              <h1>UI customization</h1>
              <p class="muted">
                Customize the logo, browser tab icon, and login background.
              </p>
            </div>
          </div>
          <form class="card settings-card" onSubmit={saveBranding}>
            <fieldset
              disabled={brandingLoading() || busy()}
              style={{ display: "contents" }}
            >
              <label>
                Logo URL
                <input
                  required
                  maxlength="255"
                  placeholder="/abracodebra.svg"
                  value={branding().logo_url}
                  onInput={(e) =>
                    setBranding((v) => ({
                      ...v,
                      logo_url: e.currentTarget.value,
                    }))
                  }
                />
                <small class="muted">
                  Use a local absolute path or an HTTPS image URL.
                </small>
              </label>
              <label>
                Browser tab icon URL
                <input
                  required
                  maxlength="255"
                  placeholder="/mandiri.svg"
                  value={branding().favicon_url || "/mandiri.svg"}
                  onInput={(e) =>
                    setBranding((v) => ({
                      ...v,
                      favicon_url: e.currentTarget.value,
                    }))
                  }
                />
                <small class="muted">
                  Use a square SVG, PNG, or ICO image. Place local files in
                  public/ and enter /filename.svg, or use an HTTPS image URL.
                </small>
              </label>
              <div>
                <p class="muted">Browser tab icon preview</p>
                <img
                  src={branding().favicon_url || "/mandiri.svg"}
                  alt="Browser tab icon preview"
                  width="32"
                  height="32"
                  style={{ "object-fit": "contain" }}
                />
              </div>
              <label>
                Login background image URL
                <input
                  aria-label="Login background image URL"
                  maxlength="2048"
                  placeholder="/login-background.jpg"
                  value={branding().login_bg_image || ""}
                  onInput={(event) =>
                    setBranding((value) => ({
                      ...value,
                      login_bg_image: event.currentTarget.value,
                    }))
                  }
                />
                <small class="muted">
                  Optional. Use a local image path or HTTPS URL. Leave blank to
                  use the background color. The image fills the screen behind
                  the sign-in card.
                </small>
              </label>
              <label>
                Login background
                <input
                  type="color"
                  value={branding().login_bg_color}
                  onInput={(e) =>
                    setBranding((v) => ({
                      ...v,
                      login_bg_color: e.currentTarget.value,
                    }))
                  }
                />
              </label>
              <div class="branding-preview" style={loginBackground(branding())}>
                <img
                  src={branding().logo_url || "/abracodebra.svg"}
                  alt="Logo preview"
                />
              </div>
              <button class="primary" disabled={busy()}>
                {busy() ? "Saving…" : "Save branding"}
              </button>
            </fieldset>
          </form>
        </Match>
      </Switch>
    </Show>
  );
}
