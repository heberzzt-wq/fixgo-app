# V139 reviewed Functions baseline

Both certification jobs use `.github/scripts/v139-functions-guard.mjs` and the
explicit baseline `7f50f7d306f789a8dbde355435895b8d54abb872`. This is the integrated
branch HEAD before this workflow-only repair, not a dynamically accepted HEAD.
Platform CI run https://github.com/heberzzt-wq/fixgo-app/actions/runs/38281211531
passed at that exact SHA. This accepts already integrated Functions history;
it does **not** certify the canonical real reel or the unfinished local planner work.

## Why the previous base stopped working

The original August workflow isolated a frontend/bridge reel change from Functions
changes. Commit `36b13c88f74d5504384f203b58a928c896ea99db` explicitly rebased the
guard to an accepted head. Commit `78f2dd6e1984d1ccc392bae961d70238ad20484e`
advanced only Windows to `dbe0a94b660008d4620f9ce4726ca66b2a5db555`, a September 17
workflow commit restoring dispatch-only certification. It was a frozen accepted
branch snapshot, not a Functions dependency or immutable reel contract. Linux
subsequently retained `45c9231715ad1d8f50756328c6e4128deebba581` instead.
Both historical comparisons eventually rejected legitimate integrated evolution.
Run https://github.com/heberzzt-wq/fixgo-app/actions/runs/38101666190 failed at the
Windows guard and never ran the real mission or its marker.

## Exact Functions changes from the Windows base to the reviewed HEAD

`git diff --name-status dbe0a94b660008d4620f9ce4726ca66b2a5db555..7f50f7d306f789a8dbde355435895b8d54abb872 -- functions/`
returns these 26 paths (A = added, M = modified):

| Status | Path |
| --- | --- |
| A | functions/b2b-personnel-kyc.js |
| A | functions/b2c-biometric-identity.js |
| M | functions/b2c-financial-policy.js |
| M | functions/b2c-platform-authority.js |
| A | functions/b2c-provider-crew.js |
| M | functions/b2c-service-marketplace.js |
| M | functions/b2c-service-settlement.js |
| M | functions/b2c-service-workflow.js |
| M | functions/b2c-technician-approval.js |
| M | functions/generated/b2c-platform-contract.cjs |
| M | functions/index.js |
| M | functions/jarvis-intent-runtime-v7.cjs |
| M | functions/jarvis-semantic-planner.js |
| A | functions/legacy-security-hotfix.js |
| M | functions/package-lock.json |
| M | functions/package.json |
| M | functions/repo-semantic-tool-planner.js |
| M | functions/secure-entry-alias.js |
| M | functions/secure-entry.js |
| M | functions/test-b2c-financial-policy.js |
| A | functions/test-b2c-panel-recovery.cjs |
| M | functions/test-b2c-platform-authority.js |
| A | functions/test-b2c-provider-crew.js |
| M | functions/test-b2c-service-marketplace.js |
| M | functions/test-b2c-service-settlement.js |
| A | functions/test-b2c-workflow-forensic.cjs |

Personnel, identity, crew, financial/service authorization and their tests belong
to integrated B2B/B2C functionality, not a new change introduced by this reel
certification. The generated platform contract follows that platform evolution.
Package additions include the biometric Human/TensorFlow/JPEG dependencies.
Secure entry and its aliases retire historical independent generator/withdrawal
authority and route callers to canonical security handlers.

The semantic planner and repository planner **are relevant to reel behavior**:
they must not be declared harmless merely because their changes are legitimate.
`index.js` and `jarvis-intent-runtime-v7.cjs` also retire cloud semantic authority
in favor of local-only Jarvis. The canonical script imports the semantic planner
directly and still constructs a Google/Vertex provider. Thus compatibility with
the current local-only policy, provider credentials, media generation and the
actual reel result remain subject to the real mission, not this guard.

The baseline deliberately includes this integrated history without reverting it.
It does not exempt any file from future review: **all** committed Functions
additions, removals, renames and modifications after the baseline still fail.
Any future legitimate Functions release needs an explicit reviewed baseline
advance with corresponding CI evidence; never substitute HEAD/event-before
automatically. A missing baseline, non-ancestor baseline, Git error, wrong branch,
or tracked/untracked Functions worktree change fails closed as well. Ignored
installed dependencies do not count as source changes.

## Certification and execution boundaries

The job conditions, canonical same-step bridge/mission, Windows marker, Linux
`certify-v139`, dependency installation and all existing tests remain unchanged.
No marker runs after a failed guard or mission. The repair introduces no
`continue-on-error` or equivalent suppression. Both jobs now verify the same base
and use explicit Git exit statuses, avoiding the old Bash negated-pipeline gap.

The Windows canonical script uses Google/Vertex and a Runpod remote video adapter.
Running it is an external-provider exercise, not certification of the workstation's
single local Qwen model. Publishing this workflow on the configured branch triggers
that Windows job automatically. Do not describe its success as a local Qwen mission
or start it under an instruction prohibiting external AI API usage.
