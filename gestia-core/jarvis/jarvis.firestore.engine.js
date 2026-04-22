import {
  db,
  collection,
  getDocs,
  query,
  limit
} from "../firebase.js";

export async function runFirestoreScan() {

  try {

    const targets = [
      "users",
      "tickets",
      "tecnicos",
      "gestia_logs",
      "gestia_system_health"
    ];

    const result = {};

    for (const name of targets) {

      const q = query(
        collection(db, name),
        limit(5)
      );

      const snap = await getDocs(q);

      result[name] = {
        count: snap.size
      };
    }

    return {
      ok: true,
      source: "FIRESTORE_SCANNER",
      result
    };

  } catch (err) {

    return {
      ok: false,
      error: err.message
    };
  }
}