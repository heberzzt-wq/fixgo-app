# Mission delivery repair — 2026-10-02

Scope: V142 worker checkout, branch `v94-media-v4n-negative-claims`, starting at `466814c2fd17fe0106635687bca08c369307692a`. The same local Qwen remains the sole semantic authority; embeddings retrieve candidates mechanically. No inference deadline, external model, paid service, Functions deployment or B2B change.

## Current incident

User console trace `trace_1790962211027`, analysis `4bc8fab8-2665-41b7-b57b-329c795b51e7`, mission `MISSION-619bb1f0-8ec9-4e92-9c0c-aeee78e64ba7`. Browser inspection confirmed the stored arguments, not just console labels. The 58-minute mission searched an invented URL inside the repository, interpreted a law firm as contract signing, required both images and videos, composed an unrelated legal contract, spent about 37 minutes on a spreadsheet and delivered only a media manifest. `document.compose` completed under the previous fix; the entire delivery remained PARTIAL.

## Mechanisms addressed

- The local mission contract selected from a lexical top-eight catalog. This could hide both the web reader and the artifact writer. Qwen now describes source review, independent work objectives and delivery; the existing embeddings retrieve each operation's candidates; the same Qwen assigns one tool per operation. Factual arguments are deferred until evidence exists. No domain keyword router selects tools.
- Preserve deferred argument completion through planner normalization and the real mission orchestrator. Grounded completion now receives the original instruction when rebinding explicit source URLs. Repository file arguments cannot be HTTP URLs. A category such as `MARKETING` cannot replace the explicit source hostname.
- Marketing owns its own semantic completion instead of receiving a second generic completion first. Clarify the roles of the business, its customers and the assistant's deliverable; place schema instructions in the system message of the same model. Retain canonical mission evidence and explicit partial-coverage labels.
- Ordinary exact URLs are valid research anchors as well as social handles/video IDs. A page need not supply canonical metadata when its actual response URL exactly matches the requested source and it has a title. A redirect or conflicting source identity is not accepted by this path.
- Informational workbooks need no artificial formula. Validate formulas when present and require one only when the contract explicitly asks. Bound spreadsheet context/output, stream real progress, preserve drafts, and stop repeated non-improving repairs. Keep these flags through presentation and preserve formula requirements during artifact handoff.
- After resolving deferred format arguments, reuse the verified marketing plan in the document writer. Simple filenames resolve under the existing artifact root using mission identity; explicit paths retain bridge validation.

## Evidence and acceptance

Focused regressions are in `tests/jarvis-mission-delivery-recovery.test.mjs`; initial catalog and spreadsheet checks failed before their fixes. Local evidence and actual Ollama request/response bodies are retained in `.jarvis-artifacts/mission-delivery-20261002/`. Physical probes use the actual planner, argument completion, runtime, mission orchestrator and local writer; the script's execution callback follows the production handoffs. This is not browser acceptance.

Rejected experiments are not successful certification: exposing all 66 tools led to extra tasks; free list selection also copied irrelevant candidates. A later physical plan correctly selected web research, marketing and a downloadable document. A file was physically produced in an intermediate run, but its marketing content was poor and was rejected on review. No production publication is justified by that intermediate file alone.

Additional root causes: oversized canonical observations could be reduced to zero excerpts; their attributed summaries now survive with PARTIAL coverage. Grounded completion now converts legacy schema hints into native JSON Schema. Marketing first identifies the advertiser/service/audience/markets, then fills only missing brief fields; generated strategy fields remain explicitly marked as proposals. The writer binds the complete marketing content even with deferred/default HTML format, and default filenames include mission identity.

Fresh checks: all modified JS/MJS syntax checks passed; normal repository `git diff --check` passed. The combined focused suite passed 92/92. After the last prompt simplification, 25 affected marketing/grounded-completion/recovery checks passed. A diagnostic diff invoked with `core.autocrlf=false` incorrectly treated existing Windows line endings as whitespace changes; no files were changed by that command, and the normal repository check passed afterward.

Final pre-release real-Qwen run: `execution-mission.json`, duration 144635 ms, COMPLETED with web.research → marketing.plan → document.create, no blocked tasks. The selected contract was itself produced by Qwen with semantic candidate retrieval (115506 ms), not handwritten. The output is an editable HTML proposal, not a PDF or an executed campaign. Review confirmed the advertiser is the law firm, the proposal mentions Mexico and Cancun, and the writer contains the plan rather than the raw user instruction. It is a basic proposed strategy, not a quality certification of every recommendation.

The separately requested four-stage component sequence was completed by adding real web.media.collect and marketing.package.real-media to the verified research/plan context. It returned 6 images, 0 videos, and a real JSON package. `physical-files-verified.json` independently reread and matched bytes and SHA-256 for the HTML, package and six images (8 files). This component sequence was explicitly selected for verification; it is not represented as Qwen's autonomous tool selection or browser acceptance.

Release and browser verification are pending at this checkpoint.
