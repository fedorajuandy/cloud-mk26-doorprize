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
export async function readBytes(request, maximum) {
  if (Number(request.headers.get("content-length")) > maximum)
    fail(413, "Request body is too large.");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "A request body is required.");
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      fail(413, "Request body is too large.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, size);
}
export async function body(request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    fail(415, "Use application/json.");
  const raw = await readBytes(request, 65536);
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return fail(400, "Invalid JSON.");
  }
}
