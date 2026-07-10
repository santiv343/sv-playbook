<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-003
title: role-scoped mutations: a session's declared role bounds what it may mutate — TL suggests, PM decides, refusals evented
depends_on: ["ROLE-CONFIG-001","CLI-START-001"]
write_set: ["src/roles/**","src/tasks/service.ts","src/tasks/service.test.ts","content/roles/**"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Make role boundaries MECHANICAL (founder design 2026-07-10: the TL works the open bet, can suggest, but never mutates bet membership/order — that is the PM's decision). Today any agent can run any CLI mutation; the boundary is prose.
1. Sessions declare their role: `start --role <r>` (CLI-START-001) records the session's role (the session identity already exists for leases). Subsequent mutations in that session carry the role.
2. Role config (ROLE-CONFIG-001 store) gains an `allowed_mutations` list per role (defaults: worker = task start/move/note/report on ITS leased packet; orchestrator = dispatch run, takeover, task move on leased flows, bet suggest; founder-interface/PM = everything including bet add/remove, task create/amend, decision answer; reviewer = review verdicts/reports).
3. A mutation outside the session's allowed list is REFUSED naming the role and the sanctioned path ("bet add is a founder-interface mutation — file 'bet suggest' instead"), and the attempt is EVENTED (visible in digest/duties — a pattern of boundary-testing by an agent is itself signal).
4. Escape hatch: no role declared (a human at the terminal) = unrestricted, evented as role-less. This is guardrails for agents, not auth against humans.
Opinion-free: the allowed_mutations map is role config per instance; the engine provides the enforcement point.

## RED test (write first)
In a role-scope test add a test named exactly: "a session's declared role is refused mutations outside its allowed list and the attempt is evented". Declare an orchestrator-role session, attempt bet-membership mutation (or a stand-in PM-only mutation), assert refusal naming the sanctioned suggest path and the recorded event; assert the same mutation passes for a founder-interface session. New feature -> the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing role-scope module, OR the test name "a session's declared role is refused mutations outside its allowed list and the attempt is evented".

## Reuse
The session identity used by leases; ROLE-CONFIG-001's store (extend the schema); the refusal+event conventions; CLI-START-001's --role.

## Stop conditions
Pretending this is security (it is agent guardrails; document that); hardcoding the mutation map in engine instead of role config; refusals without the sanctioned-path hint; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
