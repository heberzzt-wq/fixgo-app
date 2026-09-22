import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
    assertTechnicianCanOperate,
    buildTechnicianReviewPatch,
    createTechnicianRegistrationProfile,
    dispatchMarketplaceEventForTechnician,
    getTechnicianKycRequirements,
    inspectMexicanClabe,
    MEXICAN_CLABE_VERSION,
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
        ine_reverso: "https://storage/ine-reverso.jpg",
        selfie_liveness_left: "https://storage/selfie-left.jpg",
        selfie_liveness_right: "https://storage/selfie-right.jpg",
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
        assert.equal(profile.kyc.identity_required, true);
        assert.equal(profile.kyc.identity_verified, false);
        assert.equal(profile.disponible, false);
        assert.deepEqual(profile.documentos.certificados, []);
    }
});

test("CLABE mexicana valida checksum y detecta institución desde catálogo Banxico", () => {
    const info = inspectMexicanClabe("002180032240946700");
    assert.equal(info.formatValid, true);
    assert.equal(info.checksumValid, true);
    assert.equal(info.valid, true);
    assert.equal(info.institutionCode, "002");
    assert.equal(info.institutionName, "BANAMEX");
    assert.equal(info.institutionKey, "40002");
    assert.equal(info.catalogSource, "BANXICO_CEP_SCL_2026-09-22");

    const badChecksum = inspectMexicanClabe("002180032240946701");
    assert.equal(badChecksum.formatValid, true);
    assert.equal(badChecksum.checksumValid, false);
    assert.equal(badChecksum.valid, false);

    const unknown = inspectMexicanClabe("999180032240946700");
    assert.equal(unknown.institutionName, null);
    assert.equal(unknown.valid, false);
});

test("smart banking exige que banco y claves deriven de la CLABE", () => {
    const base = completeProfile();
    const smart = {
        ...base,
        datos_bancarios: {
            banco: "BANAMEX",
            clabe: "002180032240946700",
            titular: "Ana",
            banking_version: MEXICAN_CLABE_VERSION,
            institucion_clave: "002",
            institucion_key: "40002",
            institucion_nombre: "BANAMEX",
            catalog_source: "BANXICO_CEP_SCL_2026-09-22"
        }
    };
    const valid = getTechnicianKycRequirements(smart);
    assert.equal(valid.required.banco, true);
    assert.equal(valid.required.clabe, true);
    assert.equal(valid.bankingInspection.valid, true);

    const forged = getTechnicianKycRequirements({
        ...smart,
        datos_bancarios: { ...smart.datos_bancarios, banco: "SANTANDER" }
    });
    assert.equal(forged.complete, false);
    assert.equal(forged.required.banco, false);
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
    assert.equal(assertTechnicianCanOperate(completeProfile()).reason, "IDENTITY_VERIFICATION_REQUIRED");
    const active = completeProfile({
        estado: "activo",
        status: "activo",
        kyc: { estado: "activo", aprobado: true, identity_required: true, identity_verified: true }
    });
    assert.equal(assertTechnicianCanOperate(active).ok, true);
    assert.equal(assertTechnicianCanOperate({ ...active, suspendido: true }).reason, "TECHNICIAN_SUSPENDED");
});

test("una alerta marketplace sólo se despacha para un listing compatible", () => {
    let dispatches = 0;
    const dispatch = () => { dispatches += 1; };
    assert.equal(dispatchMarketplaceEventForTechnician(
        { skills: ["FIX"] },
        { categoria_id: "fix_plomeria" },
        dispatch
    ), true);
    assert.equal(dispatchMarketplaceEventForTechnician(
        { skills: ["ROAD"] },
        { categoria_id: "fix_plomeria" },
        dispatch
    ), false);
    assert.equal(dispatches, 1);
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
    const registrationHtml = fs.readFileSync(new URL("../registro.html", import.meta.url), "utf8");
    const technician = fs.readFileSync(new URL("../panel-tecnico.js", import.meta.url), "utf8");
    const alerts = fs.readFileSync(new URL("../alert-engine.js", import.meta.url), "utf8");
    const utilities = fs.readFileSync(new URL("../app-utils.js", import.meta.url), "utf8");
    const worker = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
    const marketplace = fs.readFileSync(new URL("../functions/b2c-service-marketplace.js", import.meta.url), "utf8");
    const firebaseConfig = JSON.parse(fs.readFileSync(new URL("../firebase.json", import.meta.url), "utf8"));
    assert.doesNotMatch(client, /SOBRESCRIBIMOS EL GPS|SNIPER DEL MAPA INTERACTIVO/);
    assert.match(client, /confirmDestination/);
    assert.match(client, /clienteIdentityReviewBanner/);
    assert.match(client, /identityBlocked/);
    assert.match(html, /btnExpandirMapa/);
    assert.match(html, /mapa-expandido/);
    assert.match(client, /platformContract\.SERVICE_CATALOG/);
    assert.match(client, /platformContract\.isServiceCategoryEnabled/);
    assert.match(client, /platformContract\.isServiceAllowedForCustomer/);
    assert.match(client, /tipo:\s*"mantenimiento"/);
    assert.doesNotMatch(client, /const DEFINICION_VERTICALES\s*=\s*\{/);
    assert.match(admin, /platformContract\.SERVICE_CATALOG/);
    assert.match(admin, /platformContract\.serviceCoverageCount/);
    assert.match(admin, /nuevaConfig\[realId\]\s*=\s*input\.checked/);
    assert.doesNotMatch(admin, /nuevaConfig\[realId\]\s*=\s*coverage\s*>\s*0/);
    assert.doesNotMatch(admin, /const MASTER_STRUCTURE\s*=\s*\{/);
    assert.match(admin, /aprobarTecnicoB2C\(uid\)/);
    assert.match(registration, /navigator\.mediaDevices\?\.getUserMedia/);
    assert.match(registration, /IDENTITY_CAPTURE_VERSION/);
    assert.match(registration, /ine_reverso/);
    assert.match(registration, /selfie_liveness_left/);
    assert.match(registration, /selfie_liveness_right/);
    assert.match(registrationHtml, /modalIdentidadTecnico/);
    assert.match(registrationHtml, /chkBiometriaTecnico/);
    assert.match(registrationHtml, /btnIniciarIdentidadCliente/);
    assert.match(registrationHtml, /chkBiometriaCliente/);
    assert.match(registration, /identityCaptureState\.target/);
    assert.match(registration, /verificarIdentidadB2C\(\)/);
    assert.match(registration, /CUSTOMER_IDENTITY|identityResult/);
    assert.match(registration, /Las altas nuevas B2C requieren INE y biometría en vivo/);
    assert.match(registrationHtml, /INE \+ biometría facial/);
    assert.match(registrationHtml, /Banco pendiente de detectar/);
    assert.match(registrationHtml, /id="clabeTecnico"/);
    assert.doesNotMatch(registrationHtml, /name="banco" placeholder="Nombre del Banco"/);
    assert.match(registration, /inspectMexicanClabe/);
    assert.match(registration, /MEXICAN_CLABE_VERSION/);
    assert.match(technician, /compClabeBankStatus/);
    assert.doesNotMatch(technician, /id="compBanco"/);
    assert.doesNotMatch(registration, /skill_maint/);
    assert.doesNotMatch(registration, /email:\s*email\.toLowerCase\(\)/);
    assert.match(technician, /collection\(db, "service_marketplace"\)/);
    assert.match(technician, /dispatchMarketplaceEventForTechnician\(obtenerTecnico\(\), listing/);
    assert.match(technician, /getPlatformServiceWorkerRegistration\(\)/);
    assert.match(technician, /push_runtime:/);
    assert.match(technician, /ultimaSincronizacionPush:\s*serverTimestamp\(\)/);
    assert.match(technician, /foreground_fcm_\$\{Date\.now\(\)\}/);
    assert.match(technician, /payload\?\.notification\?\.title/);
    assert.match(technician, /PROBAR TIMBRE Y VIBRACIÓN/);
    assert.doesNotMatch(technician, /navigator\.serviceWorker\.ready\.then\(async \(registration\)/);
    assert.match(utilities, /getPlatformServiceWorkerRegistration\(\)/);
    for (const source of [alerts, utilities, worker]) {
        assert.match(source, /700, 180, 700, 180, 700, 180, 1200/);
    }
    assert.match(alerts, /index \* 380/);
    assert.match(utilities, /silent:\s*false/);
    assert.match(worker, /silent:\s*false/);
    assert.match(technician, /reclamarServicioB2C\(id\)/);
    assert.match(technician, /enviarCotizacionB2C/);
    assert.match(client, /responderCotizacionB2C/);
    assert.match(client, /cancelarServicioB2C/);
    assert.match(client, /s\.estado === "pendiente" && !s\.tecnico_id && s\.tipo !== "mantenimiento"/);
    const customerCancellation = client.slice(
        client.indexOf("window.cancelarTicketFantasma = async"),
        client.indexOf("window.iniciarPagoSaldo = async")
    );
    assert.match(customerCancellation, /cancelarServicioB2C\(id,/);
    assert.doesNotMatch(customerCancellation, /updateDoc\(/);
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
