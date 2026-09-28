export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    if (response.status === 401 && window.location.pathname !== "/login")
      window.location.assign("/login");
    throw new Error(payload.error?.message || "Request failed.");
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
