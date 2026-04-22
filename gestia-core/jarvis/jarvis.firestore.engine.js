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
export async function runCommandCenter() {

  try {

    const targets = [
      "users",
      "tickets",
      "tecnicos",
      "gestia_logs",
      "gestia_system_health"
    ];

    const board = {};

    for (const name of targets) {

      const q = query(
        collection(db, name),
        limit(20)
      );

      const snap = await getDocs(q);

      board[name] = snap.size;
    }

    const health =
      board.gestia_system_health > 0
        ? "ONLINE"
        : "NO DATA";

    return {
      ok: true,
      source: "COMMAND_CENTER",
      summary:
`🧠 COMMAND CENTER

Usuarios: ${board.users}
Tickets: ${board.tickets}
Técnicos: ${board.tecnicos}
Logs: ${board.gestia_logs}
Health: ${health}`
    };

  } catch (err) {

    return {
      ok: false,
      error: err.message
    };
  }
}

export async function runSentinel() {

  try {

    const targets = [
      "tickets",
      "tecnicos",
      "gestia_logs",
      "gestia_system_health"
    ];

    const data = {};

    for (const name of targets) {

      const q = query(
        collection(db, name),
        limit(50)
      );

      const snap = await getDocs(q);

      data[name] = snap.size;
    }

    const alerts = [];

    if (data.tickets > 10) {
      alerts.push("⚠️ Tickets elevados");
    }

    if (data.tecnicos === 0) {
      alerts.push("⚠️ Sin técnicos activos");
    }

    if (data.gestia_logs > 40) {
      alerts.push("⚠️ Alto volumen de logs");
    }

    if (data.gestia_system_health === 0) {
      alerts.push("⚠️ Sin datos de health");
    }

    if (!alerts.length) {
      alerts.push("✅ Sistema estable");
    }

    return {
      ok: true,
      source: "SENTINEL",
      alerts
    };

  } catch (err) {

    return {
      ok: false,
      error: err.message
    };
  }
}