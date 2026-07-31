/*
 * ======================================================================================
 * B2C SIGNATURE STORAGE BRIDGE 2026
 * Archivo: b2c-signature-storage-bridge.js
 * Rol: Evitar que la firma del cierre se persista como Base64 dentro de Firestore.
 *
 * FLUJO:
 * - Intercepta únicamente el botón del modal legacy #modalEvidencia.
 * - Verifica el servicio y el técnico autenticado.
 * - Convierte la firma a PNG binario pequeño, calcula SHA-256 y la sube a Storage.
 * - Fusiona URL/ruta/hash/tamaño en work_evidence_bindings/current.
 * - Hace que el legacy guarde la URL en evidencia.firma_cliente, no data:image/... Base64.
 * - No modifica cobros, saldos, estados ni reglas desplegadas.
 * ======================================================================================
 */

import {
    auth,
    db,
    storage,
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "./firebase.js";

import {
    ref,
    uploadBytes,
    getDownloadURL,
    getMetadata
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

import {
    sha256Blob
} from "./b2c-evidence-engine.js";

export const B2C_SIGNATURE_STORAGE_BRIDGE_VERSION = "1.0.0";

const INSTALL_KEY = "__B2C_SIGNATURE_STORAGE_BRIDGE__";
const MAX_SIGNATURE_BYTES = 512 * 1024;
const MAX_SIGNATURE_WIDTH = 1200;
const MAX_SIGNATURE_HEIGHT = 600;
const originalToDataURLByCanvas = new WeakMap();

function textoSeguro(value, maxLength = 180) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function idSeguro(value, fallback = "service") {
    return textoSeguro(value, 180)
        .replace(/[^a-zA-Z0-9_-]/g, "_") || fallback;
}

function crearId(prefix = "signature") {
    if (globalThis.crypto?.randomUUID) {
        return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function canvasToBlob(canvas, type = "image/png", quality = undefined) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("SIGNATURE_BLOB_FAILED"));
        }, type, quality);
    });
}

function canvasTieneFirma(canvas) {
    if (!(canvas instanceof HTMLCanvasElement) || !canvas.width || !canvas.height) {
        return false;
    }

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;

    for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3];
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];

        if (alpha > 0 && (red > 12 || green > 12 || blue > 12)) {
            painted += 1;
            if (painted >= 24) return true;
        }
    }

    return false;
}

function crearCanvasFirmaEconomico(sourceCanvas) {
    const scale = Math.min(
        1,
        MAX_SIGNATURE_WIDTH / sourceCanvas.width,
        MAX_SIGNATURE_HEIGHT / sourceCanvas.height
    );
    const target = document.createElement("canvas");
    target.width = Math.max(1, Math.round(sourceCanvas.width * scale));
    target.height = Math.max(1, Math.round(sourceCanvas.height * scale));

    const context = target.getContext("2d", { alpha: true });
    if (!context) throw new Error("SIGNATURE_CONTEXT_UNAVAILABLE");

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
        sourceCanvas,
        0,
        0,
        sourceCanvas.width,
        sourceCanvas.height,
        0,
        0,
        target.width,
        target.height
    );

    return target;
}

function serviceIdDesdeArchivo(modal) {
    const fileName = textoSeguro(
        modal.querySelector("#fileA1")?.files?.[0]?.name,
        260
    );
    const suffix = "_antes_cronologico.jpg";

    if (!fileName.endsWith(suffix)) return null;
    return fileName.slice(0, -suffix.length) || null;
}

async function verificarServicio({ serviceId, technicianId }) {
    const snapshot = await getDoc(doc(db, "services", serviceId));
    if (!snapshot.exists()) throw new Error("SERVICE_NOT_FOUND");

    const data = snapshot.data();
    const assigned = textoSeguro(
        data.tecnico_id || data.technician_id || data.pro_id,
        128
    );

    if (!assigned || assigned !== technicianId) {
        throw new Error("TECHNICIAN_SERVICE_MISMATCH");
    }

    if (data.estado !== "trabajando") {
        throw new Error("INVALID_SERVICE_STATE");
    }

    return data;
}

async function subirFirma({
    serviceId,
    technicianId,
    customerId,
    canvas
}) {
    const economicalCanvas = crearCanvasFirmaEconomico(canvas);
    const blob = await canvasToBlob(economicalCanvas, "image/png");

    if (blob.size <= 0 || blob.size > MAX_SIGNATURE_BYTES) {
        const error = new Error("SIGNATURE_SIZE_NOT_ALLOWED");
        error.code = "SIGNATURE_SIZE_NOT_ALLOWED";
        error.size = blob.size;
        throw error;
    }

    const sha256 = await sha256Blob(blob);
    const signatureId = crearId("customer_signature");
    const storagePath = [
        "servicios",
        idSeguro(serviceId),
        `${idSeguro(signatureId)}.png`
    ].join("/");
    const storageRef = ref(storage, storagePath);

    const uploadResult = await uploadBytes(storageRef, blob, {
        contentType: "image/png",
        cacheControl: "private,max-age=0,no-store",
        customMetadata: {
            serviceId: textoSeguro(serviceId, 128),
            actorUid: textoSeguro(technicianId, 128),
            actorRole: "tecnico",
            eventType: "customer_signature",
            signatureId,
            sha256,
            base64Persisted: "false",
            bridgeVersion: B2C_SIGNATURE_STORAGE_BRIDGE_VERSION
        }
    });

    const [downloadUrl, remoteMetadata] = await Promise.all([
        getDownloadURL(uploadResult.ref),
        getMetadata(uploadResult.ref)
    ]);

    await setDoc(
        doc(db, "services", serviceId, "work_evidence_bindings", "current"),
        {
            service_id: serviceId,
            technician_id: technicianId,
            customer_id: customerId || null,
            signature: {
                present: true,
                signature_id: signatureId,
                download_url: downloadUrl,
                storage_path: storagePath,
                sha256,
                content_type: remoteMetadata.contentType || blob.type,
                size_bytes: Number(remoteMetadata.size || blob.size),
                storage_generation: remoteMetadata.generation || null,
                base64_persisted: false,
                captured_at_client: new Date().toISOString(),
                uploaded_at: serverTimestamp()
            },
            signature_storage_bridge_version:
                B2C_SIGNATURE_STORAGE_BRIDGE_VERSION,
            updated_at: serverTimestamp()
        },
        { merge: true }
    );

    return {
        downloadUrl,
        storagePath,
        sha256,
        sizeBytes: Number(remoteMetadata.size || blob.size),
        signatureId
    };
}

function sustituirToDataURLPorURL(canvas, downloadUrl) {
    if (!originalToDataURLByCanvas.has(canvas)) {
        originalToDataURLByCanvas.set(canvas, canvas.toDataURL.bind(canvas));
    }

    canvas.toDataURL = () => downloadUrl;
    canvas.dataset.b2cSignatureStored = "true";
    canvas.dataset.b2cSignatureUrl = downloadUrl;
}

function mensajeError(error) {
    const code = textoSeguro(error?.code || error?.message, 180);
    const messages = {
        SERVICE_NOT_FOUND: "No se encontró el servicio de la firma.",
        TECHNICIAN_SERVICE_MISMATCH: "Este cierre pertenece a otro técnico.",
        INVALID_SERVICE_STATE: "El servicio ya no está en reparación.",
        CUSTOMER_SIGNATURE_REQUIRED: "El cliente debe dibujar su firma.",
        SIGNATURE_SIZE_NOT_ALLOWED: "La firma excedió el tamaño económico permitido.",
        SIGNATURE_SERVICE_ID_MISSING: "No fue posible vincular la firma con el folio."
    };
    return messages[code] ||
        "No se pudo guardar la firma económica. Revisa la conexión y vuelve a intentarlo.";
}

async function prepararFirmaAntesDelLegacy({ button, modal }) {
    const technicianId = textoSeguro(auth.currentUser?.uid, 128);
    if (!technicianId) throw new Error("AUTH_REQUIRED");

    const serviceId = serviceIdDesdeArchivo(modal);
    if (!serviceId) throw new Error("SIGNATURE_SERVICE_ID_MISSING");

    const canvas = modal.querySelector("#canvasFirma");
    if (!canvasTieneFirma(canvas)) throw new Error("CUSTOMER_SIGNATURE_REQUIRED");

    const serviceData = await verificarServicio({ serviceId, technicianId });
    const result = await subirFirma({
        serviceId,
        technicianId,
        customerId: serviceData.cliente_id || null,
        canvas
    });

    sustituirToDataURLPorURL(canvas, result.downloadUrl);
    button.dataset.b2cSignatureStorageReady = "true";
    button.dataset.b2cSignatureStorageBypass = "true";
    button.dataset.b2cSignatureStoragePath = result.storagePath;
    button.dataset.b2cSignatureSha256 = result.sha256;

    return result;
}

export function instalarPuenteFirmaStorageB2C() {
    if (globalThis[INSTALL_KEY]) return globalThis[INSTALL_KEY];

    const listener = (event) => {
        const button = event.target?.closest?.("#btnSubirEvidencia");
        const modal = button?.closest?.("#modalEvidencia");
        if (!button || !modal) return;

        // Click final lanzado por el guardia cronológico: ya existe URL verificada.
        if (
            button.dataset.b2cChronologyBypass === "true" &&
            button.dataset.b2cSignatureStorageReady === "true"
        ) {
            return;
        }

        // Segundo click interno: permite que el guardia cronológico valide y continúe.
        if (button.dataset.b2cSignatureStorageBypass === "true") {
            button.dataset.b2cSignatureStorageBypass = "false";
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (button.dataset.b2cSignatureStorageBusy === "true") return;

        button.dataset.b2cSignatureStorageBusy = "true";
        button.disabled = true;
        const originalHtml = button.innerHTML;
        button.innerHTML = '<i class="fas fa-cloud-arrow-up fa-spin"></i> GUARDANDO FIRMA ECONÓMICA...';

        prepararFirmaAntesDelLegacy({ button, modal }).then(() => {
            button.dataset.b2cSignatureStorageBusy = "false";
            button.disabled = false;
            button.innerHTML = originalHtml;
            button.click();
        }).catch((error) => {
            console.error("[B2C_SIGNATURE_STORAGE_ERROR]", error);
            button.dataset.b2cSignatureStorageBusy = "false";
            button.dataset.b2cSignatureStorageReady = "false";
            button.disabled = false;
            button.innerHTML = originalHtml;
            alert(`⚠️ ${mensajeError(error)}`);
        });
    };

    document.addEventListener("click", listener, true);

    const installation = {
        version: B2C_SIGNATURE_STORAGE_BRIDGE_VERSION,
        uninstall() {
            document.removeEventListener("click", listener, true);
            delete globalThis[INSTALL_KEY];
        }
    };

    globalThis[INSTALL_KEY] = installation;
    console.log(
        `[B2C_SIGNATURE_STORAGE_READY] v${B2C_SIGNATURE_STORAGE_BRIDGE_VERSION}`
    );
    return installation;
}

// Side effect deliberado: se instala una sola vez desde app-panel.js.
instalarPuenteFirmaStorageB2C();
