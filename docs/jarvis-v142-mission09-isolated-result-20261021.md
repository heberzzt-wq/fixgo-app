# Jarvis V142 — Mission 09 physical Docker observation

Date: October 21, 2026
Scope: controlled fixture only; NOT a production FixGo repair.

## Provenance

The user ran the local Node script and supplied the full CLI JSON response
in this conversation. The assistant independently checked repository state,
the downloaded original preview receipt and SHA-256 values, but did not
personally execute the Docker containers in that run.

## User-observed physical results

- Status: ISOLATED_BEFORE_AFTER_VERIFIED
- verified: true
- baselineFailed: true
- fixedPassed: true
- originalUnchanged: true
- Source: tests/fixtures/v142-rebate-preview.js
- Original SHA-256: d7e341b69a986ae41dd7eca249c2da82a3a33e32ad787a861da7743a3a0308bf
- Proposed SHA-256: e980590fc17ae4b311fb793a4dcb83620367bb2eb596365cd40e2255d6554125
- Docker image ID: sha256:feb76650b7195319268c59cb2d419c732d6c499b13bf5296f16ab59eb1f0a4f3
- Before: process exit 1; 3 of 4 assertions pass; excess rebate throws test fails.
- After: process exit 0; 4 of 4 assertions pass; excess rebate test passes.
- No network, no elevated capabilities, non-root 65534, read-only root.
- Original file remains unchanged; no production patch applied.

This supports the precise conclusion: the reviewed replacement fixed the
requested fixture regression when tested in separate Linux containers.
It does not prove a general-purpose autonomous repair pipeline or grant
repository-write authorization.

## Persisting future host-origin evidence

The local script supports:
 node scripts/jarvis-isolated-patch-probe.mjs --receipt <validated-JSON> --save-report

This performs real before/after Docker execution and only saves a constrained
JSON witness if verification succeeds. The witness is placed under
.jarvis-artifacts/isolated-repair/<missionId>/<random-id>.json with matched
source/image fingerprints and observed test receipts. The witness is an
auditable local runner record, NOT a cryptographic identity signature,
a production deployment, or an implicit model permission.

Future work: authenticated read-back of this independently generated host
receipt in Terminal V142, and an explicit human approval workflow for
optional code application after all scoped tests pass.
