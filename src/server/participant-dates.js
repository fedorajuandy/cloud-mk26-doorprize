import { z } from "zod";
// Source headers explicitly say UTC; unzoned date/time values are interpreted as UTC.
export const participantDate = z
  .union([z.string().trim().max(64), z.null()])
  .transform((value, context) => {
    if (!value) return null;
    let normalized = value.replace(" ", "T");
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) normalized += ":00";
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(normalized))
      normalized += "Z";
    if (!z.iso.datetime({ offset: true }).safeParse(normalized).success) {
      context.addIssue({
        code: "custom",
        message: "Use an ISO 8601 timestamp or YYYY-MM-DD HH:mm:ss in UTC.",
      });
      return z.NEVER;
    }
    return new Date(normalized).toISOString();
  });
