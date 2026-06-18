"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const repoWriteAuthFactory = require("../functions/repo-write-auth");
const {
    describeRepoSyntaxValidator,
    validateRepoWriteSyntax
} = require("../functions/repo-syntax-validator");

function makeAuthGate(decodedToken) {
    const admin = {
        auth() {
            return {
                async verifyIdToken() {
                    return decodedToken;
                }
            };
        }
    };

    const db = {
        collection() {
            return {
                doc() {
                    return {
                        async get() {
                            return {
                                exists: false,
                                data: () => ({})
                            };
                        }
                    };
                }
            };
        }
    };

    return repoWriteAuthFactory({
        admin,
        db
    });
}

test("repo write auth V2 describes private owner full repo policy", () => {
    const gate =
        makeAuthGate({
            uid: "u1",
            role: "owner"
        });

    const description =
        gate.describeRepoWriteAuthorityGate();

    assert.equal(description.ok, true);
    assert.equal(description.version, "2.0.0-private-owner-gate");
    assert.equal(description.policy.authority, "full_repo_private_owner");
    assert.equal(description.policy.safeZone, "advisory");
    assert.ok(description.policy.allowedRoles.includes("owner"));
});

test("repo write auth V2 blocks missing bearer token with contract metadata", async () => {
    const gate =
        makeAuthGate({
            uid: "u1",
            role: "owner"
        });

    const result =
        await gate.authorizeRepoWriteRequest({
            headers: {}
        });

    assert.equal(result.ok, false);
    assert.equal(result.authorized, false);
    assert.equal(result.httpStatus, 401);
    assert.equal(result.version, "2.0.0-private-owner-gate");
    assert.equal(result.policy.failureMode, "closed");
});

test("repo write auth V2 allows owner role", async () => {
    const gate =
        makeAuthGate({
            uid: "owner-uid",
            role: "owner",
            email: "owner@example.test"
        });

    const result =
        await gate.authorizeRepoWriteRequest({
            headers: {
                authorization: "Bearer valid"
            }
        });

    assert.equal(result.ok, true);
    assert.equal(result.authorized, true);
    assert.equal(result.role, "owner");
    assert.equal(result.version, "2.0.0-private-owner-gate");
});

test("repo syntax validator V2 validates JS and blocks empty content", () => {
    const description =
        describeRepoSyntaxValidator();

    assert.equal(description.ok, true);
    assert.equal(description.validatorVersion, "2.0.0-server-repo-write");
    assert.equal(description.policy.executesReceivedCode, false);

    const valid =
        validateRepoWriteSyntax({
            file: "gestia-core/example.js",
            content: "export const ok = true;\n"
        });

    assert.equal(valid.ok, true);
    assert.equal(valid.validatorVersion, "2.0.0-server-repo-write");
    assert.equal(valid.sourceType, "module");

    const empty =
        validateRepoWriteSyntax({
            file: "gestia-core/empty.js",
            content: "   "
        });

    assert.equal(empty.ok, false);
    assert.equal(empty.reason, "EMPTY_CONTENT_BLOCKED");

    const skipped =
        validateRepoWriteSyntax({
            file: "index.html",
            content: "<main></main>"
        });

    assert.equal(skipped.ok, true);
    assert.equal(skipped.status, "skipped");
});
