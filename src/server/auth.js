import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { compare } from "bcryptjs";
import { fail } from "./errors.js";
const fingerprint = (password) =>
  createHash("sha256").update(password).digest("hex");
function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32)
    fail(
      503,
      "Sign-in is unavailable: JWT_SECRET must contain at least 32 characters. Update the server configuration and restart.",
    );
  return new TextEncoder().encode(value);
}
export function cookie(token, expired = false) {
  return `admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${expired ? 0 : 28800}${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`;
}
export async function tokenFor(user) {
  return new SignJWT({ fingerprint: fingerprint(user.password) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
}
export async function authenticate(request, db) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("admin_session="))
    ?.slice(14);
  if (!token) return fail(401, "Please sign in.");
  const signingKey = secret();
  let payload;
  try {
    payload = (await jwtVerify(token, signingKey, { algorithms: ["HS256"] }))
      .payload;
  } catch {
    return fail(401, "Your session has expired. Please sign in.");
  }
  const user = await db("users as u")
    .join("roles as r", "r.id", "u.role_id")
    .where("u.id", payload.sub)
    .whereNull("u.deleted_at")
    .whereNull("r.deleted_at")
    .select("u.id", "u.username", "u.password", "u.role_id", "r.role_name")
    .first();
  if (!user || payload.fingerprint !== fingerprint(user.password))
    return fail(401, "Please sign in again.");
  const permissions =
    user.role_id === 1
      ? []
      : await db("role_permissions as rp")
          .join("permissions as p", "p.id", "rp.permission_id")
          .where("rp.role_id", user.role_id)
          .whereNull("rp.deleted_at")
          .whereNull("p.deleted_at")
          .pluck("p.permission_name");
  return {
    id: user.id,
    username: user.username,
    role_id: user.role_id,
    role_name: user.role_name,
    permissions,
  };
}
export function authorize(user, permission) {
  if (
    user.role_id !== 1 &&
    (!permission || !user.permissions.includes(permission))
  )
    fail(403, "You do not have permission to do this.");
}
const attempts = new Map();
let nextAttemptCleanup = 0;
export async function login(db, username, password) {
  const key = username.toLowerCase();
  const now = Date.now();
  if (now >= nextAttemptCleanup) {
    for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
    nextAttemptCleanup = now + 60000;
  }
  const storedAttempt = attempts.get(key);
  const attempt = storedAttempt?.until > now ? storedAttempt : undefined;
  if (attempt && attempt.count >= 10)
    fail(429, "Too many sign-in attempts. Try again in 15 minutes.");
  if (attempts.size >= 10000 && !attempt)
    fail(429, "Sign-in is busy. Try again later.");
  attempts.set(key, {
    count: (attempt?.count || 0) + 1,
    until: attempt?.until || now + 900000,
  });
  const user = await db("users as u")
    .join("roles as r", "r.id", "u.role_id")
    .where("u.username", username)
    .whereNull("u.deleted_at")
    .whereNull("r.deleted_at")
    .select("u.id", "u.username", "u.password", "u.role_id")
    .first();
  // A valid dummy hash keeps unknown-user attempts on the password comparison path.
  const valid = await compare(
    password,
    user?.password ||
      "$2b$12$C6UzMDM.H6dfI/f/IKcEe.7dNbO5zUbfgKXSlAhPuDSklMIMXDlWy",
  );
  if (!user || !valid) fail(401, "Invalid username or password.");
  attempts.delete(key);
  return user;
}
