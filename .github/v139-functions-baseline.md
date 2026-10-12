# V139 reviewed Functions baseline

Current baseline: `a852d49744bf9989f5ea57dc3af3b535aa619362`, the locally verified operational objective isolation release.
This explicit advance admits only the committed planner/runtime regression fixes, including mission context for source selection while operational audits exclude sibling goals and assistant summaries;
it does not accept unfinished working-tree changes or certify a real mission.
The baseline remains pinned, ancestor-checked and enforced against every future
Functions change. Local full-suite and fresh focal checks passed; the workstation
embedding check and Linux-only browser check are verified separately before closure.

## Initial workflow repair baseline

The initial workflow repair used `.github/scripts/v139-functions-guard.mjs` and the
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

The main workflow now runs `certify-v139` on push or manual dispatch, without
external credentials or a live provider call. All its existing syntax, focal,
business and full-CI checks remain; guard regressions are also run explicitly.
Its marker identifies local **compatibility tests only**, not an Ollama end-to-end
mission. This change neither installs nor selects another semantic model.

The former Windows job is retained in
`.github/workflows/v139-legacy-external-reel.yml`, with the same bridge/canonical
mission step and Windows certification marker. Its only trigger is manual
`workflow_dispatch`, gated by `authorize_paid_external_reel == true`; the boolean
input defaults to false and explicitly warns about Google/Vertex and Runpod usage
and potential charges. There is no push, schedule, workflow-call or downstream-run
trigger. No historical external mission is authorized or executed for this repair.
No marker executes following a guard or mission failure. Neither workflow suppresses
failures with `continue-on-error` or equivalent constructs.

An opt-in historical result is provider compatibility evidence, not certification
of the workstation's single Qwen3.5:9b/Ollama model. The current local mission and
unfinished planner work still require their separate real Chrome certification.
The other legacy canonical workflows are outside this repair; their push filters
do not match the files changed here and no workflow-run hook was found.
