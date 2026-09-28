export function applyWishEvent(records, type, data) {
  if (type === "wishes:cleared") return [];
  const id = String(data.id);
  if (type === "wish:deleted")
    return records.filter((row) => String(row.id) !== id);
  const index = records.findIndex((row) => String(row.id) === id);
  if (index < 0) return [...records, { ...data, id }];
  return records.map((row, i) => (i === index ? { ...data, id } : row));
}

// A round is a snapshot of IDs. New arrivals get their own immediate appearance;
// they enter the regular rotation on the next round. Updates never reset a round.
export function createRotation() {
  let pending = [],
    round = 0;
  return {
    next(records) {
      const byId = new Map(records.map((row) => [String(row.id), row]));
      pending = pending.filter((id) => byId.has(id));
      if (!pending.length) {
        if (!records.length) return null;
        pending = [...byId.keys()];
        round++;
      }
      return { record: byId.get(pending.shift()), round };
    },
    reset() {
      pending = [];
      round = 0;
    },
  };
}
