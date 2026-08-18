import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("master Firebase identity is the primary client authority", () => {
    const roleAuthority = read("gestia-core/auth/role-authority.js");

    assert.match(roleAuthority, /GESTIA_MASTER_EMAIL\s*=\s*[\r\n\s]*"hebertoh-m@hotmail\.com"/);
    assert.match(roleAuthority, /export function isGestiaMasterIdentity/);
    assert.match(roleAuthority, /master_authenticated_email_is_primary_authority/);
    assert.match(roleAuthority, /master_identity_precedes_profile_and_claims/);
});

test("Firebase auth short-circuits master session before Firestore profile lookup", () => {
    const firebase = read("firebase.js");
    const masterIndex = firebase.indexOf("if (isGestiaMasterIdentity(user))");
    const profileIndex = firebase.indexOf('getDoc(doc(db, "users", user.uid))');

    assert.ok(masterIndex >= 0, "master Firebase session branch must exist");
    assert.ok(profileIndex > masterIndex, "master session must resolve before profile lookup");
    assert.match(firebase, /callback\(user\);[\s\S]*?return;/);
});

test("tenant authority grants sovereign session from authenticated master email without admin claim", () => {
    const authority = read("gestia-core/core_auth_tenant_v1.js");

    assert.match(authority, /const isMasterEmail = isGestiaMasterIdentity\(user\);/);
    assert.match(authority, /const isAdminClaim = tokenResult\.claims\.admin === true;/);
    assert.match(authority, /const isGod = isMasterEmail \|\| isAdminClaim;/);
    assert.match(authority, /authoritySource[\s\S]*?master_authenticated_email/);
    assert.doesNotMatch(authority, /Se ha erradicado el bypass de email/);
});

test("master authority still requires a real Firebase session and signed token", () => {
    const authority = read("gestia-core/core_auth_tenant_v1.js");
    const firewall = read("gestia-core/firewall.engine.js");

    assert.match(authority, /if \(!user\)[\s\S]*?AUTH_REQUIRED/);
    assert.match(authority, /await user\.getIdTokenResult\(options\.forceRefresh\)/);
    assert.match(firewall, /if \(!authToken\)[\s\S]*?AUTH_TOKEN_REQUIRED/);
});

test("server planner contract already recognizes authenticated master email", () => {
    const server = read("functions/index.js");

    assert.match(server, /if \(!context\.auth\?\.uid\)/);
    assert.match(server, /context\.auth\.token\?\.email/);
    assert.match(server, /email !== "hebertoh-m@hotmail\.com"/);
    assert.match(server, /role !== "admin"/);
});
