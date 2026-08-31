"use strict";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
let identity = null;

try {
    identity = require("./generated/release-identity.cjs");
} catch (_error) {
    identity = {
        git_sha: process.env.GESTIA_RELEASE_SHA || "UNPREPARED",
        prepared: false
    };
}

function getReleaseIdentity() {
    const gitSha = String(identity?.git_sha || "");
    return Object.freeze({
        ...identity,
        git_sha: gitSha,
        prepared: identity?.prepared === true && SHA_PATTERN.test(gitSha)
    });
}

module.exports = { getReleaseIdentity, SHA_PATTERN };
