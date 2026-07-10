<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-005
title: control plane: founder can pause resume stop takeover and abort by task sprint role or pipeline
depends_on: ["FLOW-001","FLOW-002","FLOW-003","DECISION-LOG-001","SERVE-NOTIFICATIONS-001","SPRINT-DETAIL-001"]
write_set: ["src/dispatch/**","src/cli/**","src/tasks/**","src/db/**","src/serve/**","content/dispatch/**","content/roles/**"]
requirements: []
evidence_required: ["final-sha"]
---

## Task
Make founder control over the agent operation explicit, durable and always available. The system already has leases, pause/resume ideas, takeover and read-only serve, but the CONTROL PLANE is incomplete. Close that gap mechanically.

Implement:
1. Define the canonical control actions and their semantics:
   - `agent pause <scope>`: cooperative stop request; no new dispatches in scope; active agents must observe it at gate points;
   - `agent resume <scope>`;
   - `dispatch stop <scope>`: stop launching new workers but do not revoke active leases;
   - `task takeover <id> [--force]`: existing path for replacing an active holder;
   - `agent abort <scope>`: adapter-backed best-effort process abort when available, always evented as escalation, never the primary path;
   - `decision ask/answer` and `notification ack` as the human intervention path.
2. Scope must be first-class: task, sprint, role, or whole pipeline. The founder must be able to freeze one task, a whole sprint, or all orchestration without inventing prompts.
3. Control state lives in the DB and is surfaced everywhere relevant: `status`, `start`, digest, serve notifications, task detail, sprint detail. A paused scope is visually obvious and included in dispatch/replan hold reasons.
4. `dispatch run` / orchestrator loops MUST consult control state before every launch and after every replan trigger. A paused sprint or globally stopped pipeline is a hard hold reason.
5. Add an intervention ladder:
   - first: pause;
   - second: decision/escalation;
   - third: takeover;
   - fourth: adapter abort if the process is non-cooperative.
   The event log must show which rung was used and why.
6. Serve remains CLI-backed for writes: buttons may exist only as adapters to the same CLI commands. No second write path.
7. Configurable per instance: whether abort is available, scope defaults, pause polling expectations, escalation thresholds. Engine provides primitives; project profile chooses policy.

## RED test (write first)
Add a control-plane test named exactly: "a paused sprint blocks further dispatch until resumed and the hold reason is visible everywhere". Seed an open sprint with two runnable packets, pause the sprint after the first dispatch, assert no further packet launches, `dispatch plan` reports the pause hold, and status/serve builders show the paused control state. Resume and assert dispatch becomes available again.
Expected failure cause (literal string in the output): the test name "a paused sprint blocks further dispatch until resumed and the hold reason is visible everywhere".

## Reuse
FLOW-001 dispatch execution; FLOW-002 duties; FLOW-003 role-scoped mutations; DECISION-LOG-001; SERVE-NOTIFICATIONS-001; SERVE-DETAIL-001; SPRINT-DETAIL-001; existing lease/takeover paths; content/dispatch/adapters.md abort capabilities.

## Stop conditions
Control that exists only in chat; serve writing state directly; pause with no effect on dispatch; abort as the default instead of cooperative control first; unscoped global-only controls; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
