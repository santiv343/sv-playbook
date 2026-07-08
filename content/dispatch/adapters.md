# Dispatch Adapters (per-harness spawn recipes)

Measured on Windows 11, 2026-07-08, with a text-only hello probe. The worker
template (`docs dispatch/worker`) is identical for every harness — only the
spawn recipe below varies. Dispatch events must record (harness, model) so
rotation yields comparative rework/cost telemetry.

| Harness | Version | Spawn (non-interactive) | Boot latency | Kill | Live view |
| --- | --- | --- | --- | --- | --- |
| opencode | 1.17.15 | `opencode serve --port <P>` once, then `POST /session` + `POST /session/{id}/prompt_async` | seconds (warm server) | `POST /session/{id}/abort` | `GET /session/{id}/message` |
| kimi | 0.22.3 | `kimi -p "<prompt>"` | 9s | own PID | `kimi server` (REST+WS) exists — same warm-server pattern as opencode, unprobed |
| claude | 2.1.204 | `claude -p "<prompt>"` | 13s | own PID | `--output-format stream-json` |
| codex | 0.142.5 | `'' \| codex exec --sandbox danger-full-access '<prompt>'` — stdin MUST be closed (empty pipe) and cwd MUST be a trusted git repo (or add `--skip-git-repo-check`) | 15s | own PID | stdout stream |
| commandcode | 0.41.1 | `commandcode -p '<prompt>' --skip-onboarding` | 46s | own PID | stdout stream |

## Windows spawn rules (learned the hard way)

1. `opencode run` standalone REQUIRES a TTY — it hangs silently at bootstrap
   when stdout is redirected (6 reproducible hangs). Always use serve+API.
2. npm/pnpm `.ps1` shims (codex, commandcode) cannot be exec'd from bash and
   `cmd //c` mangles inner quotes: spawn via
   `powershell -NoProfile -Command "<cli> <args>"` with single-quoted prompts.
3. Long/multiline prompts: pass as an attached file where supported
   (`opencode -f`; for `-p`-style CLIs, keep the instruction short and point
   at a file path the worker must read first).
4. Every dispatch gets a boot timeout (no sign of life in 120s = kill +
   diagnose) and periodic polling. A dispatcher that waits forever is its
   own dead end (PRINCIPLE-010).

## Recommended routing (until telemetry says otherwise)

- Pipeline backend (auto-dispatch, abort, live cards): **opencode serve API**
  — richest control surface; kimi server is the proven-pattern alternate.
- Rotation workers for implementer packets: kimi (fastest boot), claude,
  codex — same worker template, record harness in the dispatch event.
- commandcode: viable; slowest boot, brings its own taste engine (may
  interact with our taste files — observe on first real packet).
- Judgment roles (planner/reviewer): capable models only, harness-agnostic.
