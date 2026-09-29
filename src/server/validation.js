import { z } from "zod";
const text = (max) => z.string().trim().min(1).max(max);
const nullable = (max) =>
  z.union([z.string().trim().max(max), z.null()]).transform((v) => v || null);
export const participant = z
  .object({
    unique_id: text(255),
    full_name: text(255),
    no_hp: nullable(20).optional(),
    email: nullable(255)
      .refine(
        (value) => value === null || z.email().safeParse(value).success,
        "Enter a valid email address.",
      )
      .optional(),
    profile_picture: nullable(16000)
      .refine((value) => {
        if (value === null) return true;
        if (/[\\\s]/.test(value)) return false;
        if (/^\/(?!\/)/.test(value)) return true;
        try {
          return ["http:", "https:"].includes(new URL(value).protocol);
        } catch {
          return false;
        }
      }, "Use a local absolute image path or an HTTP(S) image URL.")
      .optional(),
    unit_kerja: text(255),
    nip: text(255),
    prize: nullable(16000).optional(),
    sesi: z.number().int().min(0).max(4294967295).nullable().optional(),
    babak: z.number().int().min(0).max(4294967295).nullable().optional(),
  })
  .strict();
export const password = z
  .string()
  .min(8)
  .max(72)
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    "Password must be at most 72 UTF-8 bytes.",
  );
export const user = z
  .object({
    username: text(50),
    password,
    role_id: z.number().int().positive().optional(),
  })
  .strict();
export const role = z.object({ role_name: text(50) }).strict();
export const permission = z
  .object({
    permission_name: text(100).regex(
      /^[a-z][a-z0-9_]*$/,
      "Use lowercase letters, numbers and underscores.",
    ),
  })
  .strict();
export const settings = z
  .object({
    logo_url: text(255).refine(
      (v) => /^\/(?!\/)/.test(v) || /^https:\/\//.test(v),
      "Use a local absolute path or HTTPS URL.",
    ),
    favicon_url: text(255)
      .refine((value) => {
        if (/[\\\s]/.test(value)) return false;
        if (/^\/(?!\/)/.test(value))
          return !value.split(/[?#]/)[0].startsWith("/api/");
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      }, "Use a local image path outside /api/ or an HTTPS image URL.")
      .optional(),
    login_bg_color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color."),
  })
  .strict();
