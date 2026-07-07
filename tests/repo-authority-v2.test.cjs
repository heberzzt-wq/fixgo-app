"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const repoWriteAuthFactory = require("../functions/repo-write-auth");
const {
    describeRepoSyntaxValidator,
    validateRepoWriteSyntax
} = require("../functions/repo-syntax-validator");

const {
    normalizeSemanticToolPlan
} = require("../functions/repo-semantic-tool-planner");

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

test("semantic tool planner keeps repo plans read-only and filters unsafe tools", () => {
    const plan =
        normalizeSemanticToolPlan(
            {
                intent: "REPO_INVESTIGATION",
                objective: "Find terminal render path",
                confidence: 0.91,
                toolCalls: [
                    {
                        name: "repo.grep",
                        args: {
                            term: "render terminal",
                            maxMatches: 80,
                            nested: {
                                drop: true
                            }
                        }
                    },
                    {
                        name: "repo.write",
                        args: {
                            file: "gestia-terminal.html",
                            content: "bad"
                        }
                    },
                    {
                        name: "tests.run",
                        args: {
                            command: "ci:test"
                        }
                    },
                    {
                        name: "repo.read",
                        args: {
                            file: "gestia-terminal.html",
                            maxBytes: 300000
                        }
                    }
                ]
            },
            {
                fallbackObjective: "fallback"
            }
        );

    assert.equal(plan.intent, "REPO_INVESTIGATION");
    assert.equal(plan.writeAllowed, false);
    assert.equal(plan.requiresApprovalForWrite, true);
    assert.deepEqual(
        plan.toolCalls.map(call => call.name),
        [
            "repo.grep",
            "repo.read"
        ]
    );
    assert.equal(plan.toolCalls[0].mutates, false);
    assert.equal(plan.toolCalls[0].approved, false);
    assert.equal(plan.toolCalls[0].args.term, "render terminal");
    assert.equal(plan.toolCalls[0].args.nested, undefined);
});

test("semantic tool planner replaces audit-only plans with focused discovery", () => {
    const plan =
        normalizeSemanticToolPlan(
            {
                intent: "REPO_INVESTIGATION",
                objective: "Jarvis, las tarjetas ocupan mucho espacio en movil, revisa donde esta el problema sin modificar nada.",
                confidence: 0.88,
                toolCalls: [
                    {
                        name: "repo.audit",
                        args: {}
                    }
                ]
            },
            {
                fallbackObjective: "fallback",
                maxToolCalls: 4
            }
        );

    assert.equal(plan.intent, "REPO_INVESTIGATION");
    assert.equal(plan.writeAllowed, false);
    assert.equal(plan.requiresApprovalForWrite, true);
    assert.equal(
        plan.toolCalls.some(call => call.name === "repo.audit"),
        false
    );
    assert.deepEqual(
        plan.toolCalls.map(call => call.name).slice(0, 2),
        [
            "repo.search",
            "repo.grep"
        ]
    );
    assert.equal(plan.toolCalls[0].args.term, "tarjetas");
    assert.equal(plan.toolCalls[1].args.term, "tarjetas");
    assert.equal(plan.toolCalls[0].mutates, false);
    assert.equal(plan.toolCalls[0].approved, false);
});

test("semantic tool planner replaces scan-only plans with focused discovery", () => {
    const plan =
        normalizeSemanticToolPlan(
            {
                intent: "REPO_INVESTIGATION",
                objective: "Checa que parte del repo toca el render del terminal",
                toolCalls: [
                    {
                        name: "repo.scan",
                        args: {}
                    }
                ]
            },
            {
                fallbackObjective: "fallback",
                maxToolCalls: 3
            }
        );

    assert.deepEqual(
        plan.toolCalls.map(call => call.name),
        [
            "repo.search",
            "repo.grep",
            "repo.grep"
        ]
    );
    assert.equal(plan.toolCalls[0].args.term, "render");
    assert.equal(plan.toolCalls[1].args.term, "render");
});

test("semantic tool planner falls back to general response without tool calls", () => {
    const plan =
        normalizeSemanticToolPlan(
            {
                objective: "",
                toolCalls: [
                    {
                        name: "repo.write",
                        args: {
                            file: "x.js"
                        }
                    }
                ]
            },
            {
                fallbackObjective: "hello"
            }
        );

    assert.equal(plan.intent, "GENERAL_RESPONSE");
    assert.equal(plan.objective, "hello");
    assert.deepEqual(plan.toolCalls, []);
    assert.equal(plan.writeAllowed, false);
    assert.equal(plan.requiresApprovalForWrite, true);
});
