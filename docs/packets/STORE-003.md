<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: STORE-003
title: single blessed writer: the daemon owns the live store, worktree CLIs are clients - version skew becomes structurally impossible
depends_on: []
write_set: ["src/daemon/**","src/cli/commands/daemon*","src/db/store.ts","src/db/store.test.ts","src/redteam/**"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Founder ruling (2026-07-11, after the FIFTH store incident in 24h, verbatim): "lo que me importa es que aprendamos a que NO pase mas. ya paso como 5 veces, como puede ser? tenemos que replantearnos como estamos haciendo esto. cada agente debe ser super estricto con lo que puede y no puede hacer."
POST-MORTEM — all five incidents share ONE root cause: every agent process runs ITS OWN copy of the CLI (its own code version, from its own worktree) with direct file access to the SHARED live .svp. The rails live inside the code the workers themselves are modifying, so: (1) v4->v5 worktree migration lockout; (2) rebuild --force wipe; (3) v7->v8 worktree migration lockout; (4) unauthorized v9 bump from a worktree; (5) unauthorized restore from an old backup that corrupted the store. Prompt rules forbidding this were violated every single time. Rules in prompts are suggestions; rules in gates only work if the gate runs in a process the agent cannot modify.
THE FIX — single blessed writer:
1. The live .svp gets exactly ONE writer process: the sv-playbook daemon, launched from the BLESSED checkout (repo root on the default branch). It holds the store exclusively (SQLite exclusive locking mode + lock file with pid). Composes with serve (same process can host both).
2. Every CLI invocation that is NOT the blessed root process becomes a CLIENT: it detects it is in a worktree (or the daemon lock exists) and forwards the command over localhost (node:http, token in a root-only file) to the daemon. The daemon executes it with THE DAEMON'S code — version skew becomes structurally impossible; a worker with v9 code cannot impose v9 on the store because it never opens the file.
3. The daemon is where role capability manifests (FLOW-003), destructive consent (GATE-001) and the migration gate (STORE-MIGRATION-MAIN-001) are ENFORCED — the client's opinion is irrelevant. Sessions authenticate with a role token issued at dispatch; a worker token physically cannot execute restore/rebuild/migrate or move packets it does not hold.
4. No-daemon fallback: at the blessed root with no daemon running, the CLI works direct-to-file as today (single-user mode). From a worktree with no daemon: refusal naming the fix ("start `sv-playbook daemon` at the repo root").
5. Red-team: a worktree process attempting to open the live .svp directly while the daemon holds it must fail (locking), and the attempt is detectable (compose with GATE-002 tamper evidence).
Zero new runtime deps: node:http + node:sqlite locking. Opinion-free: port/token/enforcement live in config; the mechanism is the engine's.

## RED test (write first)
In a daemon test add a test named exactly: "a worktree CLI cannot open the live store directly and is served through the blessed daemon instead". With a fixture repo + fixture worktree: start the daemon on the fixture store, run a CLI command from the worktree, assert it was executed via the daemon (evented with the daemon's version) and that a direct DatabaseSync open of the store from the worktree process fails while the daemon holds it. Today no daemon exists -> the FIRST failure is the missing module/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing daemon module, OR the test name "a worktree CLI cannot open the live store directly and is served through the blessed daemon instead".

## Reuse
serve's node:http server (SERVE-001, merged) as the host process pattern; the session/role machinery (FLOW-003 when it lands — design the token handshake so FLOW-003 plugs in); STORE-CONCURRENCY's transaction discipline; the events table; worktreeRoot/commonRoot detection in src/db/store.ts.

## Stop conditions
Any runtime dependency; a second command execution path in the daemon (it must reuse the SAME command registry/services the CLI uses — one engine, two transports); leaving any direct-file write path reachable from a worktree process; auth theater (the token is anti-accident and anti-version-skew, not cryptographic security); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
