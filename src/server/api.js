import { z, ZodError } from "zod";
import { authenticate, cookie, login, tokenFor } from "./auth.js";
import { fail, HttpError } from "./errors.js";
import { body, json } from "./http.js";
import { handleRoles } from "./services/roles.js";
import { handleRecords } from "./services/records.js";
import { updateSettings } from "./services/settings.js";
export async function handleApi(request, db) {
  try {
    const url = new URL(request.url);
    const method = request.method;
    const parts = url.pathname
      .replace(/^\/api\/?/, "")
      .split("/")
      .filter(Boolean);
    const [resource, rawId, action] = parts;
    if (parts.length > 3) fail(404, "Endpoint not found.");
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const origin = request.headers.get("origin");
      if (
        (origin && origin !== (process.env.APP_ORIGIN || url.origin)) ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        fail(403, "Cross-origin requests are not allowed.");
    }
    if (resource === "login" && !rawId && method === "POST") {
      const input = z
        .object({
          username: z.string().trim().min(1).max(50),
          password: z.string().min(1).max(128),
        })
        .parse(await body(request));
      const user = await login(db, input.username, input.password);
      return json(
        { id: user.id, username: user.username, role_id: user.role_id },
        200,
        { "Set-Cookie": cookie(await tokenFor(user)) },
      );
    }
    if (resource === "logout" && !rawId && method === "POST")
      return json(null, 200, { "Set-Cookie": cookie("", true) });
    if (resource === "favicon" && !rawId && !action && method === "GET") {
      const settings = await db("system_settings").orderBy("id").first();
      return new Response(null, {
        status: 302,
        headers: {
          Location: settings?.favicon_url || "/mandiri.svg",
          "Cache-Control": "no-store",
        },
      });
    }
    if (resource === "settings" && !rawId && method === "GET")
      return json(
        (await db("system_settings").orderBy("id").first()) || {
          logo_url: "/abracodebra.svg",
          favicon_url: "/mandiri.svg",
          login_bg_color: "#f3f4f6",
          login_bg_image: null,
        },
      );
    const user = await authenticate(request, db);
    if (resource === "me" && !rawId && method === "GET") return json(user);
    const context = { db, user, resource, rawId, action, method, url, request };
    if (resource === "participants" && !action) {
      if (rawId === "seed-dummy") {
        const { seedParticipants } = await import("./participants/seed.js");
        return await seedParticipants(context);
      }
      if (rawId === "reset-results") {
        const { resetParticipantResults } =
          await import("./participants/reset.js");
        return await resetParticipantResults(context);
      }
      if (rawId === "purge") {
        const { purgeParticipants } = await import("./participants/purge.js");
        return await purgeParticipants(context);
      }
      if (rawId === "batch") {
        const { updateParticipants } = await import("./participants/batch.js");
        return await updateParticipants(context);
      }
      if (rawId === "import") {
        const { importParticipants } = await import("./participants/import.js");
        return await importParticipants(context);
      }
      if (rawId === "export" || rawId === "import-template") {
        const { exportParticipants, importTemplate } =
          await import("./participants/export.js");
        return await (rawId === "export"
          ? exportParticipants(context)
          : importTemplate(context));
      }
    }
    if (resource === "settings" && !rawId && method === "PUT")
      return await updateSettings(context);
    if (resource === "role-permissions") return await handleRoles(context);
    return await handleRecords(context);
  } catch (error) {
    let status = 500,
      message = "Unable to complete the request.";
    if (error instanceof HttpError) {
      status = error.status;
      message = error.message;
    } else if (error instanceof ZodError) {
      status = 422;
      message = error.issues
        .map((i) => `${i.path.join(".") || "Request"}: ${i.message}`)
        .join("; ");
    } else if (
      error.code === "ER_DUP_ENTRY" ||
      error.code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      status = 409;
      message = "This value already exists, including in archived records.";
    } else {
      console.error("API request failed:", error);
    }
    return Response.json(
      { error: { message } },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
