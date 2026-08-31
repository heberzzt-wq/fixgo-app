import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
execFileSync(process.execPath, [path.join(root, "scripts", "sync-b2c-platform-contract.mjs")], {
    cwd: root,
    stdio: "pipe"
});

const require = createRequire(import.meta.url);
await import(pathToFileURL(path.join(root, "gestia-core", "contracts", "b2c-platform-contract.js")).href);
const browserContract = globalThis.GestiaB2CPlatformContract;
const backendContract = require(path.join(root, "functions", "b2c-platform-contract.js"));

function documentRef(name) {
    return { storage_path: `expedientes/test/${name}/current.png` };
}

function approvedTechnician(overrides = {}) {
    return {
        rol: "tecnico",
        estado: "activo",
        status: "activo",
        disponible: true,
        kyc: { estado: "activo", aprobado: true },
        foto_perfil: documentRef("foto"),
        documentos: {
            ine: documentRef("ine"),
            csf: documentRef("csf"),
            licencia: documentRef("licencia"),
            certificados: []
        },
        datos_bancarios: {
            banco: "Banco de prueba",
            clabe: "012345678901234567",
            titular: "Tecnico E2E"
        },
        vehiculo: { tipo: "motocicleta", placas: "ABC123" },
        skills: ["FIX - PLOMERÍA"],
        ...overrides
    };
}

test("browser and Functions consume the same neutral authority", () => {
    assert.equal(browserContract.CONTRACT_VERSION, backendContract.CONTRACT_VERSION);
    const fixtures = [
        approvedTechnician(),
        approvedTechnician({ disponible: false }),
        approvedTechnician({ estado: "pendiente_revision", status: "pendiente_revision" }),
        approvedTechnician({ suspendido: true }),
        approvedTechnician({ documentos: { ine: null, csf: null, licencia: null, certificados: [] } }),
        {
            ...approvedTechnician({ vehiculo: undefined, kyc: undefined }),
            verificado: true,
            logistica: { vehiculo: "Motocicleta", placas: "LEG-123" },
            documentos: {
                ine: documentRef("ine"),
                csf: documentRef("csf"),
                licencia: documentRef("licencia"),
                certificado: documentRef("certificado")
            }
        }
    ];

    for (const fixture of fixtures) {
        assert.deepEqual(
            browserContract.technicianEligibility(fixture, { requireAvailable: true }),
            backendContract.technicianEligibility(fixture, { requireAvailable: true })
        );
    }
});

test("technician eligibility covers canonical, legacy, pending, suspended, incomplete, pedestrian and vehicle profiles", () => {
    assert.equal(browserContract.technicianEligibility(approvedTechnician()).ok, true);

    const legacy = approvedTechnician({ vehiculo: undefined, kyc: undefined });
    legacy.verificado = true;
    legacy.logistica = { vehiculo: "MOTOCICLETA", placas: "LEG-123" };
    assert.equal(browserContract.technicianEligibility(legacy).ok, true);
    assert.equal(browserContract.normalizeTechnicianProfile(legacy).vehiculo.placas, "LEG-123");

    assert.equal(
        browserContract.technicianEligibility(
            approvedTechnician({
                estado: "pendiente_revision",
                status: "pendiente_revision",
                kyc: { estado: "pendiente_revision", aprobado: false }
            })
        ).reason,
        "KYC_APPROVAL_REQUIRED"
    );
    assert.equal(
        browserContract.technicianEligibility(approvedTechnician({ suspendido: true })).reason,
        "TECHNICIAN_SUSPENDED"
    );
    assert.equal(
        browserContract.technicianEligibility(
            approvedTechnician({ documentos: { ine: null, csf: null, licencia: null, certificados: [] } })
        ).reason,
        "KYC_INCOMPLETE"
    );

    const pedestrian = approvedTechnician({
        vehiculo: { tipo: "Peatón", placas: "" },
        documentos: {
            ine: documentRef("ine"),
            csf: documentRef("csf"),
            licencia: null,
            certificados: []
        }
    });
    assert.equal(browserContract.technicianEligibility(pedestrian).ok, true);
    assert.equal(browserContract.technicianEligibility(approvedTechnician()).ok, true);
});

test("category and skill normalization resolves fix_plomeria without crossing verticals", () => {
    const variants = ["FIX PLOMERÍA", "fix-plomeria", "fix_plomeria", "  Plomero  "];
    for (const variant of variants) {
        assert.equal(browserContract.normalizeSkillKey(variant), "fix_plomeria");
    }
    const service = { categoria: "FIX", sub_servicio: "PLOMERÍA", categoria_id: "fix_plomeria" };
    assert.equal(browserContract.normalizeCategoryKey(service), "fix_plomeria");
    assert.equal(browserContract.isSkillCompatible({ skills: ["plomería"] }, service), true);
    assert.equal(browserContract.isSkillCompatible({ skills: ["road_plomeria"] }, service), false);
    assert.equal(browserContract.isSkillCompatible({ skills: ["fix"] }, service), false);
});

test("payment availability is the strict global and individual intersection", () => {
    const bothGlobal = { stripe_activo: true, efectivo_activo: true };
    assert.deepEqual(
        browserContract.resolvePaymentPermissions(bothGlobal, {
            pagos: { stripe_autorizado: true, efectivo_autorizado: false }
        }).allowed,
        ["stripe"]
    );
    assert.deepEqual(
        browserContract.resolvePaymentPermissions(bothGlobal, {
            pagos: { stripe_autorizado: false, efectivo_autorizado: true }
        }).allowed,
        ["efectivo"]
    );
    assert.deepEqual(
        browserContract.resolvePaymentPermissions(bothGlobal, {
            pagos: { stripe_autorizado: true, efectivo_autorizado: true }
        }).allowed,
        ["stripe", "efectivo"]
    );
    assert.deepEqual(browserContract.resolvePaymentPermissions(bothGlobal, {}).allowed, []);
    assert.deepEqual(
        browserContract.resolvePaymentPermissions(bothGlobal, { efectivo_autorizado: true }).allowed,
        ["efectivo"]
    );
    assert.deepEqual(
        browserContract.resolvePaymentPermissions(
            { stripe_activo: false, efectivo_activo: false },
            { pagos: { stripe_autorizado: true, efectivo_autorizado: true } }
        ).allowed,
        []
    );
    assert.equal(browserContract.assertPaymentMethodAllowed("stripe", bothGlobal, {}).ok, false);
});

test("one marketplace authority covers authorized cash and paid Stripe and removes ineligible states", () => {
    const base = {
        tipo: "b2c",
        estado: "pendiente",
        destino: {
            direccion: "Destino de prueba",
            coords: { lat: 21.1, lng: -86.8 },
            fuente: "mapa_pin",
            confirmado_por_cliente: true
        },
        payment_authority: { effective: true },
        categoria: "FIX",
        categoria_id: "fix_plomeria",
        sub_servicio: "PLOMERIA",
        zona: "Cancun"
    };
    assert.equal(browserContract.shouldPublishMarketplace({ ...base, metodo_pago: "efectivo" }), true);
    assert.equal(browserContract.shouldPublishMarketplace({ ...base, metodo_pago: "stripe" }), false);
    assert.equal(
        browserContract.shouldPublishMarketplace({ ...base, metodo_pago: "stripe", fecha_pago: "now" }),
        true
    );
    assert.equal(
        browserContract.shouldPublishMarketplace({ ...base, metodo_pago: "efectivo", estado: "asignado" }),
        false
    );
    assert.equal(
        browserContract.shouldPublishMarketplace({ ...base, metodo_pago: "efectivo", payment_authority: { effective: false } }),
        false
    );
    const listing = browserContract.buildMarketplaceListing("svc_1", { ...base, metodo_pago: "efectivo" });
    assert.deepEqual(Object.keys(listing).sort(), [
        "categoria",
        "categoria_id",
        "created_at",
        "es_privada",
        "estado",
        "metodo_pago",
        "service_id",
        "sub_servicio",
        "tipo",
        "urgencia",
        "zona"
    ]);
});

test("service transition authority rejects skipped or parallel legacy states", () => {
    const states = browserContract.SERVICE_STATES;
    assert.equal(browserContract.isServiceTransitionAllowed(states.STRIPE_STARTED, states.PENDING), true);
    assert.equal(browserContract.isServiceTransitionAllowed(states.PENDING, states.ASSIGNED), true);
    assert.equal(browserContract.isServiceTransitionAllowed(states.ASSIGNED, states.EN_ROUTE), true);
    assert.equal(browserContract.isServiceTransitionAllowed(states.EN_ROUTE, states.ON_SITE), true);
    assert.equal(browserContract.isServiceTransitionAllowed(states.ON_SITE, states.QUOTING), true);
    assert.equal(browserContract.isServiceTransitionAllowed(states.QUOTING, states.WORKING), true);
    assert.equal(browserContract.isServiceTransitionAllowed(states.WORKING, states.COMPLETED), true);
    assert.equal(browserContract.isServiceTransitionAllowed(states.PENDING, states.WORKING), false);
    assert.equal(browserContract.isServiceTransitionAllowed(states.ON_SITE, "diagnosticando"), false);
});

test("destination authority requires a confirmed address or coordinates", () => {
    assert.equal(browserContract.normalizeDestination({
        fuente: "mapa_pin",
        confirmado_por_cliente: true
    }), null);
    assert.deepEqual(browserContract.normalizeDestination({
        fuente: "GPS dispositivo",
        confirmado_por_cliente: true,
        coords: { latitude: 21.1, longitude: -86.8 }
    })?.coords, { lat: 21.1, lng: -86.8 });
});

test("active canonical profile without approval evidence requires migration review", () => {
    const raw = approvedTechnician({ kyc: { estado: "activo", aprobado: false } });
    delete raw.verificado;
    delete raw.aprobadoEn;
    assert.equal(browserContract.technicianMigration(raw).classification, "requires_review");
});
