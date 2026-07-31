import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function pass(message) {
    console.log(`✅ ${message}`);
}

function fail(message) {
    console.error(`❌ ${message}`);
    process.exitCode = 1;
}

function requireIncludes(content, marker, description) {
    if (content.includes(marker)) pass(description);
    else fail(`${description}: falta ${marker}`);
}

function requireExcludes(content, marker, description) {
    if (content.includes(marker)) fail(`${description}: contiene ${marker}`);
    else pass(description);
}

function stripCommentsAndStrings(source) {
    let output = "";
    let index = 0;
    let state = "code";
    let quote = null;

    while (index < source.length) {
        const current = source[index];
        const next = source[index + 1];

        if (state === "line-comment") {
            if (current === "\n") {
                output += "\n";
                state = "code";
            }
            index += 1;
            continue;
        }

        if (state === "block-comment") {
            if (current === "*" && next === "/") {
                state = "code";
                index += 2;
                continue;
            }
            if (current === "\n") output += "\n";
            index += 1;
            continue;
        }

        if (state === "string") {
            if (current === "\\") {
                index += next === undefined ? 1 : 2;
                continue;
            }
            if (current === quote) {
                state = "code";
                quote = null;
            }
            index += 1;
            continue;
        }

        if (current === "/" && next === "/") {
            state = "line-comment";
            index += 2;
            continue;
        }

        if (current === "/" && next === "*") {
            state = "block-comment";
            index += 2;
            continue;
        }

        if (current === '"' || current === "'" || current === "`") {
            state = "string";
            quote = current;
            index += 1;
            continue;
        }

        output += current;
        index += 1;
    }

    return output;
}

const files = {
    module: "b2c-admin-evidence-review.js",
    appPanel: "app-panel.js",
    firestoreFragment: "security/b2c-evidence-firestore.fragment.rules.txt",
    firebaseConfig: "firebase.json"
};

for (const relativePath of Object.values(files)) {
    if (!fs.existsSync(path.join(root, relativePath))) {
        fail(`Falta ${relativePath}`);
    } else {
        pass(`Existe ${relativePath}`);
    }
}

if (process.exitCode) process.exit(process.exitCode);

const moduleSource = read(files.module);
const executable = stripCommentsAndStrings(moduleSource);
const appPanel = read(files.appPanel);
const firestoreFragment = read(files.firestoreFragment);
const firebaseConfig = JSON.parse(read(files.firebaseConfig));

requireIncludes(
    appPanel,
    'import { instalarRevisionAdministrativaB2C } from "./b2c-admin-evidence-review.js";',
    "app-panel importa la bandeja administrativa"
);
requireIncludes(
    appPanel,
    "instalarRevisionAdministrativaB2C(user);",
    "app-panel activa la bandeja solo desde el panel admin"
);
requireIncludes(
    moduleSource,
    'const MASTER_ADMIN_UID = "nNhwy3Mx4pTvc8TZVh1tyTMFwhC2";',
    "La bandeja conserva la autoridad UID maestra"
);
requireIncludes(
    moduleSource,
    'const MASTER_ADMIN_EMAIL = "hebertoh-m@hotmail.com";',
    "La bandeja conserva el correo maestro"
);
requireIncludes(
    moduleSource,
    'collection(db, "services", serviceId, "admin_reviews")',
    "Cada decisión crea auditoría por folio"
);
requireIncludes(
    moduleSource,
    "b2c_financial_hold",
    "Las decisiones activan hold financiero"
);
requireIncludes(
    moduleSource,
    "funds_moved: false",
    "La auditoría declara fondos no movidos"
);
requireIncludes(
    moduleSource,
    "automatic_financial_action: false",
    "La auditoría bloquea acción financiera automática"
);
requireIncludes(
    moduleSource,
    "requires_separate_financial_authorization: true",
    "La ejecución financiera exige autorización separada"
);
requireIncludes(
    moduleSource,
    "crew_snapshot",
    "La bandeja está preparada para cuadrillas"
);
requireIncludes(
    moduleSource,
    "single_technician_legacy",
    "La bandeja identifica servicios legacy de un solo responsable"
);

for (const [marker, description] of [
    ["increment(", "No incrementa saldos"],
    ["updateDoc(", "No usa actualizaciones financieras directas"],
    ["addDoc(", "No crea transacciones financieras legacy"],
    ["stripe", "No invoca Stripe"],
    ["paymentintent", "No captura PaymentIntent"],
    ["refund(", "No ejecuta reembolsos"],
    ["transfer(", "No ejecuta transferencias"],
    ["saldo_tecnico", "No modifica saldo técnico"],
    ["saldo_pendiente", "No modifica saldo pendiente"],
    ["deuda_tecnico", "No modifica deuda técnica"]
]) {
    requireExcludes(executable.toLowerCase(), marker.toLowerCase(), description);
}

requireIncludes(
    firestoreFragment,
    "match /admin_reviews/{reviewId}",
    "Fragmento Firestore cubre revisiones administrativas"
);
requireIncludes(
    firestoreFragment,
    "request.resource.data.reviewer_uid == request.auth.uid",
    "La revisión debe pertenecer al administrador autenticado"
);
requireIncludes(
    firestoreFragment,
    "request.resource.data.funds_moved == false",
    "Las reglas exigen fondos no movidos"
);
requireIncludes(
    firestoreFragment,
    "request.resource.data.automatic_financial_action == false",
    "Las reglas prohíben acción financiera automática"
);
requireIncludes(
    firestoreFragment,
    "request.resource.data.requires_separate_financial_authorization == true",
    "Las reglas exigen autorización financiera separada"
);
requireIncludes(
    firestoreFragment,
    "allow update, delete: if false;",
    "La auditoría administrativa es append-only"
);

if (Object.prototype.hasOwnProperty.call(firebaseConfig, "firestore")) {
    fail("firebase.json enlaza reglas Firestore sin autorización de publicación.");
} else {
    pass("firebase.json no publica reglas Firestore accidentalmente.");
}

if (!process.exitCode) {
    console.log(
        "\n🛡️ B2C ADMIN REVIEW CHECK: PASS — decisiones operativas auditadas, " +
        "financial_hold activo y cero movimientos de dinero."
    );
}
