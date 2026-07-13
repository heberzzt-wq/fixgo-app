import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

test("login delegates authenticated routing to the central Firebase router", () => {
    const login = fs.readFileSync(path.join(root, "app-login.js"), "utf8");

    assert.match(login, /profile\.rol\s*\|\|\s*profile\.role/);
    assert.match(login, /\.toLowerCase\(\)\.trim\(\)/);
    assert.match(login, /FirebaseCore\.verificarYRedireccionar/);
    assert.doesNotMatch(login, /window\.location\.href\s*=\s*[\r\n\s]*"cliente\.html"/);
    assert.doesNotMatch(login, /window\.location\.href\s*=\s*[\r\n\s]*"tecnico\.html"/);
});

test("central router preserves privileged admin surfaces and role aliases", () => {
    const firebase = fs.readFileSync(path.join(root, "firebase.js"), "utf8");

    for (const surface of [
        "admin",
        "ceo",
        "gestia-terminal",
        "gestia-modulo",
        "noc"
    ]) {
        assert.match(firebase, new RegExp(`"${surface}"`));
    }

    assert.match(firebase, /if \(!isAdminSurface\)/);
    assert.match(firebase, /"admin_b2b", "b2b_admin", "asistente_admin"/);
    assert.match(firebase, /subType === "saas"/);
});
