import { z } from "zod";
import { fail } from "../errors.js";
export const integrationSettings = z
  .object({
    enabled: z.boolean(),
    import_mode: z.enum(["link", "create"]),
    claim_location: z.string().trim().min(1).max(160),
    description: z.string().trim().max(300),
    image_url: z
      .string()
      .regex(/^\/prize-assets\/[a-zA-Z0-9_-]+\.(webp|png|jpe?g)$/)
      .max(255)
      .nullable(),
    claim_deadline: z.iso.datetime({ offset: true }).max(50).nullable(),
  })
  .strict();
export function credentials() {
  const token = process.env.DOORPRIZE_SOURCE_TOKEN;
  const raw = process.env.DOORPRIZE_SOURCE_URL;
  if (!token || !raw)
    fail(
      503,
      "Set DOORPRIZE_SOURCE_URL and DOORPRIZE_SOURCE_TOKEN on the backend server.",
    );
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(503, "DOORPRIZE_SOURCE_URL must be an HTTPS origin.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    fail(
      503,
      "DOORPRIZE_SOURCE_URL must be an HTTPS origin without a path or credentials.",
    );
  return { origin: url.origin, token };
}
export function checkSource(config, origin) {
  if (config.source_origin && config.source_origin !== origin)
    fail(
      409,
      "The configured source differs from the saved integration. Restore the original source URL before syncing.",
    );
}
