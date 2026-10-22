# V142 — Local Qwen mission cancellation evidence

## Scope

A visible "Detener" button now exists while a local general Qwen mission
is processing. Only the local authenticated 127.0.0.1:5000 general pilot
receives a signal; ordinary flows do not inherit unsafe cancellation or
write authority.

The Terminal creates a per-turn AbortController and passes its signal to
GestiaCore.procesarIntencion. The general pilot passes the same signal to
the authenticated Qwen selector and bridge request, where abort interrupts
the pending network request. It prevents duplicate cancel clicks and hides
the button when processing returns.

## Physical UI verification (October 21, 2026)

- Laptop: adjunto-jarvis; official bridge 3344 synchronized to 7ec374bb.
- A deliberately harmless, read-only source investigation was submitted
  from the actual Chrome Terminal.
- The visible "Detener misión local" button was enabled while Qwen was
  preparing the plan.
- UI Automation invoked the actual button's InvokePattern; the Terminal
  rendered "Misión cancelada por el usuario".
- No VERIFIED_COMPLETE, no repository mutation and no write approval.
- The message send button returned to enabled.
- The next user-like question, "que es JSON?", was accepted and Qwen gave a
  normal local answer: this is evidence that the pilot was not stuck busy.

## Limits

This verifies the cancellation path of a local, read-only general mission,
not the behavior of all possible tools or deployments. A tool that has
already completed may have generated local artifacts before cancellation;
existing verified receipts persist only if the mission had saved them.
Cancellation cannot roll back arbitrary operations (so writes remain
separately human-authorized and excluded from this pilot).
