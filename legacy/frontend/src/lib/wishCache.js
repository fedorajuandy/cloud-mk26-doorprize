let database;
function open() {
  return (database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open("wishing-tree", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("snapshots");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
export async function readWishCache(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("snapshots")
      .objectStore("snapshots")
      .get(key);
    request.onsuccess = () => resolve(request.result?.records || []);
    request.onerror = () => reject(request.error);
  });
}
export async function writeWishCache(key, records) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("snapshots", "readwrite");
    tx.objectStore("snapshots").put({ records, savedAt: Date.now() }, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
