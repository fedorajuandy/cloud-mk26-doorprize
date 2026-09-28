export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    if (response.status === 401 && window.location.pathname !== "/login")
      window.location.assign("/login");
    const error = new Error(payload.error?.message || "Request failed.");
    error.details = payload.error?.details || [];
    throw error;
  }
  return payload.data;
}
export async function allRecords(path) {
  const records = [];
  let page = 1,
    pages = 1;
  do {
    const result = await api(`${path}?limit=100&page=${page}`);
    records.push(...result.records);
    pages = result.pagination.total_pages;
    page++;
  } while (page <= pages);
  return records;
}

export async function download(path, filename) {
  const response = await fetch(`/api${path}`, { credentials: "same-origin" });
  if (!response.ok) {
    if (response.status === 401) window.location.assign("/login");
    const payload = await response.json();
    throw new Error(payload.error?.message || "Download failed.");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
