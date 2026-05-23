import {
  db,
  collection,
  getDocs,
  query,
  limit,
  addDoc,
  serverTimestamp
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

export function startWatchdog() {

  if (window.__JARVIS_WATCHDOG__) {
    return {
      ok: true,
      message: "Watchdog ya activo"
    };
  }

  window.__JARVIS_WATCHDOG__ = setInterval(
    async () => {

      const res = await runSentinel();

      if (
        res?.alerts &&
        !res.alerts.includes("✅ Sistema estable")
      ) {
        console.warn(
          "🛡️ WATCHDOG ALERT",
          res.alerts
        );
      }

    },
    14400000
  );

  return {
    ok: true,
    message: "Watchdog iniciado"
  };
}

export async function runSelfHealing() {

  const res = await runSentinel();

  if (!res?.ok) {
    return {
      ok: false,
      message: "Sentinel no disponible"
    };
  }

  const actions = [];

  for (const alert of res.alerts) {

    if (alert.includes("Tickets elevados")) {
      actions.push("Escalar soporte");
    }

    if (alert.includes("Sin técnicos")) {
      actions.push("Notificar guardia y operaciones");
    }

    if (alert.includes("logs")) {
      actions.push("Revisar módulo ruidoso");
    }

    if (alert.includes("health")) {
      actions.push("Reiniciar health-check lógico");
    }
  }

  if (!actions.length) {
    actions.push("Sin acciones requeridas");
  }

  return {
    ok: true,
    source: "SELF_HEALING",
    alerts: res.alerts,
    actions
  };
}

export async function runExecutionCore() {

  try {

    const healExecution =

      await window.executeAuthority(
        "self healing",
        () => runSelfHealing()
      );

    const heal =
      healExecution?.result;

    const executed = [];

    for (const action of heal.actions) {

      if (action === "Sin acciones requeridas") {
        continue;
      }

      executed.push(`EXECUTED: ${action}`);
    }

    if (!executed.length) {
      executed.push("Sin ejecución necesaria");
    }

    return {
      ok: true,
      source: "EXECUTION_CORE",
      alerts: heal.alerts,
      executed
    };

  } catch (err) {

    return {
      ok: false,
      error: err.message
    };
  }
}

export async function runRealActions() {

  try {

    const healExecution =

      await window.executeAuthority(
        "self healing",
        () => runSelfHealing()
      );

    const heal =
      healExecution?.result;

    const ref = await addDoc(
      collection(db, "gestia_logs"),
      {
        source: "JARVIS_REAL_ACTIONS",
        alerts: heal.alerts,
        actions: heal.actions,
        createdAt: serverTimestamp()
      }
    );

    return {
      ok: true,
      source: "REAL_ACTIONS",
      docId: ref.id,
      message: "Acción registrada en Firestore"
    };

  } catch (err) {

    return {
      ok: false,
      error: err.message
    };
  }
}

export async function runCommander() {

  try {

    const sentinelExecution =

      await window.executeAuthority(
        "sentinel",
        () => {

  throw new Error(
    "SENTINEL_FAILURE_TEST"
  );
}
      );

    const sentinel =
      sentinelExecution?.result;

      if (
  !sentinelExecution?.ok
) {

  throw new Error(
    "COMMANDER_CHILD_FAILURE"
  );
}

    const priorities = [];

    for (const alert of sentinel.alerts) {

      if (alert.includes("Sin técnicos")) {

        priorities.push({
          level: "CRITICAL",
          action: "Convocar soporte inmediato"
        });
      }

      else if (alert.includes("Tickets elevados")) {

        priorities.push({
          level: "HIGH",
          action: "Redistribuir carga operativa"
        });
      }

      else if (alert.includes("health")) {

        priorities.push({
          level: "HIGH",
          action: "Revisar monitoreo central"
        });
      }

      else if (alert.includes("estable")) {

        priorities.push({
          level: "LOW",
          action: "Mantener vigilancia"
        });
      }
    }

    return {
      ok: true,
      source: "COMMANDER_V2",
      alerts: sentinel.alerts,
      priorities
    };

  } catch (err) {

    return {
      ok: false,
      error: err.message
    };
  }
}

export async function runPredictor() {

  try {

    const sentinelExecution =

      await window.executeAuthority(
        "sentinel",
        () => runSentinel()
      );

    const sentinel =
      sentinelExecution?.result;

    const commandExecution =

      await window.executeAuthority(
        "command center",
        () => runCommandCenter()
      );

    const command =
      commandExecution?.result;

    const text =
      command.summary || "";

    let risk = "LOW";

    const forecasts = [];

    if (
      text.includes("Tickets: 0") === false &&
      text.includes("Tickets: 1") === false &&
      text.includes("Tickets: 2") === false &&
      text.includes("Tickets: 3") === false
    ) {

      risk = "MEDIUM";

      forecasts.push(
        "Posible aumento de carga operativa"
      );
    }

    if (
      sentinel.alerts.some(a =>
        a.includes("logs")
      )
    ) {

      risk = "HIGH";

      forecasts.push(
        "Probable ruido sistémico próximo"
      );
    }

    if (
      sentinel.alerts.some(a =>
        a.includes("health")
      )
    ) {

      risk = "CRITICAL";

      forecasts.push(
        "Riesgo de degradación del sistema"
      );
    }

    if (!forecasts.length) {

      forecasts.push(
        "Operación estable a corto plazo"
      );
    }

    return {
      ok: true,
      source: "PREDICTOR_V1",
      risk,
      forecasts
    };

  } catch (err) {

    return {
      ok: false,
      error: err.message
    };
  }
}

