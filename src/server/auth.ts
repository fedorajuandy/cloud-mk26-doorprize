import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { compare } from "bcryptjs";
import type { Knex } from "knex";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
const fingerprint = (password: string) =>
  createHash("sha256").update(password).digest("hex");
function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(value);
}
export function cookie(token: string, expired = false) {
  return `admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${expired ? 0 : 28800}${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`;
}
export async function tokenFor(user: any) {
  return new SignJWT({ fingerprint: fingerprint(user.password) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
}
export async function authenticate(request: Request, db: Knex) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("admin_session="))
    ?.slice(14);
  if (!token) return fail(401, "Please sign in.");
  let payload;
  try {
    payload = (await jwtVerify(token, secret(), { algorithms: ["HS256"] }))
      .payload;
  } catch {
    return fail(401, "Your session has expired. Please sign in.");
  }
  const user = await db("users")
    .where({ id: payload.sub })
    .whereNull("deleted_at")
    .first();
  if (!user || payload.fingerprint !== fingerprint(user.password))
    return fail(401, "Please sign in again.");
  const role = await db("roles")
    .where({ id: user.role_id })
    .whereNull("deleted_at")
    .first();
  if (!role) return fail(403, "Your role is no longer active.");
  const permissions = await db("role_permissions as rp")
    .join("permissions as p", "p.id", "rp.permission_id")
    .where("rp.role_id", user.role_id)
    .whereNull("rp.deleted_at")
    .whereNull("p.deleted_at")
    .pluck("p.permission_name");
  return {
    id: user.id,
    username: user.username,
    role_id: user.role_id,
    role_name: role.role_name,
    permissions,
  };
}
export type Admin = Awaited<ReturnType<typeof authenticate>>;
export function authorize(user: Admin, permission?: string) {
  if (
    user.role_id !== 1 &&
    (!permission || !user.permissions.includes(permission))
  )
    fail(403, "You do not have permission to do this.");
}
const attempts = new Map<string, { count: number; until: number }>();
export async function login(db: Knex, username: string, password: string) {
  const key = username.toLowerCase();
  const now = Date.now();
  for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  const attempt = attempts.get(key);
  if (attempt && attempt.count >= 10)
    fail(429, "Too many sign-in attempts. Try again in 15 minutes.");
  if (attempts.size >= 10000 && !attempt)
    fail(429, "Sign-in is busy. Try again later.");
  attempts.set(key, {
    count: (attempt?.count || 0) + 1,
    until: attempt?.until || now + 900000,
  });
  const user = await db("users")
    .where({ username })
    .whereNull("deleted_at")
    .first();
  // A valid dummy hash keeps unknown-user attempts on the password comparison path.
  const valid = await compare(
    password,
    user?.password ||
      "$2b$12$C6UzMDM.H6dfI/f/IKcEe.7dNbO5zUbfgKXSlAhPuDSklMIMXDlWy",
  );
  if (
    !user ||
    !valid ||
    !(await db("roles")
      .where({ id: user.role_id })
      .whereNull("deleted_at")
      .first())
  )
    fail(401, "Invalid username or password.");
  attempts.delete(key);
  return user;
}
