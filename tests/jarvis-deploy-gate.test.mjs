import test from "node:test";
import assert from "node:assert/strict";

import { evaluateDeployGate } from "../jarvis-deploy-gate.js";

const valid = {
    actor: "heberzzt-wq",
    eventName: "push",
    ref: "refs/heads/v5.9-polish",
    commitSha: "70378b26d94bd25077f660888622fe3f1f8c572a",
    projectId: "fixgo-44e4d",
    ciPassed: true
};

test("deploy gate binds Heberto, CI, branch, project and one exact commit", () => {
    const result = evaluateDeployGate(valid);
    assert.equal(result.ok, true);
    assert.equal(result.status, "SOVEREIGN_DEPLOY_AUTHORIZED");
    assert.equal(result.authorityId, "HEBERTO_MENDOZA");
    assert.equal(result.fingerprint.length, 64);
    assert.equal(result.selfAuthorizationAllowed, false);
    assert.equal(evaluateDeployGate(valid).fingerprint, result.fingerprint);
});

test("deploy gate fails closed for a different actor, branch, event, commit or missing CI", () => {
    const result = evaluateDeployGate({ ...valid, actor: "automation-bot", eventName: "workflow_dispatch", ref: "refs/heads/feature", commitSha: "bad", ciPassed: false });
    assert.equal(result.ok, false);
    assert.deepEqual(result.failures, ["SOVEREIGN_ACTOR_MISMATCH", "DEPLOY_EVENT_NOT_PUSH", "DEPLOY_BRANCH_NOT_ALLOWED", "DEPLOY_COMMIT_SHA_INVALID", "DEPLOY_CI_NOT_VERIFIED"]);
});

test("isolated V94 branch is authorized only for explicit Hosting-only scope", () => {
    const isolated = {
        ...valid,
        ref: "refs/heads/v94-media-v4n-negative-claims"
    };

    const blocked = evaluateDeployGate(isolated);
    assert.equal(blocked.ok, false);
    assert.deepEqual(blocked.failures, ["ISOLATED_BRANCH_HOSTING_ONLY_REQUIRED"]);
    assert.equal(blocked.hostingOnlyRequired, true);

    const hosting = evaluateDeployGate({
        ...isolated,
        hostingOnly: true
    });
    assert.equal(hosting.ok, true);
    assert.equal(hosting.status, "SOVEREIGN_DEPLOY_AUTHORIZED");
    assert.equal(hosting.deploymentScope, "hosting");
    assert.equal(hosting.envelope.hostingOnly, true);
});

test("Hosting-only flag never authorizes an unrelated feature branch", () => {
    const result = evaluateDeployGate({
        ...valid,
        ref: "refs/heads/feature/not-authorized",
        hostingOnly: true
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.failures, ["DEPLOY_BRANCH_NOT_ALLOWED"]);
});

const v142 = {
    ...valid,
    eventName: 'owner_manual_hosting',
    ref: 'refs/heads/v142-official',
    hostingOnly: true,
    siteId: 'fixgo-44e4d',
    manualApprovalSha: valid.commitSha
};

test("V142 permits only exact owner-approved SHA, manual event, certified CI and site", () => {
    const granted = evaluateDeployGate(v142);
    assert.equal(granted.ok, true);
    assert.equal(granted.deploymentScope, "hosting");
    assert.equal(granted.envelope.siteId, "fixgo-44e4d");
    assert.equal(granted.envelope.manualApprovalSha, valid.commitSha);
    for (const patch of [
        { actor: 'automation-bot' },
        { eventName: 'push' },
        { eventName: 'workflow_dispatch' },
        { ref: 'refs/heads/feature/v142' },
        { hostingOnly: false },
        { siteId: 'multiservicios' },
        { siteId: 'fixgo-44e4d,functions' },
        { manualApprovalSha: '' },
        { manualApprovalSha: 'f'.repeat(40) },
        { ciPassed: false },
        { projectId: 'not-fixgo' },
        { commitSha: 'invalid' }
    ]) {
        const decision = evaluateDeployGate({ ...v142, ...patch });
        assert.equal(decision.ok, false, JSON.stringify(patch));
    }
});

test("manual authorization for V142 does not change legacy push branches", () => {
    assert.equal(evaluateDeployGate(valid).ok, true);
    assert.equal(evaluateDeployGate({ ...valid, ref: 'refs/heads/v94-media-v4n-negative-claims', hostingOnly: true }).ok, true);
    assert.equal(evaluateDeployGate({ ...valid, ref: 'refs/heads/v142-official', hostingOnly: true }).ok, false);
    assert.equal(evaluateDeployGate({ ...v142, ref: 'refs/heads/main' }).ok, false);
});

test("manual preflight requires two successful OS jobs, exact SHA and safe Hosting config",async()=>{
    const {certifiedV142Run, verifyHostingOnlyReleaseConfig, evaluateManualV142Release} =
        await import('../scripts/v142-hosting-manual-preflight.mjs');
    const sha=valid.commitSha;
    const run={databaseId:123,headSha:sha,status:'completed',conclusion:'success'};
    const jobs=['ubuntu-latest','windows-latest'].map(os=>({
        name:'Full CI / '+os,status:'completed',conclusion:'success'
    }));
    assert.equal(certifiedV142Run(run,sha,jobs),true);
    assert.equal(certifiedV142Run({...run,headSha:'f'.repeat(40)},sha,jobs),false);
    assert.equal(certifiedV142Run(run,sha,jobs.slice(0,1)),false);
    assert.equal(certifiedV142Run(run,sha,[{...jobs[0],conclusion:'failure'},jobs[1]]),false);
    const files=['jarvis-fs-bridge.js','jarvis-upload-bridge.js','jarvis-github-worker.js',
        'jarvis-semantic-http.js','jarvis-qwen-decision-http.js','jarvis-repo-intelligence.js',
        'jarvis-local-video-engine.js','jarvis-configured-sources.js','jarvis-workstation-health.js'];
    const config={hosting:[{site:'fixgo-44e4d',ignore:files},{target:'multiservicios',ignore:[]}]};
    const manifest={git_sha:sha};
    assert.equal(verifyHostingOnlyReleaseConfig(config,manifest,sha),true);
    assert.throws(()=>verifyHostingOnlyReleaseConfig(config,{git_sha:'f'.repeat(40)},sha),/MISMATCH/);
    assert.throws(()=>verifyHostingOnlyReleaseConfig({hosting:[{site:'fixgo-44e4d',ignore:files.slice(1)}]},manifest,sha),/NOT_EXCLUDED/);
    const args={actor:'heberzzt-wq',gitBranch:'v142-official',gitSha:sha,
        remoteSha:sha,dirty:false,ownerApprovedSha:sha,ciRun:run,ciJobs:jobs,config,manifest};
    const result=evaluateManualV142Release(args);
    assert.equal(result.ok,true);
    assert.equal(result.deploymentPerformed,false);
    assert.equal(result.site,'fixgo-44e4d');
    for(const patch of [
        {actor:'someone-else'},{gitBranch:'main'},{remoteSha:'f'.repeat(40)},
        {dirty:true},{ownerApprovedSha:'f'.repeat(40)},
        {ciJobs:jobs.slice(0,1)},{ciRun:{...run,conclusion:'failure'}},
        {config:{hosting:[{site:'multiservicios',ignore:[]}]}}
    ]) assert.throws(()=>evaluateManualV142Release({...args,...patch}));
});
