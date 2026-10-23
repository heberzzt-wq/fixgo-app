// Read-only approval gate: this program never calls firebase deploy.
// Exact CI, GitHub identity and selected Hosting site must be proven before
// a separate, explicitly authorized live publication is attempted.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateDeployGate } from '../jarvis-deploy-gate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA = /^[a-f0-9]{40}$/;
const REPO = 'heberzzt-wq/fixgo-app';
const SITE = 'fixgo-44e4d';
const CI_NAME = 'V142 official CI certification';
const EXCLUDED = Object.freeze([
    'jarvis-fs-bridge.js', 'jarvis-upload-bridge.js',
    'jarvis-github-worker.js', 'jarvis-semantic-http.js',
    'jarvis-qwen-decision-http.js', 'jarvis-repo-intelligence.js',
    'jarvis-local-video-engine.js', 'jarvis-configured-sources.js',
    'jarvis-workstation-health.js'
]);
const cmd = (program, args, cwd = root) => execFileSync(program, args, {
    cwd, encoding:'utf8', timeout:30000, windowsHide:true,
    stdio:['ignore','pipe','pipe']
}).trim();

export function certifiedV142Run(run, expectedSha, jobs) {
    const found = run && run.headSha === expectedSha &&
        run.status === 'completed' && run.conclusion === 'success';
    if (!found || !Array.isArray(jobs)) return false;
    for (const name of ['Full CI / ubuntu-latest','Full CI / windows-latest']) {
        if (!jobs.some(job => job.name === name &&
            job.status === 'completed' && job.conclusion === 'success')) return false;
    }
    return true;
}

export function verifyHostingOnlyReleaseConfig(config, manifest, expectedSha) {
    if (manifest?.git_sha !== expectedSha) throw Error('RELEASE_MANIFEST_SHA_MISMATCH');
    const sites = (config?.hosting || []).filter(site => site.site === SITE);
    if (sites.length !== 1) throw Error('EXACT_HOSTING_SITE_REQUIRED');
    const ignore = sites[0]?.ignore;
    if (!Array.isArray(ignore) || EXCLUDED.some(file => !ignore.includes(file)))
        throw Error('PRIVATE_SERVER_FILES_NOT_EXCLUDED');
    // The config can contain another site, but the only permitted CLI target
    // remains hosting:fixgo-44e4d. This checker never deploys either site.
    return true;
}

export function evaluateManualV142Release({
    actor, gitBranch, gitSha, remoteSha, dirty, ownerApprovedSha, ciRun, ciJobs,
    config, manifest
} = {}) {
    if (gitBranch !== 'v142-official') throw Error('RELEASE_BRANCH_NOT_OFFICIAL');
    if (dirty) throw Error('RELEASE_WORKTREE_NOT_CLEAN');
    if (!SHA.test(gitSha || '') || gitSha !== remoteSha)
        throw Error('RELEASE_GIT_REMOTE_SHA_MISMATCH');
    verifyHostingOnlyReleaseConfig(config, manifest, gitSha);
    const ciPassed = certifiedV142Run(ciRun, gitSha, ciJobs);
    const gate = evaluateDeployGate({
        actor, eventName:'owner_manual_hosting', ref:'refs/heads/v142-official',
        commitSha:gitSha, projectId:'fixgo-44e4d', ciPassed,
        hostingOnly:true, siteId:SITE, manualApprovalSha:ownerApprovedSha
    });
    if (!gate.ok) throw Error('SOVEREIGN_DEPLOY_BLOCKED:'+gate.failures.join(','));
    return {ok:true,status:'V142_MANUAL_HOSTING_PREFLIGHT_APPROVED',
        releaseSha:gitSha,site:SITE,ciRunId:ciRun.databaseId,
        gateFingerprint:gate.fingerprint,hostingOnly:true,
        deploymentPerformed:false};
}

function main() {
    const i = process.argv.indexOf('--approve-sha');
    if (i < 0 || !SHA.test(String(process.argv[i + 1] || '')))
        throw Error('EXACT_OWNER_APPROVED_SHA_REQUIRED');
    if (process.argv.includes('--apply') || process.argv.includes('--deploy'))
        throw Error('THIS_PREFLIGHT_NEVER_DEPLOYS');
    const expected = process.argv[i+1];
    const actor = cmd('gh',['api','user','--jq','.login']);
    const gitBranch=cmd('git',['branch','--show-current']);
    const gitSha=cmd('git',['rev-parse','HEAD']);
    const remoteSha=cmd('git',['ls-remote','origin','refs/heads/v142-official']).split(/\s+/)[0];
    const dirty=Boolean(cmd('git',['status','--porcelain']));
    const list=JSON.parse(cmd('gh',['run','list','--repo',REPO,
        '--branch','v142-official','--workflow',CI_NAME,
        '--limit','25','--json','databaseId,headSha,status,conclusion']));
    const ciRun=list.find(run=>run.headSha === gitSha &&
        run.status === 'completed' && run.conclusion === 'success');
    if(!ciRun) throw Error('CI_EXACT_SHA_NOT_VERIFIED');
    const detail=JSON.parse(cmd('gh',['run','view',String(ciRun.databaseId),
        '--repo',REPO,'--json','jobs,headSha,status,conclusion']));
    const config=JSON.parse(fs.readFileSync(path.join(root,'firebase.release.json'),'utf8'));
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'release-manifest.json'),'utf8'));
    const report=evaluateManualV142Release({
        actor,gitBranch,gitSha,remoteSha,dirty,ownerApprovedSha:expected,
        ciRun,ciJobs:detail.jobs,config,manifest
    });
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try{main();}catch(error){
        process.stderr.write('V142_PREFLIGHT_BLOCKED:'+String(error?.message||error)+'\n');
        process.exitCode=1;
    }
}
