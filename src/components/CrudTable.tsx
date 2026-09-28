import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { api } from "../lib/api";
import Modal from "./Modal";
export type Field = {
  key: string;
  label: string;
  required?: boolean;
  max?: number;
  defaultValue?: string | number;
  type?: "text" | "password" | "number" | "textarea" | "select";
  options?: { value: number; label: string }[];
};
type Props = {
  resource: string;
  title: string;
  singular: string;
  description: string;
  fields: Field[];
  columns: string[];
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  participants?: boolean;
  changed?: () => void;
};
export default function CrudTable(props: Props) {
  const [records, setRecords] = createSignal<any[]>([]),
    [page, setPage] = createSignal(1),
    [pages, setPages] = createSignal(1),
    [total, setTotal] = createSignal(0);
  const [search, setSearch] = createSignal(""),
    [deleted, setDeleted] = createSignal(false),
    [start, setStart] = createSignal(""),
    [end, setEnd] = createSignal(""),
    [round, setRound] = createSignal("");
  const [loading, setLoading] = createSignal(true),
    [error, setError] = createSignal(""),
    [notice, setNotice] = createSignal(""),
    [busy, setBusy] = createSignal(false);
  const [editing, setEditing] = createSignal<Record<string, any> | null>(null),
    [confirmation, setConfirmation] = createSignal<any>(null),
    [formError, setFormError] = createSignal("");
  let sequence = 0;
  async function refresh() {
    const current = ++sequence;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page()),
      limit: "20",
      search: search(),
      deleted: String(deleted()),
    });
    if (start()) params.set("start_date", start());
    if (end()) params.set("end_date", end());
    if (round() !== "") params.set("babak", round());
    try {
      const data = await api(`/${props.resource}?${params}`);
      if (current !== sequence) return;
      setRecords(data.records);
      setTotal(data.pagination.total);
      setPages(data.pagination.total_pages);
      if (page() > data.pagination.total_pages)
        setPage(data.pagination.total_pages);
    } catch (e: any) {
      if (current === sequence) setError(e.message);
    } finally {
      if (current === sequence) setLoading(false);
    }
  }
  createEffect(() => {
    search();
    page();
    deleted();
    start();
    end();
    round();
    props.resource;
    ++sequence;
    const timer = setTimeout(refresh, 200);
    onCleanup(() => clearTimeout(timer));
  });
  onCleanup(() => {
    ++sequence;
  });
  function open(row?: any) {
    setFormError("");
    setEditing(
      row
        ? { ...row, password: "" }
        : Object.fromEntries(
            props.fields.map((f) => [
              f.key,
              f.defaultValue ??
                (f.type === "select" ? (f.options?.[0]?.value ?? "") : ""),
            ]),
          ),
    );
  }
  async function save(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    const row = editing()!;
    const data: any = {};
    for (const f of props.fields) {
      const value = row[f.key];
      if (f.type === "password" && row.id && !value) continue;
      data[f.key] =
        f.type === "number" || f.type === "select"
          ? value === "" || value == null
            ? null
            : Number(value)
          : value || (f.required ? "" : null);
    }
    try {
      await api(`/${props.resource}${row.id ? `/${row.id}` : ""}`, {
        method: row.id ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      setEditing(null);
      setNotice(`${props.singular} saved.`);
      await refresh();
      props.changed?.();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function execute() {
    setBusy(true);
    setFormError("");
    const item = confirmation();
    try {
      await api(`/${props.resource}/${item.id}${deleted() ? "/restore" : ""}`, {
        method: deleted() ? "PUT" : "DELETE",
      });
      setConfirmation(null);
      setNotice(`${props.singular} ${deleted() ? "restored" : "archived"}.`);
      await refresh();
      props.changed?.();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const label = (key: string) =>
    props.fields.find((f) => f.key === key)?.label || key;
  const value = (row: any, key: string) => {
    const field = props.fields.find((f) => f.key === key);
    return field?.type === "select"
      ? field.options?.find((o) => String(o.value) === String(row[key]))
          ?.label || row[key]
      : row[key];
  };
  return (
    <section>
      <div class="page-heading">
        <div>
          <p class="eyebrow">
            {props.participants ? "DOORPRIZE MANAGEMENT" : "SYSTEM SETTINGS"}
          </p>
          <h1>{props.title}</h1>
          <p class="muted">{props.description}</p>
        </div>
        <Show when={props.canCreate && !deleted()}>
          <button class="primary" onClick={() => open()}>
            + Add {props.singular.toLowerCase()}
          </button>
        </Show>
      </div>
      <Show when={notice()}>
        <p role="status" class="success">
          {notice()}
        </p>
      </Show>
      <div class="card">
        <div class="table-toolbar">
          <div>
            <strong>
              {deleted() ? "Archived" : "All"} {props.title.toLowerCase()}
            </strong>
            <span class="count">{total()}</span>
          </div>
          <div class="toolbar-actions">
            <label class="search">
              <span class="sr-only">Search {props.title.toLowerCase()}</span>
              <input
                type="search"
                placeholder={`Search ${props.title.toLowerCase()}…`}
                value={search()}
                onInput={(e) => {
                  setSearch(e.currentTarget.value);
                  setPage(1);
                }}
              />
            </label>
            <select
              aria-label="Record status"
              value={String(deleted())}
              onChange={(e) => {
                setDeleted(e.currentTarget.value === "true");
                setPage(1);
              }}
            >
              <option value="false">Active records</option>
              <option value="true">Archived records</option>
            </select>
            <button class="secondary" onClick={refresh} disabled={loading()}>
              Refresh
            </button>
          </div>
        </div>
        <Show when={props.participants}>
          <div class="filters">
            <label>
              Created from
              <input
                type="date"
                value={start()}
                onInput={(e) => {
                  setStart(e.currentTarget.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              Created to
              <input
                type="date"
                value={end()}
                min={start()}
                onInput={(e) => {
                  setEnd(e.currentTarget.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              Babak
              <input
                type="number"
                min="0"
                placeholder="All rounds"
                value={round()}
                onInput={(e) => {
                  setRound(e.currentTarget.value);
                  setPage(1);
                }}
              />
            </label>
            <button
              class="text-button"
              onClick={() => {
                setSearch("");
                setStart("");
                setEnd("");
                setRound("");
                setPage(1);
              }}
            >
              Clear filters
            </button>
          </div>
        </Show>
        <Show when={error()}>
          <p role="alert" class="error">
            {error()}{" "}
            <button class="text-button" onClick={refresh}>
              Retry
            </button>
          </p>
        </Show>
        <div class="table-scroll" aria-busy={loading()}>
          <table>
            <thead>
              <tr>
                <For each={props.columns}>{(key) => <th>{label(key)}</th>}</For>
                <th class="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              <Show
                when={!loading()}
                fallback={
                  <tr>
                    <td colspan={props.columns.length + 1} class="empty">
                      Loading records…
                    </td>
                  </tr>
                }
              >
                <For
                  each={records()}
                  fallback={
                    <tr>
                      <td colspan={props.columns.length + 1} class="empty">
                        <strong>No {props.title.toLowerCase()} found</strong>
                        <p>
                          {search()
                            ? "Try another search or clear your filters."
                            : "Records you add will appear here."}
                        </p>
                      </td>
                    </tr>
                  }
                >
                  {(row) => (
                    <tr>
                      <For each={props.columns}>
                        {(key) => (
                          <td
                            classList={{
                              "name-cell": key === props.columns[0],
                            }}
                          >
                            {value(row, key) ?? <span class="muted">—</span>}
                          </td>
                        )}
                      </For>
                      <td class="actions">
                        <Show when={!deleted() && props.canUpdate}>
                          <button class="text-button" onClick={() => open(row)}>
                            Edit
                          </button>
                        </Show>
                        <Show
                          when={deleted() ? props.canUpdate : props.canDelete}
                        >
                          <button
                            classList={{ danger: !deleted() }}
                            class="text-button"
                            onClick={() => {
                              setFormError("");
                              setConfirmation(row);
                            }}
                          >
                            {deleted() ? "Restore" : "Archive"}
                          </button>
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </Show>
            </tbody>
          </table>
        </div>
        <footer class="pagination">
          <span>
            {total()} records · Page {page()} of {pages()}
          </span>
          <div>
            <button
              class="secondary"
              disabled={page() <= 1 || loading()}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              class="secondary"
              disabled={page() >= pages() || loading()}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </footer>
      </div>
      <Show when={editing()}>
        <Modal
          title={`${editing()!.id ? "Edit" : "Add"} ${props.singular.toLowerCase()}`}
          close={() => setEditing(null)}
          busy={busy()}
        >
          <form onSubmit={save}>
            <div class="form-grid">
              <For each={props.fields}>
                {(field) => (
                  <label classList={{ wide: field.type === "textarea" }}>
                    {field.label}
                    {field.required ? " *" : ""}
                    <Show
                      when={field.type === "select"}
                      fallback={
                        <Show
                          when={field.type === "textarea"}
                          fallback={
                            <input
                              type={field.type || "text"}
                              required={
                                field.required &&
                                !(field.type === "password" && editing()?.id)
                              }
                              minlength={
                                field.type === "password" ? 12 : undefined
                              }
                              maxlength={field.max}
                              min={field.type === "number" ? 0 : undefined}
                              max={
                                field.type === "number" ? 4294967295 : undefined
                              }
                              step={field.type === "number" ? 1 : undefined}
                              autocomplete={
                                field.type === "password"
                                  ? "new-password"
                                  : "off"
                              }
                              placeholder={
                                field.type === "password" && editing()?.id
                                  ? "Leave blank to keep current password"
                                  : ""
                              }
                              value={editing()?.[field.key] ?? ""}
                              onInput={(e) =>
                                setEditing((v) => ({
                                  ...v,
                                  [field.key]: e.currentTarget.value,
                                }))
                              }
                            />
                          }
                        >
                          <textarea
                            rows="3"
                            maxlength={field.max}
                            value={editing()?.[field.key] ?? ""}
                            onInput={(e) =>
                              setEditing((v) => ({
                                ...v,
                                [field.key]: e.currentTarget.value,
                              }))
                            }
                          />
                        </Show>
                      }
                    >
                      <select
                        value={editing()?.[field.key] ?? ""}
                        onChange={(e) =>
                          setEditing((v) => ({
                            ...v,
                            [field.key]: e.currentTarget.value,
                          }))
                        }
                      >
                        <For each={field.options}>
                          {(option) => (
                            <option value={option.value}>{option.label}</option>
                          )}
                        </For>
                      </select>
                    </Show>
                  </label>
                )}
              </For>
            </div>
            <Show when={formError()}>
              <p class="error" role="alert">
                {formError()}
              </p>
            </Show>
            <footer class="dialog-footer">
              <button
                type="button"
                class="secondary"
                disabled={busy()}
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button class="primary" disabled={busy()}>
                {busy() ? "Saving…" : "Save changes"}
              </button>
            </footer>
          </form>
        </Modal>
      </Show>
      <Show when={confirmation()}>
        <Modal
          title={`${deleted() ? "Restore" : "Archive"} ${props.singular.toLowerCase()}?`}
          close={() => setConfirmation(null)}
          busy={busy()}
        >
          <p>
            {deleted()
              ? "This record will become active again."
              : "This record will move to the archive. You can restore it later."}
          </p>
          <Show when={formError()}>
            <p class="error" role="alert">
              {formError()}
            </p>
          </Show>
          <footer class="dialog-footer">
            <button
              class="secondary"
              disabled={busy()}
              onClick={() => setConfirmation(null)}
            >
              Cancel
            </button>
            <button
              class={deleted() ? "primary" : "danger-button"}
              disabled={busy()}
              onClick={execute}
            >
              {busy()
                ? "Saving…"
                : deleted()
                  ? "Restore record"
                  : "Archive record"}
            </button>
          </footer>
        </Modal>
      </Show>
    </section>
  );
}
