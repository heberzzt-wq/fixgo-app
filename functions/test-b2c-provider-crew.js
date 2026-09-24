"use strict";

const assert = require("node:assert/strict");
const {
    subjectKey,
    verifyEvidence
} = require("./b2c-provider-crew");

(async () => {
    const first = subjectKey("provider-1", "member-1");
    const replay = subjectKey("provider-1", "member-1");
    const other = subjectKey("provider-1", "member-2");
    assert.match(first, /^crew_[a-f0-9]{48}$/);
    assert.equal(first, replay);
    assert.notEqual(first, other);

    const metadata = {
        generation: "7",
        contentType: "image/jpeg",
        size: "4096",
        md5Hash: "hash",
        metadata: { firebaseStorageDownloadTokens: "token-1" }
    };
    const bucket = {
        name: "fixgo-44e4d.firebasestorage.app",
        file(path) {
            return {
                async getMetadata() {
                    assert.equal(path, "expedientes/provider-1/crew/member-12345678/ine_front/capture-12345678.jpg");
                    return [metadata];
                }
            };
        }
    };
    const evidence = await verifyEvidence(
        bucket,
        "provider-1",
        "member-12345678",
        "ine_front",
        "expedientes/provider-1/crew/member-12345678/ine_front/capture-12345678.jpg"
    );
    assert.equal(evidence.generation, "7");
    assert.equal(evidence.content_type, "image/jpeg");
    assert.match(evidence.url, /^https:\/\/firebasestorage\.googleapis\.com\//);

    await assert.rejects(
        verifyEvidence(bucket, "provider-1", "member-12345678", "ine_front",
            "expedientes/other/crew/member-12345678/ine_front/capture-12345678.jpg"),
        /CREW_EVIDENCE_PATH_INVALID/
    );
    console.log("PASS b2c-provider-crew");
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
