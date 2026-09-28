import axios from "axios";
import { io } from "socket.io-client";

import { API_URL, SOCKET_URL } from "./backend";
export { API_URL, SOCKET_URL } from "./backend";

// Separate client: an expired display session must not interrupt cached playback.
export const wishesApi = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 15000,
});
export const wishEvents = [
  "wish:created",
  "wish:updated",
  "wish:deleted",
  "wish:recovered",
  "wishes:cleared",
];
export const phoneSocket = () => {
  const socket = io(SOCKET_URL, { withCredentials: true, transports: ["polling", "websocket"] });
  socket.on("disconnect", (reason, details) => console.warn("Phone socket disconnected", reason, details?.message));
  socket.on("connect_error", error => console.warn("Phone socket connection failed", error.message));
  return socket;
};

export function connectWishes(
  transport,
  { onEvent, onReady, onStatus, onReset },
) {
  if (transport === "ws") {
    const socket = io(`${SOCKET_URL}/wishes/live`, {
      withCredentials: true,
      transports: ["polling", "websocket"],
    });
    socket.on("connect", () => {
      onStatus("live");
      onReady?.();
    });
    socket.on("disconnect", (reason) => {
      console.warn("Live socket disconnected", reason);
      onStatus(reason === "io server disconnect" ? "auth" : "offline");
    });
    socket.on("connect_error", (error) => {
      console.warn("Live socket connection failed", error.message, error.data?.status);
      onStatus([401, 403].includes(error.data?.status) ? "auth" : "offline");
    });
    socket.on("session:expired", () => onStatus("auth"));
    for (const type of wishEvents)
      socket.on(type, (event) => onEvent(type, event.data, event.event_id));
    return () => socket.disconnect();
  }
  const stream = new EventSource(`${API_URL}/wishes/stream`, {
    withCredentials: true,
  });
  stream.onopen = () => onStatus("live");
  stream.addEventListener("stream:ready", () => {
    onStatus("live");
    onReady?.();
  });
  stream.addEventListener("stream:reset", () => onReset?.());
  stream.addEventListener("session:expired", () => {
    stream.close();
    onStatus("auth");
  });
  stream.onerror = () => {
    console.warn("Wish SSE connection failed", { readyState: stream.readyState });
    onStatus("offline");
  };
  for (const type of wishEvents)
    stream.addEventListener(type, (event) => {
      try {
        onEvent(type, JSON.parse(event.data), event.lastEventId);
      } catch {
        onReset?.();
      }
    });
  return () => stream.close();
}

export async function fetchAllWishes(signal) {
  const records = new Map();
  let page = 1,
    pages = 1;
  do {
    const { data } = await wishesApi.get("/wishes", {
      params: { page, limit: 100 },
      signal,
    });
    for (const row of data.data.records) records.set(String(row.id), row);
    pages = data.data.pagination.total_pages;
    page++;
  } while (page <= pages);
  return [...records.values()];
}
