import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
    resolveGestiaRole,
    resolveGestiaRouteDecision
} from "../gestia-core/auth/role-authority.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

test("login delegates authenticated routing to the central Firebase router", () => {
    const login = fs.readFileSync(path.join(root, "app-login.js"), "utf8");

    assert.match(login, /resolveGestiaRole\([\s\S]*?user,[\s\S]*?profile/);
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
        const result = resolveGestiaRouteDecision({
            user: { rol: "admin" },
            pathname: `/${surface}.html`
        });
        assert.equal(result.redirect, false, `${surface} must remain an admin surface`);
    }

    assert.equal(resolveGestiaRole({}, { role: " TECNICO " }).role, "tecnico");
    assert.equal(resolveGestiaRole({}, { rol: "admin_b2b" }).role, "b2b_admin");
    assert.equal(resolveGestiaRole({}, { rol: "asistente_admin" }).role, "b2b_admin");
    assert.equal(
        resolveGestiaRouteDecision({
            user: { rol: "cliente", sub_type: "saas" },
            pathname: "/login.html"
        }).target,
        "app-inquilino.html"
    );
    assert.match(firebase, /resolveGestiaRouteDecision/);
});
