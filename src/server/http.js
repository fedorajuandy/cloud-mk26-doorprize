import { z } from "zod";
import { fail } from "./errors.js";
export const json = (data, status = 200, headers = {}) =>
  Response.json(
    { data },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...headers,
      },
    },
  );
export const idSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .max(20);
export async function body(request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    fail(415, "Use application/json.");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "A JSON body is required.");
  const decoder = new TextDecoder();
  let bytes = 0,
    raw = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 65536) {
      await reader.cancel();
      fail(413, "Request body is too large.");
    }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  try {
    return JSON.parse(raw);
  } catch {
    return fail(400, "Invalid JSON.");
  }
}
