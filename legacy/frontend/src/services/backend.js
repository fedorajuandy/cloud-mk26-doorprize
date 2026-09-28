// Same-origin defaults let phones/tablets use the frontend's forwarded URL.
// Vite proxies these paths in development; production needs equivalent proxy rules.
export const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
export const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL ||
  new URL(API_URL, window.location.origin).origin).replace(/\/+$/, '');
