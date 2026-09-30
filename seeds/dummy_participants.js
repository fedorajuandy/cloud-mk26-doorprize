import { randomUUID } from "node:crypto";

// Explicitly invoked by CLI or Super Admin action; never part of the normal admin seed.
export async function seedDummyParticipants(db) {
  const run = randomUUID();
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
    for (let offset = 0; offset < total; offset += 100) {
      await trx("participants").insert(
        Array.from({ length: Math.min(100, total - offset) }, (_, index) => {
          const number = offset + index + 1;
          return {
            unique_id: randomUUID(),
            full_name: `Participant ${String(number).padStart(4, "0")}`,
            nip: `${run}-${String(number).padStart(4, "0")}`,
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
