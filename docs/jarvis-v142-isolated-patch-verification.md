# V142: isolated patch verification (prepared, not activated)

## Installation prerequisites

Windows 11 Home requires WSL 2 for Docker Desktop Linux containers.
On 2026-10-21 WSL 2 and Docker were not installed. A one-time elevated
Windows operation and possibly a controlled reboot are necessary.

1. Save work and preserve the ability to restore Terminal 5000, bridge 3344, and Ollama 11434.
2. From an elevated PowerShell, manually run scripts/jarvis-enable-wsl2.ps1.
   It uses wsl --install --no-distribution and does not reboot by itself.
3. Reboot manually only if Windows requires it; verify the remote and all three services afterward.
4. From ordinary PowerShell run scripts/jarvis-install-docker-user.ps1.
   Start Docker Desktop with the WSL 2 Linux engine.
5. Check wsl --version and docker info; pull the fixed image using docker pull node:24-alpine.
6. Run node --test tests/jarvis-isolated-patch-probe.test.mjs.
7. Run node scripts/jarvis-isolated-patch-probe.mjs --receipt <mission-diagnostic.json>
   using a real authenticated Terminal diagnostic for the controlled fixture.

## Security and truthful completion

- Only tests/fixtures/v142-rebate-preview.js is accepted as proposed source.
- Its physical SHA and proposed SHA must match the exact prepared patch receipt.
- The host owns the test assertions; Qwen cannot send arbitrary test commands.
- Two temporary copies are tested separately; no source-repository writes occur.
- Containers have no network, no privileges, a non-root user, read-only files and
  root filesystem, and CPU, memory and PID limits. No repository or Docker socket mounts.
- Baseline must fail the targeted regression; patched copy must pass all assertions.
- A Docker-less machine must return SANDBOX_RUNTIME_NOT_READY, not run code locally.
- Unit tests mocking Docker do not prove containers actually executed.
- ISOLATED_BEFORE_AFTER_VERIFIED certifies only a controlled local fixture.
- A general-purpose autonomous production repair is NOT enabled by this probe.
- Do not treat Git worktrees or Node vm as secure boundaries for untrusted code.

## Next integration

After physical Docker verification succeeds, the authenticated V142 executor must
bind this result to the original tool receipts and user approval workflow.
Only then may a full before/after code repair be considered for certification.
