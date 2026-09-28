import { createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import api from "../services/api";
import "../wishes.css";

export default function Wishes() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const canManage = user.role_id === 1;
  const [records, setRecords] = createSignal([]);
  const [total, setTotal] = createSignal(0);
  const [pages, setPages] = createSignal(1);
  const [page, setPage] = createSignal(1);
  const [search, setSearch] = createSignal("");
  const [start, setStart] = createSignal("");
  const [end, setEnd] = createSignal("");
  const [deleted, setDeleted] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");
  const [editing, setEditing] = createSignal(null);
  const [confirmation, setConfirmation] = createSignal(null);
  const [busy, setBusy] = createSignal(false);
  let request = 0,
    timer;
  const filters = () => ({
    search: search(),
    ...(start() && { start_date: start() }),
    ...(end() && { end_date: end() }),
  });
  async function refresh() {
    const current = ++request;
    setLoading(true);
    setError("");
    try {
      const response = await api.get(
        deleted() ? "/deleted-wishes" : "/wishes",
        { params: { ...filters(), page: page(), limit: 10 } },
      );
      if (current !== request) return;
      const data = response.data.data;
      const max = Math.max(1, data.pagination.total_pages);
      setPages(max);
      setRecords(data.records);
      setTotal(data.summary.total_wishes);
      if (page() > max) setPage(max);
    } catch (err) {
      if (current === request)
        setError(
          err.response?.data?.message || "Unable to load wishes. Please retry.",
        );
    } finally {
      if (current === request) setLoading(false);
    }
  }
  createEffect(() => {
    search();
    start();
    end();
    deleted();
    page();
    ++request;
    clearTimeout(timer);
    timer = setTimeout(refresh, 250);
  });
  onCleanup(() => {
    clearTimeout(timer);
    ++request;
  });
  const changeFilter = (setter, value) => {
    setter(value);
    setPage(1);
  };
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const row = editing();
      const payload = { name: row.name.trim() || null, wish: row.wish.trim() };
      if (!payload.wish) throw new Error("Wish cannot be blank.");
      if (row.id) await api.put(`/wishes/${row.id}`, payload);
      else await api.post("/wishes", payload);
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  }
  async function performAction() {
    setBusy(true);
    setError("");
    try {
      const { action, row } = confirmation();
      if (action === "restore") await api.put(`/wishes/${row.id}/recover`);
      else if (action === "wipe") await api.delete("/admin/wishes/wipe-all");
      else
        await api.delete(
          `${action === "permanent" ? "/admin" : ""}/wishes/${row.id}`,
        );
      setConfirmation(null);
      await refresh();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to complete action.");
    } finally {
      setBusy(false);
    }
  }
  async function exportExcel() {
    setBusy(true);
    setError("");
    try {
      const response = await api.get("/wishes/export/excel", {
        params: filters(),
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Wishes_${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Unable to export wishes. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div class="wish-admin">
      <header class="wish-admin-heading">
        <div>
          <p class="eyebrow">WISHING TREE</p>
          <h1>{deleted() ? "Deleted wishes" : "Wishes"}</h1>
          <p>
            {total()} wishes {deleted() ? "in the recycle bin" : "collected"}
          </p>
        </div>
        <div class="admin-actions">
          <a href="/display" target="_blank" rel="noreferrer">
            Open live display ↗
          </a>
          <button onClick={refresh} disabled={loading()}>
            Refresh
          </button>
          <Show when={!deleted()}>
            <button disabled={busy()} onClick={exportExcel}>
              Export Excel
            </button>
          </Show>
          <Show when={canManage}>
            <button
              class="primary"
              onClick={() => setEditing({ name: "", wish: "" })}
            >
              + Add wish
            </button>
          </Show>
        </div>
      </header>
      <section class="wish-filters" aria-label="Filter wishes">
        <label class="search-filter">
          Search
          <input
            type="search"
            placeholder="Search name or wish…"
            maxlength="1000"
            value={search()}
            onInput={(e) => changeFilter(setSearch, e.target.value)}
          />
        </label>
        <label>
          From
          <input
            type="date"
            value={start()}
            onInput={(e) => changeFilter(setStart, e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            min={start()}
            value={end()}
            onInput={(e) => changeFilter(setEnd, e.target.value)}
          />
        </label>
        <Show when={canManage}>
          <button onClick={() => changeFilter(setDeleted, !deleted())}>
            {deleted() ? "View active wishes" : "View deleted wishes"}
          </button>
        </Show>
      </section>
      <Show when={error()}>
        <p class="form-error" role="alert">
          {error()}
        </p>
      </Show>
      <div class="wish-table-wrap">
        <table class="wish-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Wish</th>
              <th>Submitted at</th>
              <Show when={canManage}>
                <th>Actions</th>
              </Show>
            </tr>
          </thead>
          <tbody>
            <Show
              when={!loading()}
              fallback={
                <tr>
                  <td colspan="4">Loading wishes…</td>
                </tr>
              }
            >
              <Show
                when={records().length}
                fallback={
                  <tr>
                    <td colspan="4">No wishes found.</td>
                  </tr>
                }
              >
                <For each={records()}>
                  {(row) => (
                    <tr>
                      <td>{row.name || "Anonymous"}</td>
                      <td class="wish-content">{row.wish}</td>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                      <Show when={canManage}>
                        <td>
                          <div class="table-actions">
                            <Show
                              when={!deleted()}
                              fallback={
                                <button
                                  onClick={() =>
                                    setConfirmation({ action: "restore", row })
                                  }
                                >
                                  Restore
                                </button>
                              }
                            >
                              <button
                                onClick={() =>
                                  setEditing({ ...row, name: row.name || "" })
                                }
                              >
                                Edit
                              </button>
                            </Show>
                            <button
                              class="danger"
                              onClick={() =>
                                setConfirmation({
                                  action: deleted() ? "permanent" : "delete",
                                  row,
                                })
                              }
                            >
                              {deleted() ? "Delete permanently" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </Show>
                    </tr>
                  )}
                </For>
              </Show>
            </Show>
          </tbody>
        </table>
      </div>
      <footer class="wish-pagination">
        <Show when={canManage}>
          <button
            class="danger"
            onClick={() => setConfirmation({ action: "wipe" })}
          >
            Wipe all wishes
          </button>
        </Show>
        <div>
          <button
            disabled={page() <= 1 || loading()}
            onClick={() => setPage(page() - 1)}
          >
            Previous
          </button>
          <span>
            Page {page()} of {pages()}
          </span>
          <button
            disabled={page() >= pages() || loading()}
            onClick={() => setPage(page() + 1)}
          >
            Next
          </button>
        </div>
      </footer>
      <Show when={editing()}>
        <div class="wish-modal-backdrop">
          <section
            class="wish-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-title"
          >
            <h2 id="edit-title">{editing().id ? "Edit wish" : "Add wish"}</h2>
            <form onSubmit={save}>
              <label>
                Name
                <input
                  autofocus
                  maxlength="255"
                  value={editing().name}
                  onInput={(e) =>
                    setEditing({ ...editing(), name: e.target.value })
                  }
                />
              </label>
              <label>
                Wish
                <textarea
                  required
                  rows="5"
                  value={editing().wish}
                  onInput={(e) =>
                    setEditing({ ...editing(), wish: e.target.value })
                  }
                />
              </label>
              <Show when={error()}>
                <p role="alert" class="form-error">
                  {error()}
                </p>
              </Show>
              <div class="admin-actions">
                <button
                  type="button"
                  disabled={busy()}
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button class="primary" disabled={busy()}>
                  {busy() ? "Saving…" : "Save wish"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </Show>
      <Show when={confirmation()}>
        <div class="wish-modal-backdrop">
          <section
            class="wish-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h2 id="confirm-title">
              {confirmation().action === "restore"
                ? "Restore wish?"
                : confirmation().action === "wipe"
                  ? "Permanently delete ALL wishes?"
                  : "Delete wish?"}
            </h2>
            <p>
              {["permanent", "wipe"].includes(confirmation().action)
                ? "This permanently removes the data and cannot be undone."
                : confirmation().action === "restore"
                  ? "This wish will appear on the live display again."
                  : "This wish will be removed from the display. You can restore it later."}
            </p>
            <Show when={error()}>
              <p role="alert" class="form-error">
                {error()}
              </p>
            </Show>
            <div class="admin-actions">
              <button disabled={busy()} onClick={() => setConfirmation(null)}>
                Cancel
              </button>
              <button class="primary" disabled={busy()} onClick={performAction}>
                {busy() ? "Working…" : "Confirm"}
              </button>
            </div>
          </section>
        </div>
      </Show>
    </div>
  );
}
