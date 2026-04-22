import {
  db,
  collection,
  getDocs,
  query,
  limit
} from "/firebase.js";

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

export async function runLiveQuery(input = "") {

  const text =
    String(input).toLowerCase();

  try {

    if (text.includes("jonathan")) {

      const q = query(
        collection(db, "tecnicos"),
        limit(10)
      );

      const snap = await getDocs(q);

      let found = null;

      snap.forEach(doc => {

        const d = doc.data();

        if (
          String(d.nombre || "")
            .toLowerCase()
            .includes("jonathan")
        ) {
          found = d;
        }
      });

      return {
        ok: true,
        source: "LIVE_QUERY",
        message: found
          ? `Jonathan status ${found.status || "activo"}`
          : "Jonathan no localizado"
      };
    }

    if (text.includes("tickets")) {

      const q = query(
        collection(db, "tickets"),
        limit(20)
      );

      const snap = await getDocs(q);

      return {
        ok: true,
        source: "LIVE_QUERY",
        message:
          `Tickets detectados: ${snap.size}`
      };
    }

    return {
      ok: false
    };

  } catch (err) {

    return {
      ok: false,
      error: err.message
    };
  }
}