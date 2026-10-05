# Advertising repeat recovery

Observed mission: `MISSION-f4d6e4cd-5a09-4f92-8c23-ad61bb9b315c`.
Research completed; argument completion failed with
`SEMANTIC_ADVERTISING_MESSAGE_REPEATED`. Export subsequently failed with
`MATERIAL_EXPORT_ARTIFACT_REQUIRED`. This was a partial result, not an ad delivery.

## Change contract

- Keep the same local Qwen authority, official originals and advertising history.
- Preserve the three-attempt maximum. Permit a second copy repair when the first
  repair repeats a message; repeated errors in other validators still stop.
- Reject a reused headline or body independently. Changing one field cannot hide
  reuse of the other field.
- Keep historical headlines and bodies outside generation prompts: real Qwen
  repeatedly copied them when provided as negative examples. Independent validation
  still compares against the complete observed history.
- Request brief, complete sentences rather than filling schema length limits.
- Before executing export, require its exact output to occur among produced
  artifacts in canonical mission evidence. Original library inputs do not count.
- Fix the CI closeout marker to recognize the existing multiline timeout policy
  with `noDeadline`, without rewriting runtime or changing video behavior.

## Evidence

The focused suite passed 128 tests. After the brief-copy prompt adjustment, all
33 semantic transport tests passed again. CI closeout ran in memory with zero
virtual writes. These are local checks, not a green GitHub Actions run.

Real local Qwen reproductions and physical render/export receipts are under
`.jarvis-artifacts/reconfiguration-20261004/physical-repeated-copy*` (ignored,
excluded from Hosting). They reuse observed research and exercise argument
completion, the app compositor through Canvas/Sharp, and the real library export.
This harness does not establish fresh browser mission acceptance.

The first renderer used an incompatible image decoder; that was a harness error.
A subsequent delivery completed but visual review found a body cut at the schema
limit. Neither result was accepted as final visual evidence. Final activation and
visual acceptance are recorded separately in the ignored incident receipt.
