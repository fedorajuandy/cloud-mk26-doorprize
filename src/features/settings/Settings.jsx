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
  const [branding, setBranding] = createSignal({
    logo_url: "",
    login_bg_color: "#f3f4f6",
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
      if (tab() === "branding") setBranding(await api("/settings"));
      else if (tab() === "access")
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
          login_bg_color: branding().login_bg_color,
        }),
      });
      setNotice(
        "Branding saved. It will appear the next time a page is opened.",
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
              <p class="muted">Customize the logo and login background.</p>
            </div>
          </div>
          <form class="card settings-card" onSubmit={saveBranding}>
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
            <div
              class="branding-preview"
              style={{ "background-color": branding().login_bg_color }}
            >
              <img
                src={branding().logo_url || "/abracodebra.svg"}
                alt="Logo preview"
              />
            </div>
            <button class="primary" disabled={busy()}>
              {busy() ? "Saving…" : "Save branding"}
            </button>
          </form>
        </Match>
      </Switch>
    </Show>
  );
}
