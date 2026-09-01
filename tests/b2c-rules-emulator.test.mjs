import fs from "node:fs";
import test, { after, before } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";

let environment;

const documentRef = name => ({ storage_path: `expedientes/tech-1/${name}/current.png` });
const operationalTechnician = {
    rol: "tecnico",
    tipo_cuenta: "B2C",
    estado: "activo",
    status: "activo",
    disponible: true,
    suspendido: false,
    kyc: { aprobado: true, estado: "activo" },
    foto_perfil: documentRef("foto"),
    documentos: { ine: documentRef("ine"), csf: documentRef("csf"), licencia: null, certificados: [] },
    datos_bancarios: { banco: "Banco", clabe: "012345678901234567" },
    vehiculo: { tipo: "peaton", placas: null },
    skills: ["fix_plomeria"]
};

before(async () => {
    environment = await initializeTestEnvironment({
        projectId: "fixgo-b2c-rules-test",
        firestore: { rules: fs.readFileSync(new URL("../security/firestore-console-snapshot-2026-07-30.rules.txt", import.meta.url), "utf8") },
        storage: { rules: fs.readFileSync(new URL("../security/storage-hardening-candidate.rules.txt", import.meta.url), "utf8") }
    });
    await environment.withSecurityRulesDisabled(async context => {
        const db = context.firestore();
        await setDoc(doc(db, "users/client-1"), {
            rol: "cliente", tipo_cuenta: "B2C", estado: "activo", status: "activo",
            pagos: { stripe_autorizado: false, efectivo_autorizado: true }
        });
        await setDoc(doc(db, "users/b2b-1"), { rol: "cliente", tipo_cuenta: "B2B", estado: "activo", status: "activo" });
        await setDoc(doc(db, "users/b2b-tech"), {
            rol: "tecnico", tipo_cuenta: "B2B", estado: "activo", status: "activo", edificioId: "uxmal39"
        });
        await setDoc(doc(db, "users/b2b-admin"), {
            rol: "admin_b2b", tipo_cuenta: "B2B", estado: "activo", status: "activo", edificioId: "uxmal39"
        });
        await setDoc(doc(db, "users/b2b-other"), {
            rol: "tecnico", tipo_cuenta: "B2B", estado: "activo", status: "activo", edificioId: "otro"
        });
        await setDoc(doc(db, "users/tech-1"), operationalTechnician);
        await setDoc(doc(db, "users/tech-off"), { ...operationalTechnician, disponible: false });
        await setDoc(doc(db, "configuracion/catalogo_global"), { maint_general: true });
        await setDoc(doc(db, "service_marketplace/svc-1"), { service_id: "svc-1", estado: "disponible" });
        await setDoc(doc(db, "platform_events/marketplace_service_available_svc-1"), {
            event_type: "marketplace_service_available", service_id: "svc-1"
        });
        await setDoc(doc(db, "servicios_b2b/order-1"), {
            edificioId: "uxmal39", tecnicoId: "b2b-tech", status: "en_proceso"
        });
    });
});
after(async () => environment?.cleanup());

test("cliente B2C no puede mutar autorizaciones de pago", async () => {
    const db = environment.authenticatedContext("client-1").firestore();
    await assertSucceeds(getDoc(doc(db, "users/client-1")));
    await assertFails(updateDoc(doc(db, "users/client-1"), { "pagos.efectivo_autorizado": false }));
    await assertFails(updateDoc(doc(db, "users/client-1"), { efectivo_autorizado: true }));
});

test("creación B2C directa falla y el contrato B2B separado permanece", async () => {
    const customerDb = environment.authenticatedContext("client-1").firestore();
    await assertFails(setDoc(doc(customerDb, "services/direct-b2c"), {
        cliente_id: "client-1", metodo_pago: "efectivo", estado: "pendiente"
    }));
    const b2bDb = environment.authenticatedContext("b2b-1").firestore();
    await assertSucceeds(setDoc(doc(b2bDb, "services/direct-b2b"), {
        cliente_id: "b2b-1", metodo_pago: "b2b", estado: "pendiente",
        tipo: "mantenimiento", categoria: "MAINT", categoria_id: "maint_general", sub_servicio: "GENERAL"
    }));
    await assertFails(setDoc(doc(b2bDb, "services/direct-b2b-road"), {
        cliente_id: "b2b-1", metodo_pago: "b2b", estado: "pendiente",
        tipo: "mantenimiento", categoria: "ROAD", categoria_id: "road_llanta", sub_servicio: "LLANTA"
    }));
});

test("marketplace y evento sólo son visibles para técnico canónico disponible", async () => {
    const activeDb = environment.authenticatedContext("tech-1").firestore();
    const inactiveDb = environment.authenticatedContext("tech-off").firestore();
    await assertSucceeds(getDoc(doc(activeDb, "service_marketplace/svc-1")));
    await assertSucceeds(getDoc(doc(activeDb, "platform_events/marketplace_service_available_svc-1")));
    await assertFails(getDoc(doc(inactiveDb, "service_marketplace/svc-1")));
    await assertFails(getDoc(doc(inactiveDb, "platform_events/marketplace_service_available_svc-1")));
});

test("Storage permite expediente propio válido y niega expediente ajeno", async () => {
    const ownStorage = environment.authenticatedContext("tech-1").storage();
    const otherStorage = environment.authenticatedContext("client-1").storage();
    const payload = new Uint8Array([137, 80, 78, 71]);
    await assertSucceeds(uploadBytes(ref(ownStorage, "expedientes/tech-1/ine/current.png"), payload, { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(otherStorage, "expedientes/tech-1/ine/foreign.png"), payload, { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(ownStorage, "unexpected/path.bin"), payload, { contentType: "application/octet-stream" }));
});

test("Storage conserva firma, avatar y pase B2B sin abrir rutas a otros tenants", async () => {
    const techStorage = environment.authenticatedContext("b2b-tech").storage();
    const adminStorage = environment.authenticatedContext("b2b-admin").storage();
    const otherStorage = environment.authenticatedContext("b2b-other").storage();
    const image = new Uint8Array([137, 80, 78, 71]);
    const html = new TextEncoder().encode("<!doctype html><title>Pase</title>");

    await assertSucceeds(uploadBytes(ref(techStorage, "firmas/order-1/conformidad.png"), image, { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(otherStorage, "firmas/order-1/conformidad.png"), image, { contentType: "image/png" }));
    await assertSucceeds(uploadBytes(ref(techStorage, "perfiles_tecnicos/b2b-tech.jpg"), image, { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(otherStorage, "perfiles_tecnicos/b2b-tech.jpg"), image, { contentType: "image/jpeg" }));
    await assertSucceeds(uploadBytes(ref(adminStorage, "pases_digitales/uxmal39/visita.html"), html, { contentType: "text/html" }));
    await assertFails(uploadBytes(ref(techStorage, "pases_digitales/uxmal39/visita-tech.html"), html, { contentType: "text/html" }));
});

test("movimientos financieros B2C se reservan al backend", async () => {
    const db = environment.authenticatedContext("tech-1").firestore();
    await assertFails(setDoc(doc(db, "retiros/direct-client-write"), {
        tecnico_id: "tech-1", monto: 999999, estado: "pendiente"
    }));
    await assertFails(setDoc(doc(db, "transacciones/direct-client-write"), {
        tecnico_id: "tech-1", pago_tecnico: 999999, tipo: "abono"
    }));
});
