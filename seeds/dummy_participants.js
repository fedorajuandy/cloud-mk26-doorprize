import { randomUUID } from "node:crypto";
import { fail } from "../src/server/errors.js";

// Explicitly invoked by CLI or Super Admin action; never part of the normal admin seed.
export async function seedDummyParticipants(db) {
  const units = [
    "Finance",
    "Operations",
    "Technology",
    "Human Resources",
    "Marketing",
    "Risk Management",
    "Customer Service",
  ];
  const total = 2800;
  await db.transaction(async (trx) => {
    // Serialize seed batches so repeated/concurrent runs do not reuse dummy NIPs.
    await trx("system_settings").where({ id: 1 }).forUpdate().first();
    const used = new Set(
      await trx("participants").whereRaw("length(nip) = 5").pluck("nip"),
    );
    const nips = [];
    for (let number = 1; number <= 99999 && nips.length < total; number++) {
      const nip = String(number).padStart(5, "0");
      if (!used.has(nip)) nips.push(nip);
    }
    if (nips.length < total)
      fail(
        409,
        "Not enough unused five-digit NIPs for 2800 dummy participants.",
      );
    for (let offset = 0; offset < total; offset += 100) {
      await trx("participants").insert(
        Array.from({ length: Math.min(100, total - offset) }, (_, index) => {
          const number = offset + index + 1;
          return {
            unique_id: randomUUID(),
            full_name: `Participant ${String(number).padStart(4, "0")}`,
            nip: nips[number - 1],
            unit_kerja: units[(number - 1) % units.length],
            line: null,
            status: null,
            registered_at: null,
            verified_at: null,
            no_hp: null,
            email: null,
            profile_picture: null,
            prize: null,
            babak: null,
            sesi: null,
          };
        }),
      );
    }
  });
  return total;
}
