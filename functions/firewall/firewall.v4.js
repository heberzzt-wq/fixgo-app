/**
 * ======================================================================================
 * GESTIA FIREWALL V4 (CORRELATION & ANTI-BOTNET ENGINE)
 * Detección de ataques distribuidos, Fingerprinting (IP+UA) y God Mode.
 * ======================================================================================
 */

const admin = require("firebase-admin");
const db = admin.firestore();

// ⚙️ CONFIGURACIÓN V4 (AJUSTES DE SENSIBILIDAD)
const CONFIG = {
  BOTNET_THRESHOLD: 3,        // Mínimo de Tenants diferentes bajo ataque para saltar
  TIME_WINDOW_MS: 30000,      // Ventana de correlación (30 segundos)
  SCORE_CLUSTER_BLOCK: 90,    // Umbral de bloqueo definitivo
  SCORE_CLUSTER_WARN: 65,     // Umbral de ralentización (Throttle)
  DECAY: 0.9                  // Factor de olvido (Suavizado de historial)
};

async function firewallV4(req) {
  const start = Date.now();

  try {
    // =========================
    // 1. AUTH & GOD MODE (INMUNIDAD ARQUITECTO)
    // =========================
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) throw new Error("NO_TOKEN");

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email;

    // 🕵️ Captura de Fingerprint (Huella de Red)
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    const ua = req.headers["user-agent"] || "na";
    const fingerprint = `${ip}_${ua.slice(0, 50)}`;

    // 🚀 BYPASS SUPREMO: Inmunidad total para Heberto Mendoza Senior
    if (email === "hebertoh-m@hotmail.com") {
        console.log(`🚀 [FIREWALL V4] Identidad Maestra: ${email}. Acceso irrestricto concedido.`);
        return {
            ok: true,
            uid: uid,
            tenantId: "CORE_SYSTEM",
            clusterScore: 0,
            tenantsInvolved: 0,
            action: "ALLOW"
        };
    }

    // =========================
    // 2. USER / TENANT VALIDATION
    // =========================
    const userSnap = await db.collection("gestia_users").doc(uid).get();
    if (!userSnap.exists) throw new Error("USER_NOT_FOUND");

    const user = userSnap.data();
    const tenantId = user.tenantId;
    if (!tenantId) throw new Error("NO_TENANT_ASSIGNED");

    // =========================
    // 3. GLOBAL BLACKLIST (EXILIO POR HUELLA)
    // =========================
    const black = await db.collection("gestia_global_blacklist").doc(fingerprint).get();
    if (black.exists) {
        console.error(`🚨 [V4] Bloqueo por Blacklist de Huella: ${fingerprint}`);
        throw new Error("BLACKLIST_FINGERPRINT");
    }

    // =========================
    // 4. REGISTRO E INDEXACIÓN DE FINGERPRINT
    // =========================
    const fpRef = db.collection("gestia_fingerprint_index").doc(fingerprint);
    const fpSnap = await fpRef.get();

    let fpData = fpSnap.exists ? fpSnap.data() : {
      tenants: [],
      timestamps: [],
      score: 0
    };

    const now = Date.now();

    // Limpieza de ventana temporal (Solo nos interesan los últimos 30 segundos)
    const recentTimes = (fpData.timestamps || []).filter(t => now - t < CONFIG.TIME_WINDOW_MS);

    // =========================
    // 5. DETECCIÓN MULTI-TENANT (CORRELACIÓN DE RED)
    // =========================
    const tenantsSet = new Set(fpData.tenants || []);
    tenantsSet.add(tenantId);

    const tenantsInvolved = tenantsSet.size;
    let clusterScore = fpData.score || 0;

    // Si la misma IP/UA está pegándole a varios clientes diferentes... es una Botnet
    if (tenantsInvolved >= CONFIG.BOTNET_THRESHOLD) {
      clusterScore += (tenantsInvolved * 15) + (recentTimes.length * 5);
    }

    // Aplicar Decay para no castigar eternamente si el comportamiento mejora
    clusterScore = Math.floor((fpData.score || 0) * CONFIG.DECAY + (clusterScore - (fpData.score || 0)));

    // =========================
    // 6. ENGINE DE DECISIÓN
    // =========================
    let action = "ALLOW";

    if (clusterScore >= CONFIG.SCORE_CLUSTER_BLOCK) {
      action = "BLOCK_CLUSTER";
    } else if (clusterScore >= CONFIG.SCORE_CLUSTER_WARN) {
      action = "THROTTLE_CLUSTER";
    }

    if (action === "BLOCK_CLUSTER") {
      // 🔥 ACCIÓN DE EXILIO: Blacklist automática por huella digital
      await db.collection("gestia_global_blacklist").doc(fingerprint).set({
        reason: "BOTNET_PATTERN_V4",
        score: clusterScore,
        tenants_affected: Array.from(tenantsSet),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      throw new Error("BOTNET_DETECTED_BLOCKED");
    }

    if (action === "THROTTLE_CLUSTER") {
      console.warn(`⚠️ [V4] Ralentizando cluster sospechoso (2.5s). FP: ${fingerprint}`);
      await new Promise(r => setTimeout(r, 2500));
    }

    // =========================
    // 7. ACTUALIZACIÓN DE ESTADO DE HUELLA
    // =========================
    await fpRef.set({
      tenants: Array.from(tenantsSet).slice(-10), // Guardamos historial de los últimos 10 tenants
      timestamps: [...recentTimes, now].slice(-30), // Máximo 30 marcas de tiempo
      score: clusterScore,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // =========================
    // 8. LOG DE AUDITORÍA
    // =========================
    await db.collection("gestia_logs").add({
      uid,
      tenantId,
      fingerprint,
      clusterScore,
      tenantsInvolved,
      action,
      latency: Date.now() - start,
      version: "V4_ANTI_BOTNET",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      ok: true,
      uid,
      tenantId,
      clusterScore,
      tenantsInvolved,
      action
    };

  } catch (error) {
    console.error(`❌ [FIREWALL_V4_ERROR]: ${error.message}`);
    throw new Error(`FIREWALL_V4_BLOCK: ${error.message}`);
  }
}

<<<<<<< HEAD
module.exports = { firewallV4 };
=======
module.exports = { firewallV4 };
>>>>>>> 57504e9377303bf60ff33664820a9cd6b9c2d49f
