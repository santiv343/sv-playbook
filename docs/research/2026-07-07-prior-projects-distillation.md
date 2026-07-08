# Distillation — proven criteria from prior projects

Raw material for Plan 2 (constitution content). Sources: aurora-monorepo docs
(decision log, rejected/accepted patterns, invariants, SPEC-13 contract),
sv-forge design, agentic-workflow-toolkit, Command Code taste captured during
Aurora development (`.commandcode/taste/`). Every entry lists its destination
in the playbook. Nothing here is new — it is what already worked, routed.

## → Agent contract (content/contract.md)

From Aurora SPEC-13, battle-tested:

1. Minimal ordered reading list per role; prohibitions on preloading (context routing).
2. Preflight: base SHA, exclusive worktree, merged dependencies, clean tree, green baseline. Foreign baseline failure = `blocked-invalid-baseline`, never "fix it while here".
3. RED test must fail for the named functional cause; literal output recorded before implementing.
4. Write-set is exclusive and literal — a glob authorizes the named bounded context only.
5. Three failed verify cycles → stop with evidence (feeds escalation ladder).
6. Closure command sequence run in order AFTER the last content change; SHA quoted only from `git rev-parse HEAD` output (invented SHAs happened: Aurora T3-01).
7. Root-level verify mandatory, never per-package filters (broke twice: T2-05, T3-01).
8. Evidence field values are literal words the validator expects, documented exactly (whole correction rounds were lost to guessed formats).
9. "PR open" requires `git ls-remote` + `gh pr view` output, not intention.
10. Closing the packet (status, evidence, DoD) is part of the implementation, not post-work cleanup (taste, 0.85).
11. Post-implementation review examines actual diffs/files, never session summaries (taste, 0.87–0.88).

## → Rulebook template (ARCH-/PRODUCT- examples for templates/)

Aurora's invariants, generalized as *examples* of well-formed rules (each shows the `[gate]`/`[criterion]` tag and an enforcement mapping):

- Core is domain-agnostic; an industry may appear only in capabilities/fixtures, never in core. `[gate: lint no-domain-vocabulary — Aurora shipped this as an ESLint plugin]`
- Adapters contain no business rules; kernel orchestrates interfaces only. `[gate: dependency-cruiser layer rules]`
- No `execute_anything` / `mutate_anything` free-payload tools. `[gate: arch test]` (Aurora RP-002)
- Every workspace-scoped query carries the tenant id; RLS + isolation test. `[gate: arch test + integration]`
- Hard state wins over memory when they contradict. `[criterion — semantic]`
- Deterministic code never interprets free user text; NLU is the LLM's job. `[criterion]`
- Errors expected by contract are result codes; broken invariants throw. `[criterion]`
- PII masked in logs; event payloads carry metadata only. `[gate: log lint + payload schema]`

Rejected patterns as template examples (RP format proved its worth — write the "no" down):
- Custom URL schemes in LLM markdown → structured function calls with schema (RP-001/AP-001).
- Schema-reflection "zero maintenance" → mechanized generation with arch tests (RP-004).
- Hot state ingestion (frontend silently feeding the LLM) → local computation or explicit endpoints (RP-003).

## → Quality bar (contract + stack preset TS)

- Strict TS: no `any`, `!`, `ts-ignore`, avoidable casts, undefined sentinels; type guards over assertions (taste 0.85).
- Zero-tolerance debt: no warnings, baselines, allowlists, skipped tests, deprecated coexistence. Replaced code is deleted entirely — no "both live" periods (taste 0.80–0.90).
- Size limits with split-before-exceed (Aurora: component <250, hook <100, runtime file <350).
- Status columns constrained (enum/CHECK), FKs always declared (taste 0.75).
- Logs in English, structured, no PII; narrative in the configured chat language.
- No contractual strings/routes/roles/ids repeated — single sources (Aurora + user feedback memory).
- Prefer established libraries over reinvention; deterministic solutions over regex/semantic guessing where meaning can be lost (taste 0.70–0.75).

## → Testing policy (content/workflow.md, per tier)

- Prioritize edge/failure paths over happy path (taste 0.85).
- Don't mock domain; contractual fakes for external ports; real DB (testcontainers) for RLS/migrations.
- Product-perspective adversarial tests at TIER-3: prompt injection, role override, cross-tenant leakage (taste 0.75).
- Contract tests: one booted server shared per suite, seed once, native fetch, one file per API domain (taste 0.75).
- Every discovered bug gets a regression test inside the write-set or blocks into a corrective packet.

## → Wizard content (content/wizard/*)

- Anti-ambiguity spec bar: exact paths, exact shapes, explicit DO-NOTs, ordering (taste 0.85) — this is the wizard's output quality standard.
- SDD non-negotiable: no code before spec (taste 0.90).
- From sv-forge: the L0→L3 review hierarchy concept (linters → structural pre-filter → LLM review → human) — the wizard's architecture section should place each project's gates on that ladder.
- From sv-forge: shadow mode → promote-with-evidence (≥80% precision over 5+ findings) — generalized into "gates activate in baseline/shadow before they block" (already spec'd for adopt/promotion).

## → Anti-patterns of the methodology itself (content/principles.md commentary)

- Building process tooling in parallel with the product (sv-forge: 40 PRs, never integrated).
- Prose rules without gates (Aurora's first two months; five remediation waves).
- Batching many changes per PR to "move faster" — taste captured this preference (0.60) and Aurora's evidence contradicts it: serial one-packet PRs were what finally worked. The taste entry should be *rejected* in the playbook with rationale; taste is signal, not law.
- Docs that declare aspiration as state; doc-audit exists because of it.

## Explicitly NOT carried forward

- Aurora's 15-section packet format with 33 evidence fields — replaced by frontmatter + DB (two-plane state) with far fewer authored fields; the ceremony moves into generated structure (PRINCIPLE-009).
- The `deferred→planned→ready→active→review→reviewed→done` 7-state machine — collapsed to 5 states + lateral exits; "reviewed" folds into review evidence.
- sv-forge's embedding-based semantic detection as a v1 concern — stays retired until a real project demands it (PRINCIPLE-008).
