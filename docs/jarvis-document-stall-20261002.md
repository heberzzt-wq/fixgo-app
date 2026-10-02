# Document stall intervention — 2026-10-02

Scope: the existing V142 worker checkout, branch `v94-media-v4n-negative-claims`, starting HEAD `add24d84aa8fa97a9953c688897b68574b918df0`. One local `qwen3:1.7b` authority, no cloud fallback, no inference or mission deadline. Hosting publication is limited to `fixgo-44e4d` under the existing user authorization.

## Incident evidence

The user's current console trace is `trace_1790953359489`, analysis `cb323fa2-1722-4089-9799-b5cda1887942`. Ollama task 1284 consumed 8,138 prompt tokens and 8,000 generated tokens in 4,127 seconds; the request completed after 68m51s with truncated output and two context shifts. The browser subsequently started `document.compose` twice more. `marketing.plan` and `web.media.collect` had completed. A later package creation failed with `ARTIFACT_PATH_REQUIRED`.

Live bridge PID 7396 was verified against `/workstation/health` and its process command before intervention. No supervisor was listening on 3345. Its logs and health were copied to `.jarvis-artifacts/document-stall-20261002/`; only that bridge process was stopped. Ollama subsequently reported all slots idle. The user's next attachment confirmed a partial mission and the preserved marketing plan. Connection-refused messages after intervention are expected while the bridge is stopped.

## Root causes and changes

- `tools.bridge.js` rebuilt document failure payloads without `retryable:false`, `fullRestartAllowed:false`, recovery details or draft content. The existing orchestrator then retried the failed document. Preserve those fields through the actual presentation boundary. Regression exercises `ToolsBridge`, `ResponseComposer` and the mission orchestrator together.
- Document generation requested 8,000 output tokens against an 8,192-token context already almost full. Bound each document request to 1,200 output tokens and check a conservative UTF-8 input envelope with reserved output/template space. Keep the full user instruction and quantitative contract; excerpt planner prose and evidence explicitly as PARTIAL. Oversized required input fails before inference instead of being silently truncated.
- Generic final-response composition discarded text on `finishReason:length`. Document stages now retain this partial text for the existing independent document validator and targeted repair loop. They still use the same local engine, model, cancellation and no-deadline transport.
- Native document streaming reports received characters, not a fabricated completion percentage. UTF-8 split chunks and missing completion are handled by the existing transport. Heartbeats remain liveness only.
- Save each accepted draft separately in browser storage as `UNVERIFIED_DRAFT`, including long content normally reduced by mission compaction. Storage failure is reported honestly. Keep the previous accepted draft when a repair does not improve validation.
- `marketing.package.real-media` accepts a simple output label by converting it to a stable mission-specific JSON path under the existing artifact root. Explicit valid artifact paths remain supported; traversal and outside paths fail without a write. No publication authority changes.

## Verification

The four new incident regressions failed before the fix for the intended reasons. The package label regression also failed before its fix.

Final focused suite: 70 passed (`jarvis-document-flow`, `jarvis-document-recovery`, `jarvis-document-validator`, `jarvis-semantic-transport`, `response-composer-semantic-contract`, `nexo-real-media-tools`, `nexo-real-media-semantic-binding-v131`). Neighbor selection: document composition/validation, prepared content, marketing, mission retries and restart guards. Two old assertions of 8,000/4,500 tokens were updated to the new 1,200-token fragment contract; all neighboring behavior must still pass.

Real Qwen probe: first version completed structural validation in 132,241 ms with two repairs, using 521–633 prompt tokens per call. Review found that repair prompts omitted the planned factual constraints; the final version preserves them as well. The subsequent final-version probe finished in 79,189 ms with `DOCUMENT_REPAIR_NO_PROGRESS`, one repair, 506 actual stream frames and the original 977-character draft saved. The rejected candidate had placeholder table content. This is a verified failure stop, not a successful document delivery. Its nonzero probe exit is retained; it must not be reported as a passed document-generation scenario. Evidence: `.jarvis-artifacts/document-stall-20261002/physical/`.

## Limits

The structural validator is not a factual or marketing-quality certification. The original full web mission and downloadable campaign are still partial until independently demonstrated. Browser automation could list the active user tab but returned `Debugger unattached` for page inspection; no browser acceptance is claimed from HTTP or unit tests. Very large user instructions exceeding the conservative per-request envelope stop explicitly; no requirements are silently dropped. No B2B, Functions, Rules, credentials, paid services or semantic-authority changes are included.
