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

test("KYC técnico queda completo sin giros laterales y conserva revisión administrativa", () => {
    const profile = completeProfile();
    const result = getTechnicianKycRequirements(profile);
    assert.equal(result.required.ine_reverso, true);
    assert.equal("selfie_liveness_left" in result.required, false);
    assert.equal("selfie_liveness_right" in result.required, false);
    assert.equal(result.complete, true);
    assert.equal(buildTechnicianReviewPatch(profile).estado, TECHNICIAN_KYC_STATES.PENDING_REVIEW);
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
    assert.match(client, /startCustomerIdentityRecovery/);
    assert.match(client, /clientIdentityModal/);
    assert.match(client, /navigator\.mediaDevices\?\.getUserMedia/);
    assert.match(client, /storagePathForTechnicianDocument/);
    assert.match(client, /persistCustomerIdentityRecovery/);
    assert.doesNotMatch(client, /window\.location\.href = "registro\.html\?resume=cliente-identity"/);
    assert.match(html, /id="clientIdentityModal"/);
    assert.match(html, /#clientIdentityVerifyReviewedButton\s*\{[\s\S]*?position:\s*sticky/);
    assert.match(html, /bottom:\s*max\(\.75rem, env\(safe-area-inset-bottom\)\)/);
    assert.match(html, /id="clientIdentityReviewView"[^>]*pb-24/);
    assert.match(html, /client-identity-camera\[data-frame="document"\] video/);
    assert.match(html, /object-fit:\s*contain/);
    assert.match(html, /height:\s*100dvh/);
    assert.match(client, /identityBlocked/);
    assert.match(client, /clienteIdentityMachineReason/);
    assert.match(client, /clienteIdentityRetryButton/);
    assert.match(client, /identity_machine_reasons/);
    assert.match(client, /verificarIdentidadB2C\(\)/);
    assert.match(client, /REINTENTAR VALIDACIÓN AUTOMÁTICA/);
    assert.match(client, /REANUDAR CAPTURA DE IDENTIDAD/);
    assert.match(client, /identityEvidenceComplete/);
    assert.match(client, /identityStepKeysFromReasons/);
    assert.match(client, /Legacy static-frame liveness results are not customer gates anymore/);
    const mismatchRecovery = client.slice(
        client.indexOf('if (reason === "SELFIE_INE_FACE_MISMATCH")'),
        client.indexOf('if (reason === "ADMIN_SELFIE_RECAPTURE_REQUIRED")')
    );
    assert.doesNotMatch(mismatchRecovery, /keys\.add\("selfie_front"\)|keys\.add\("ine_front"\)/);
    assert.match(mismatchRecovery, /human review/);
    const customerIdentitySteps = client.slice(client.indexOf("const customerIdentityAllSteps"), client.indexOf("function identityStepKeysFromReasons"));
    assert.doesNotMatch(customerIdentitySteps, /selfie_left|selfie_right|selfie_liveness_left|selfie_liveness_right/);
    const customerRegistration = registration.slice(registration.indexOf("if (btnRegistroCliente)"), registration.indexOf("// ======================================================\n// B. LÓGICA DE TÉCNICOS"));
    assert.doesNotMatch(customerRegistration, /selfie_liveness_left|selfie_liveness_right|archivoSelfieIzquierda|archivoSelfieDerecha/);
    assert.match(registration, /function identityStepsForTarget\(target\)[\s\S]*?return identitySteps/);
    assert.doesNotMatch(registration, /key:\s*"selfie_left"|key:\s*"selfie_right"/);
    assert.match(client, /describeIdentityReview/);
    assert.match(client, /targetedRecaptureAvailable/);
    assert.match(client, /RECAPTURAR SELFIE/);
    assert.match(client, /failedStepKeys\.has\(step\.key\)/);
    assert.match(client, /startCustomerIdentityRecovery\([\s\S]*reasonsOverride = identityReasons,[\s\S]*stepKeysOverride = null[\s\S]*\)/);
    assert.match(client, /identityStepKeysFromReasons\(reasonsOverride\)/);
    assert.match(client, /await startCustomerIdentityRecovery\(reasons\)/);
    assert.match(client, /ABRIENDO RECAPTURA/);
    assert.match(client, /noDiagnosticRevalidation/);
    assert.match(client, /mismatchRevalidation/);
    assert.match(client, /effectiveIdentityStepKeys/);
    assert.match(client, /REINTENTAR VALIDACIÓN AUTOMÁTICA/);
    assert.match(client, /stepKeysOverride instanceof Set/);
    assert.match(client, /resource-exhausted/);
    assert.match(client, /customerIdentityAttemptError/);
    assert.match(client, /details\.reason/);
    assert.match(client, /same_capture_limit/);
    assert.match(client, /fresh_capture_limit/);
    assert.match(client, /No necesitas tomar otra foto/);
    assert.match(client, /manual_review_required/);
    assert.match(client, /ENVIAR A REVISIÓN/);
    assert.match(client, /identity_manual_verified/);
    assert.match(client, /admin_manual_review/);
    assert.match(admin, /customerIdentityReviewQueue/);
    assert.match(admin, /approve_customer_identity/);
    assert.match(admin, /request_customer_identity_recapture/);
    assert.doesNotMatch(client, /Repite únicamente la biometría facial; no volveremos a pedir tu INE/);
    assert.doesNotMatch(client, /new Set\(\["selfie_front", "selfie_left", "selfie_right"\]\)/);
    assert.match(client, /customerIdentityRecapturePath/);
    assert.match(client, /\/recaptures\/\$\{kind\}\/capture-/);
    assert.match(client, /verificarIdentidadB2C\(\{ recaptureEvidence \}\)/);
    assert.match(client, /customerIdentityRecovery\.uploaded/);
    assert.match(client, /customerIdentityRecovery\.pendingUpload/);
    assert.match(client, /REINTENTAR SUBIDA/);
    assert.match(client, /clientIdentityReviewGrid/);
    assert.match(client, /clientIdentityVerifyReviewedButton/);
    assert.match(client, /showCustomerIdentityReview/);
    assert.match(client, /data-client-identity-retake/);
    assert.match(client, /data-client-identity-remove/);
    assert.match(client, /CUSTOMER_IDENTITY_RECAPTURE_REQUIRED/);
    assert.match(html, /id="clientIdentityReviewView"/);
    assert.match(html, /VERIFICAR MI IDENTIDAD/);
    assert.doesNotMatch(client, /storagePathForTechnicianDocument\(user\.uid, step\.kind, file\.name\)/);
    assert.match(client, /FACE_ANTISPOOF_LOW|LIVENESS/);
    assert.doesNotMatch(client, /registro\.html\?resume=cliente-identity/);
    assert.match(client, /login\.html\?resume=cliente-identity/);
    assert.match(client, /startCustomerIdentityRecovery/);
    assert.match(html, /btnExpandirMapa/);
    assert.match(html, /mapa-expandido/);
    assert.match(client, /platformContract\.SERVICE_CATALOG/);
    assert.match(client, /platformContract\.isServiceCategoryEnabled/);
    assert.match(client, /platformContract\.isServiceAllowedForCustomer/);
    assert.match(client, /tipo:\s*"mantenimiento"/);
    assert.doesNotMatch(client, /const DEFINICION_VERTICALES\s*=\s*\{/);
    assert.match(admin, /platformContract\.SERVICE_CATALOG/);
    assert.match(admin, /platformContract\.serviceCoverageCount/);
    assert.match(admin, /renderCatalog\(\)/);
    assert.match(admin, /Coverage is informative only; never block catalog switches/);
    assert.match(admin, /void cargarPerfilesCoberturaCatalogo\(\)/);
    assert.match(admin, /coverage_\$\{id\}/);
    assert.match(admin, /nuevaConfig\[realId\]\s*=\s*input\.checked/);
    assert.doesNotMatch(admin, /nuevaConfig\[realId\]\s*=\s*coverage\s*>\s*0/);
    assert.doesNotMatch(admin, /const MASTER_STRUCTURE\s*=\s*\{/);
    assert.match(admin, /aprobarTecnicoB2C\(uid\)/);
    assert.match(registration, /navigator\.mediaDevices\?\.getUserMedia/);
    assert.match(registration, /IDENTITY_CAPTURE_VERSION/);
    assert.match(registration, /ine_reverso/);
    assert.match(registrationHtml, /modalIdentidadTecnico/);
    assert.match(registrationHtml, /viewport-fit=cover/);
    assert.match(registrationHtml, /100dvh/);
    assert.match(registrationHtml, /identity-camera-stage\[data-frame="document"\] video/);
    assert.match(registrationHtml, /object-fit:\s*contain/);
    assert.match(registrationHtml, /identity-modal-content/);
    assert.match(registration, /stage\.dataset\.frame = step\.frame/);
    assert.match(registration, /identity-modal-open/);
    assert.match(registration, /aspectRatio:\s*\{\s*ideal:\s*documentCapture \? 16 \/ 9 : 4 \/ 3\s*\}/);
    assert.match(registrationHtml, /chkBiometriaTecnico/);
    assert.match(registrationHtml, /btnIniciarIdentidadCliente/);
    assert.match(registrationHtml, /chkBiometriaCliente/);
    assert.match(registration, /identityCaptureState\.target/);
    assert.match(registration, /showIdentityReview/);
    assert.match(registration, /renderIdentityReview/);
    assert.match(registration, /data-identity-retake/);
    assert.match(registration, /data-identity-remove/);
    assert.match(registration, /btnConfirmarIdentidad/);
    assert.match(registrationHtml, /id="identityReviewView"/);
    assert.match(registrationHtml, /USAR ESTAS CAPTURAS/);
    assert.match(registration, /cliente-identity/);
    assert.match(registration, /resumeExistingCustomer/);
    assert.match(registration, /__SESSION_REUSE_ONLY__/);
    assert.match(registration, /kycState: "identidad_pendiente"/);
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


test("customer biometric callable forwards immutable recapture payload", () => {
    const firebaseSource = fs.readFileSync(new URL("../firebase.js", import.meta.url), "utf8");
    assert.match(firebaseSource, /verificarIdentidadB2C\(payload = \{\}\)/);
    assert.match(firebaseSource, /verifyB2cIdentity"\)\(safePayload\)/);
});

test("release gate keeps mobile identity capture bank-style without document zoom crop", () => {
    const html = fs.readFileSync(new URL("../registro.html", import.meta.url), "utf8");
    const registration = fs.readFileSync(new URL("../app-registro.js", import.meta.url), "utf8");
    assert.match(html, /identity-camera-stage\[data-frame="document"\] video\s*\{[\s\S]*?object-fit:\s*contain/);
    assert.match(html, /#modalIdentidadTecnico\s*\{[\s\S]*?height:\s*100dvh/);
    assert.match(html, /viewport-fit=cover/);
    assert.match(registration, /stage\.dataset\.frame = step\.frame/);
    assert.match(registration, /identity-modal-open/);
});


test("release gate recaptures only failed biometric evidence and hides raw reason codes", () => {
    const client = fs.readFileSync(new URL("../panel-cliente.js", import.meta.url), "utf8");
    assert.match(client, /RECAPTURAR SELFIE/);
    assert.match(client, /failedStepKeys\.has\(step\.key\)/);
    assert.match(client, /describeIdentityReview/);
    assert.match(client, /targetedRecaptureAvailable/);
    assert.match(client, /Legacy static-frame liveness results are not customer gates anymore/);
});


test("release gate opens targeted recapture from fresh biometric reasons in the same click", () => {
    const client = fs.readFileSync(new URL("../panel-cliente.js", import.meta.url), "utf8");
    assert.match(client, /startCustomerIdentityRecovery\([\s\S]*reasonsOverride = identityReasons,[\s\S]*stepKeysOverride = null[\s\S]*\)/);
    assert.match(client, /identityStepKeysFromReasons\(reasonsOverride\)/);
    assert.match(client, /await startCustomerIdentityRecovery\(reasons\)/);
    assert.match(client, /ABRIENDO RECAPTURA/);
});


test("release gate keeps customer biometric recapture immutable and server-adopted", () => {
    const client = fs.readFileSync(new URL("../panel-cliente.js", import.meta.url), "utf8");
    const storage = fs.readFileSync(new URL("../security/storage-hardening-candidate.rules.txt", import.meta.url), "utf8");
    const backend = fs.readFileSync(new URL("../functions/b2c-biometric-identity.js", import.meta.url), "utf8");
    assert.match(client, /customerIdentityRecapturePath/);
    assert.match(client, /verificarIdentidadB2C\(\{ recaptureEvidence \}\)/);
    assert.match(client, /REINTENTAR SUBIDA/);
    assert.match(storage, /match \/expedientes\/\{uid\}\/recaptures\/\{kind\}\/\{fileName\}/);
    assert.match(storage, /allow update, delete: if false/);
    assert.match(backend, /normalizeRecaptureEvidence/);
    assert.match(backend, /recaptureProfilePatch/);
});


test("release gate requires evidence review and individual retake before biometric verification", () => {
    const client = fs.readFileSync(new URL("../panel-cliente.js", import.meta.url), "utf8");
    const clientHtml = fs.readFileSync(new URL("../cliente.html", import.meta.url), "utf8");
    const registration = fs.readFileSync(new URL("../app-registro.js", import.meta.url), "utf8");
    const registrationHtml = fs.readFileSync(new URL("../registro.html", import.meta.url), "utf8");

    assert.match(client, /showCustomerIdentityReview/);
    assert.match(client, /data-client-identity-retake/);
    assert.match(client, /data-client-identity-remove/);
    assert.match(clientHtml, /clientIdentityVerifyReviewedButton/);
    assert.match(client, /missingRecommendedKeys/);
    assert.match(client, /recommendedRetakesComplete/);
    assert.match(client, /CUSTOMER_IDENTITY_REQUIRED_RETAKES_PENDING/);
    assert.match(client, /repite todas las tomas marcadas REVISAR/);
    assert.match(client, /const retryKeys = failedKeys\.size > 0/);
    assert.match(client, /customerIdentityRecovery\.recommendedKeys = new Set\(retryKeys\)/);
    assert.match(client, /showCustomerIdentityReview\(\)/);
    assert.match(client, /Recaptura: \$\{pendingLabels\}/);
    assert.doesNotMatch(client, /setTimeout\(\(\) => window\.location\.reload\(\), 1800\)/);
    assert.match(client, /customerIdentityRecovery\.excludedKeys = new Set\(failedStepKeys\)/);
    assert.match(client, /customerIdentityRecovery\.uploaded\.delete\(step\.key\)/);
    assert.match(client, /customerIdentityRecovery\.excludedKeys\.add\(key\)/);
    assert.match(client, /if \(result\?\.status === "verified"\) \{[\s\S]*?user\.foto_perfil = patch\.foto_perfil/);
    assert.match(client, /if \(result\?\.status === "verified"\) \{[\s\S]*?user\.documentos = \{/);
    assert.match(registration, /showIdentityReview/);
    assert.match(registration, /data-identity-retake/);
    assert.match(registration, /data-identity-remove/);
    assert.match(registrationHtml, /btnConfirmarIdentidad/);
});


test("face capture keeps a wider field of view and never crops the selfie preview", () => {
    const registrationHtml = fs.readFileSync(new URL("../registro.html", import.meta.url), "utf8");
    const clientHtml = fs.readFileSync(new URL("../cliente.html", import.meta.url), "utf8");
    const registration = fs.readFileSync(new URL("../app-registro.js", import.meta.url), "utf8");
    const client = fs.readFileSync(new URL("../panel-cliente.js", import.meta.url), "utf8");

    assert.match(registrationHtml, /identity-camera-stage\[data-frame="face"\] video\s*\{\s*object-fit:\s*contain/);
    assert.match(clientHtml, /client-identity-camera\[data-frame="face"\] video\s*\{\s*object-fit:\s*contain/);
    assert.match(registration, /height:\s*\{\s*ideal:\s*documentCapture \? 1080 : 960\s*\}/);
    assert.match(client, /height:\s*\{\s*ideal:\s*documentCapture \? 1080 : 960\s*\}/);
    assert.match(registration, /documentCapture \? 16 \/ 9 : 4 \/ 3/);
    assert.match(client, /documentCapture \? 16 \/ 9 : 4 \/ 3/);
});


test("release gate keeps identity evidence user-reviewable before any biometric submit", () => {
    const client = fs.readFileSync(new URL("../panel-cliente.js", import.meta.url), "utf8");
    const clientHtml = fs.readFileSync(new URL("../cliente.html", import.meta.url), "utf8");
    const registration = fs.readFileSync(new URL("../app-registro.js", import.meta.url), "utf8");
    assert.match(clientHtml, /VERIFICAR MI IDENTIDAD/);
    assert.match(client, /clientIdentityVerifyReviewedButton/);
    assert.match(client, /showCustomerIdentityReview/);
    assert.match(client, /data-client-identity-remove/);
    assert.match(client, /data-client-identity-retake/);
    assert.match(registration, /USAR ESTAS CAPTURAS|showIdentityReview/);
    assert.match(registration, /data-identity-remove/);
    assert.match(registration, /data-identity-retake/);
});

// V142 coordinated B2C/B2B release authorization: complete recommended identity retakes before verify

// V142 coordinated release authorization: fresh rejected selfies plus active-liveness composition

// V142 coordinated release authorization: rejected recaptures remain audit-only until verified

// V142 coordinated release authorization: customer identity uses INE plus one frontal selfie

// V142 coordinated release authorization: customer and technician use INE plus frontal selfie

// V142 FINAL coordinated release: both B2C roles use INE front/reverse plus frontal selfie
