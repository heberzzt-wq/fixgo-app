# V142 / Qwen: recovery state, scope, and acceptance

This record preserves the locally observed engineering-mission history while
the original Windows laboratory is not writable through the current chat.

## Environments — never conflate them

- **Production / official local runtime:** bridge \`3344\`, supervisor \`3345\`.
- **Experimental pilot:** bridge \`3347\`, local Ollama \`11434\`,
  model \`qwen3.5:9b\`; local branch \`codex/v142-qwen-auth-pilot\`.
- **Remote pilot branch:** \`codex/v142-qwen-auth-pilot\`,
  starting at \`c516151377d0e0e71542ffa3a7636d4a0165a30c\`.
  This remote branch is **older** than the Windows experiment. It does not
  contain many of the locally modified \`qwen-general-*\` modules.
- **Safe GitHub recovery branch:** \`codex/v142-engineering-recovery-20261021\`.
  No push to official branches, merge, production deployment, or payment action.

## Grounded mission failures, in execution order

1. \`general-ac169a29-23da-4882-a960-241d3a6ddfbf\`:
   real repository grep + reads + \`npm test\` ran, but \`npm test\`
   failed because the baseline verifier queried bridge \`3344\`
   rather than the pilot's branch. \`V139_BRIDGE_IDENTITY_MISMATCH\`.
   The auditor incorrectly demanded web sources and Firestore technician counts.
2. \`general-85b0bd32-1cad-4778-8969-5ef0542a21bd\`:
   \`5/6\` tools succeeded; \`tests.run\` failed with
   \`COMMAND_NOT_ALLOWED\`. Both the browser's \`runCommand\` allowlist
   and the bridge's \`/run\` allowlist initially lacked the
   predefined security test command.
3. \`general-7d5b400e-6ec1-448a-a962-328e6d12fadd\`:
   \`6/6\` tools completed and focused payout tests passed; the
   verifier returned \`CODE_PATCH_PREVIEW_REQUIRED\`. The pilot's
   code planner stopped after \`tests.run\`, and its patch
   verification path still required functionality not integrated.

This is evidence of **partial engineering ability**, not Codex-equivalent
autonomous code editing.

## Focused security tests already seen in the local laboratory

\`node --test tests/hotfix-legacy.test.mjs tests/secure-financial-entry.test.mjs\`
passed \`12/12\` locally during diagnostics. These tests do not, by
themselves, prove emulator-level concurrency, idempotence, or before/after
repair, and do not authorize a real payout.

A separate repository test,
\`tests/hotfix-legacy-emulator.test.mjs\`, defines further negative
amount, concurrent-replay, and overspend cases under Firestore emulation.
The local evidence above does **not** claim that emulator test was run.

## Recovery code delivered in GitHub

- \`modules/terminal/qwen-engineering-acceptance.js\`:
  pure analysis of mission intent, evidence-grounded source prioritization,
  exact test-execution verdicts, and a strict independent audit that does not
  force a fictitious patch when an existing fix is physically verified.
  It does **not** have terminal, browser, authorization, or write authority.
- \`tests/jarvis-v142-engineering-acceptance.test.mjs\`:
  seven deterministic acceptance tests.
- \`.github/workflows/v142-engineering-recovery-ci.yml\`:
  isolated GitHub Actions CI for those seven tests and baseline payout tests.
  Does not deploy, sync secrets, or mutate the official branch.

## Next integration — require original Windows pilot source

1. Export/inspect the **current uncommitted local** pilot source; do not
   check out the older remote files over the Windows worktree.
2. Reconcile the new engineering acceptance module into the local
   \`qwen-general-pilot.js\`, \`qwen-general-evidence.js\`, and
   authenticated tool policy without broadening money, deploy, or
   user-data permissions.
3. Implement an independent, per-mission disposable worktree that can
   apply an exact patch **only after** code review and verify baseline,
   edited source, test outcomes, and rollback. Preserve SHA receipts.
4. Bind \`pilot:security\` to an exact approved command in both the
   browser-side \`runCommand\` allowlist and the pilot bridge \`/run\`
   allowlist; never grant arbitrary shell command execution through Qwen.
5. Re-run the **entire** mission from the real Terminal using Qwen local:
   grep → read canonical sources and tests → execute scoped tests →
   prove existing fix or build patch → verify before/after → deliver
   physical diff and test evidence → independent audit.
6. Keep the PR draft and the official V142 unchanged until an
   end-to-end mission demonstrates autonomous completion.

## Non-negotiable acceptance

A passing unit test is **not** a completed mission. A green tool receipt is
**not** a passing test. A prepared patch is **not** an applied patch.
An unverified assumption that a defect exists does **not** justify
inventing a modification. Only physical evidence can turn a requested
complex mission into \`VERIFIED_COMPLETE\`.
