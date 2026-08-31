import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
    assertTechnicianCanOperate,
    buildTechnicianReviewPatch,
    createTechnicianRegistrationProfile,
    getTechnicianKycRequirements,
    normalizeTechnicianProfile,
    storagePathForTechnicianDocument,
    TECHNICIAN_KYC_STATES
} from "../b2c-technician-profile.js";
import {
    buildDestinationCandidates,
    confirmDestination,
    extractCoordinatesFromMapInput,
    findDestinationConflicts,
    getConfirmedServiceDestination
} from "../b2c-destination.js";

const completeProfile = (overrides = {}) => ({
    ...createTechnicianRegistrationProfile({ uid: "tech-1", email: "TECH@EXAMPLE.COM", nombre: "Ana" }),
    foto_perfil: "https://storage/perfil.jpg",
    telefono: "9980000000",
    skills: ["fix"],
    vehiculo: { tipo: "auto", placas: "ABC123" },
    documentos: {
        ine: "https://storage/ine.pdf",
        csf: "https://storage/csf.pdf",
        licencia: "https://storage/licencia.pdf",
        certificados: []
    },
    datos_bancarios: { banco: "Banco", clabe: "123456789012345678", titular: "Ana" },
    ...overrides
});

test("email/password y Google parten del mismo contrato técnico no operativo", () => {
    for (const provider of ["password", "google"]) {
        const profile = createTechnicianRegistrationProfile({ uid: "u", email: "USER@EXAMPLE.COM", nombre: "Ana", provider });
        assert.equal(profile.email, "user@example.com");
        assert.equal(profile.estado, TECHNICIAN_KYC_STATES.DOCUMENTS_PENDING);
        assert.equal(profile.status, TECHNICIAN_KYC_STATES.DOCUMENTS_PENDING);
        assert.equal(profile.kyc.aprobado, false);
        assert.equal(profile.disponible, false);
        assert.deepEqual(profile.documentos.certificados, []);
    }
});

test("KYC canónico conserva vehículo y certificados plurales", () => {
    const profile = completeProfile({ documentos: { ...completeProfile().documentos, certificados: ["a", "b"] } });
    const result = getTechnicianKycRequirements(profile);
    assert.equal(result.complete, true);
    assert.equal(result.profile.vehiculo.tipo, "auto");
    assert.equal(result.profile.vehiculo.placas, "ABC123");
    assert.deepEqual(result.profile.documentos.certificados, ["a", "b"]);
    assert.equal(buildTechnicianReviewPatch(profile).estado, TECHNICIAN_KYC_STATES.PENDING_REVIEW);
});

test("compatibilidad legacy sólo normaliza lectura", () => {
    const normalized = normalizeTechnicianProfile({
        rol: "tecnico",
        estado: "pendiente",
        vehiculo_tipo: "Moto",
        placas: "legacy-1",
        documentos: { certificado: "legacy-cert" }
    });
    assert.equal(normalized.estado, TECHNICIAN_KYC_STATES.PENDING_REVIEW);
    assert.deepEqual(normalized.vehiculo, { tipo: "moto", placas: "LEGACY-1" });
    assert.deepEqual(normalized.documentos.certificados, ["legacy-cert"]);
});

test("peatón no requiere placas ni licencia ni certificados", () => {
    const pedestrian = completeProfile({
        vehiculo: { tipo: "peaton", placas: "" },
        documentos: { ...completeProfile().documentos, licencia: null, certificados: [] }
    });
    const result = getTechnicianKycRequirements(pedestrian);
    assert.equal(result.pedestrian, true);
    assert.equal(result.complete, true);
    assert.equal(result.certificatesOptional, true);
});

test("un técnico no opera antes de aprobación ni durante suspensión", () => {
    assert.equal(assertTechnicianCanOperate(completeProfile()).reason, "KYC_APPROVAL_REQUIRED");
    const active = completeProfile({ estado: "activo", status: "activo", kyc: { estado: "activo", aprobado: true } });
    assert.equal(assertTechnicianCanOperate(active).ok, true);
    assert.equal(assertTechnicianCanOperate({ ...active, suspendido: true }).reason, "TECHNICIAN_SUSPENDED");
});

test("las rutas de expediente son estables para reintentos", () => {
    assert.equal(
        storagePathForTechnicianDocument("tech-1", "ine", "INE.PDF"),
        "expedientes/tech-1/ine/current.pdf"
    );
});

test("destino sólo dirección", () => {
    const destination = confirmDestination({ address: "Calle 60", selectedSource: "direccion_manual" });
    assert.equal(destination.direccion, "Calle 60");
    assert.equal(destination.coords, null);
    assert.equal(destination.confirmado_por_cliente, true);
});

test("destino sólo GPS", () => {
    const destination = confirmDestination({ gps: { lat: 21.16, lng: -86.85 }, selectedSource: "gps_dispositivo" });
    assert.deepEqual(destination.coords, { lat: 21.16, lng: -86.85 });
});

test("dirección y GPS concordantes no generan discrepancia", () => {
    const destination = confirmDestination({
        address: "Casa",
        gps: { lat: 21.1619, lng: -86.8515 },
        pin: { lat: 21.162, lng: -86.8516 },
        selectedSource: "gps_dispositivo"
    });
    assert.equal(destination.discrepancia, false);
});

test("dirección, GPS y pin discrepantes quedan auditados", () => {
    const destination = confirmDestination({
        address: "Casa",
        gps: { lat: 21.1619, lng: -86.8515 },
        pin: { lat: 21.20, lng: -86.90 },
        selectedSource: "mapa_pin"
    });
    assert.equal(destination.discrepancia, true);
    assert.ok(destination.discrepancias[0].distance_m > 150);
});

test("extrae coordenadas de enlaces Waze/Maps y rechaza enlaces opacos", () => {
    assert.deepEqual(extractCoordinatesFromMapInput("https://maps.google.com/?q=21.1619,-86.8515"), { lat: 21.1619, lng: -86.8515 });
    assert.deepEqual(extractCoordinatesFromMapInput("https://waze.com/ul?ll=21.1619%2C-86.8515"), { lat: 21.1619, lng: -86.8515 });
    assert.equal(extractCoordinatesFromMapInput("https://maps.app.goo.gl/opaque"), null);
    assert.throws(
        () => confirmDestination({ mapLink: "https://maps.app.goo.gl/opaque", selectedSource: "waze_maps" }),
        /MAP_LINK_COORDINATES_REQUIRED/
    );
});

test("cambiar el pin cambia el candidato pero no la fuente elegida silenciosamente", () => {
    const first = confirmDestination({ address: "Casa", pin: { lat: 21.1, lng: -86.8 }, selectedSource: "mapa_pin" });
    const second = confirmDestination({ address: "Casa", pin: { lat: 21.2, lng: -86.9 }, selectedSource: "mapa_pin" });
    assert.notDeepEqual(first.coords, second.coords);
    assert.equal(second.fuente, "mapa_pin");
});

test("conflicto Waze versus pin obliga a conservar ambas entradas", () => {
    const built = buildDestinationCandidates({
        mapLink: "https://maps.google.com/?q=21.1619,-86.8515",
        pin: { lat: 21.20, lng: -86.90 }
    });
    assert.ok(findDestinationConflicts(built.candidates).length > 0);
    const confirmed = confirmDestination({
        mapLink: built.inputs.link_mapa,
        pin: built.inputs.pin_mapa,
        selectedSource: "waze_maps"
    });
    assert.deepEqual(confirmed.inputs.pin_mapa, { lat: 21.2, lng: -86.9 });
    assert.deepEqual(confirmed.coords, { lat: 21.1619, lng: -86.8515 });
});

test("persistencia, recarga, técnico, llegada y disputa leen el mismo destino", () => {
    const destino = confirmDestination({ address: "Calle 1", pin: { lat: 21.17, lng: -86.86 }, selectedSource: "mapa_pin" });
    const persisted = JSON.parse(JSON.stringify({ destino }));
    const customer = getConfirmedServiceDestination(persisted);
    const technician = getConfirmedServiceDestination(persisted);
    const arrival = getConfirmedServiceDestination(persisted);
    const dispute = getConfirmedServiceDestination(persisted);
    assert.deepEqual(customer, technician);
    assert.deepEqual(technician.coords, arrival.coords);
    assert.deepEqual(arrival.coords, dispute.coords);
    assert.equal(customer.legacy, false);
});

test("integración elimina overrides silenciosos, amplía mapa y delega aprobación", () => {
    const client = fs.readFileSync(new URL("../panel-cliente.js", import.meta.url), "utf8");
    const html = fs.readFileSync(new URL("../cliente.html", import.meta.url), "utf8");
    const admin = fs.readFileSync(new URL("../panel-admin.js", import.meta.url), "utf8");
    const registration = fs.readFileSync(new URL("../app-registro.js", import.meta.url), "utf8");
    const technician = fs.readFileSync(new URL("../panel-tecnico.js", import.meta.url), "utf8");
    const marketplace = fs.readFileSync(new URL("../functions/b2c-service-marketplace.js", import.meta.url), "utf8");
    const firebaseConfig = JSON.parse(fs.readFileSync(new URL("../firebase.json", import.meta.url), "utf8"));
    assert.doesNotMatch(client, /SOBRESCRIBIMOS EL GPS|SNIPER DEL MAPA INTERACTIVO/);
    assert.match(client, /confirmDestination/);
    assert.match(html, /btnExpandirMapa/);
    assert.match(html, /mapa-expandido/);
    assert.match(admin, /aprobarTecnicoB2C\(uid\)/);
    assert.match(registration, /emailSeguro/);
    assert.doesNotMatch(registration, /email:\s*email\.toLowerCase\(\)/);
    assert.match(technician, /collection\(db, "service_marketplace"\)/);
    assert.match(technician, /reclamarServicioB2C\(id\)/);
    assert.match(technician, /enviarCotizacionB2C/);
    assert.match(client, /responderCotizacionB2C/);
    assert.doesNotMatch(client, /Simulando éxito de Stripe/);
    assert.doesNotMatch(client, /setTimeout\(async \(\) => \{\s*await updateDoc\(doc\(db, "services", id\), \{ estado: "trabajando" \}\)/);
    assert.doesNotMatch(technician, /collection\(db, "services"\),\s*where\("estado", "in", \["pendiente", "pagado"\]\)/);
    for (const privateField of ["descripcion", "direccion", "coords", "cliente_telefono", "foto_problema", "destino"]) {
        const listingBody = marketplace.slice(marketplace.indexOf("function buildMarketplaceListing"), marketplace.indexOf("function isOperationalTechnician"));
        assert.doesNotMatch(listingBody, new RegExp(`${privateField}:`));
    }
    assert.equal(firebaseConfig.firestore.rules, "security/firestore-console-snapshot-2026-07-30.rules.txt");
    assert.equal(firebaseConfig.storage.rules, "security/storage-hardening-candidate.rules.txt");
});
