<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: CLI-START-001
title: human-operable Playbook and deterministic EffectiveRoleBrief from one operation contract
depends_on: ["CHECK-SELF-001","ROLE-CONFIG-001","BRIEF-CONTEXT-PACK-001","HANDOFF-CMD-001"]
write_set: ["src/cli/commands/start*","src/runtime/role-brief/**","src/schema/role-brief*","src/cli/commands/instructions*","src/gateway/prompt*","src/gateway/adapters/*projection*","src/serve/**","content/instructions/**","content/cli.md","AGENTS.md","CLAUDE.md"]
requirements: ["human-operable","single-operation-contract","provider-agnostic","least-sufficient-context","role-authority","runtime-owned-effects","cross-surface-parity"]
evidence_required: ["no-agent-end-to-end-fixture","interactive-cold-start-receipt","workflow-cold-start-receipt","capability-tool-projections","custom-profile-fixture","cross-surface-parity","drift-rejection","verify-root","final-sha","independent-review"]
---

## Problem

Playbook must remain fully operable without any agent: a human operator can execute the
whole process through the public CLI or UI by supplying every required input and
following every valid transition. Agents are optional operators of that same interface,
not a privileged execution path.

Repository cold-start instructions currently say only that an AI agent is working
under the methodology and should read documentation on demand. They do not establish
the agent's effective role, distinguish agent authority from human operator authority,
or explain the exact Playbook operations available to that role. A session can
therefore improvise a different role even though the Role Catalog contains the right
contract.

## Task

Implement one deterministic agent bootstrap that emits an `EffectiveRoleBrief` from
authoritative runtime data. Generated `AGENTS.md`, `CLAUDE.md`, harness projections and
workflow launches all use this capability; none authors a parallel role prompt.

1. Preserve one complete human-operable Playbook interface:
   - every process capability is available as a typed public CLI operation and, where
     applicable, the same operation is projected in `serve`;
   - each operation exposes required inputs, preconditions, authorized actors, state
     transition, typed outcomes and recovery guidance;
   - a human can perform the entire configured workflow manually without an agent or a
     hidden runtime-only API;
   - automation and agents compose these same operations and contracts rather than
     bypassing them through a second orchestration path.
2. Resolve agent identity without a bundled role-name branch:
   - a workflow-dispatched session uses the immutable role, phase, workflow effect and
     RunSpec binding;
   - an interactive session with no RunSpec uses the active configured human-entry
     workflow and its start role;
   - missing or ambiguous identity fails with a typed recovery result.
3. Keep three authorities distinct:
   - the human operator may intentionally use the complete manual Playbook interface
     allowed by the instance and is not modeled as an agent role;
   - an agent owns only the semantic judgments declared by its role;
   - runtime owns deterministic computation and effects.
   An agent never inherits human authority merely because the human is present.
4. Compile the role brief from versioned sources:
   - mission and exclusive semantic responsibilities;
   - current phase procedure and expected input/output contracts;
   - allowed, denied and conditional harness tools from the effective execution profile;
   - allowed Playbook capability requests and command/action projections from the
     authority/operation catalog;
   - prohibitions, self-correction scope, stop conditions and escalation classes;
   - valid handoff targets and artifact contracts;
   - least-sufficient applicable principles, decisions, taste and task context;
   - live state digest and next available actions derived from state machines.
5. Every allowed/denied action includes its source capability/operation ref and reason.
   The brief does not tell an agent to perform deterministic work; it tells the agent
   which public Playbook operation to request, the required arguments and how to
   interpret the typed result.
6. Emit a receipt binding role catalog, operation catalog, workflow definition, context
   pack, execution profile and live-state versions/digests. Stale, incomplete or
   contradictory inputs reject bootstrap rather than falling back to generic prose.
7. Generated cold-start files contain one small universal instruction: obtain and obey
   the effective role brief before acting. They may embed a verified projection for the
   configured interactive entry role, but generated content carries the same receipt and
   drift fails verification.
8. `serve` exposes the same effective role brief and an explanation of every available
   or unavailable action. CLI, UI and harness adapters are projections of one result.

## RED test

- A fresh interactive session resolves the configured entry role without a hardcoded
  role id and receives its complete brief before responding to the human.
- A workflow implementer receives implementation judgment and private harness tools,
  but not human authority, planning, review or delivery commands.
- A human manual launch remains available and is not rejected by an agent-role rule.
- A no-agent fixture completes the configured workflow using only documented public
  CLI operations and the same contracts used by automation.
- CLI, UI, workflow automation and agent adapters cannot disagree about an operation's
  required inputs, preconditions or result because all project from one operation
  catalog entry.
- A human-interface brief shows how to request planning/refutation/status capabilities
  and explicitly excludes implementation and delivery choreography.
- A role whose operation mapping, handoff, profile or mandatory context is missing
  fails with a distinct typed code.
- Changing any source digest makes the generated cold-start projection stale.
- A custom profile with different role ids/count resolves without engine changes.

## Acceptance

- Opening a supported interactive harness in the repository requires no pasted role or
  process explanation: its automatically loaded instructions lead to one effective
  role brief derived from live state.
- Every configured role can explain, from the same data, what it judges, what harness
  actions it has, what Playbook operations it may request, what it must not do, and
  where unresolved work bubbles.
- Human manual Playbook controls remain available.
- A human can inspect and operate the complete configured process manually; replacing
  the human with an agent changes the caller, not the Playbook contract.
- No agent receives all roles, the full conversation, or unrelated policy.
- Full verification and independent authority/context review pass.

## Stop conditions

- No hardcoded bundled role id, role count, provider, model, harness or command list.
- No parallel role authority in Markdown, adapter config or prompt strings.
- No inference that an available shell command is authorized for the current agent.
- No operation that automation can execute but a human cannot inspect and invoke through
  the public interface with the required authority and inputs.
- No duplicated human, agent, UI or automation operation definitions.
- No claim that context delivery itself enforces an effect.
- No fallback from missing role/capability data to manual choreography.

## Evidence

Provide a no-agent end-to-end workflow fixture, interactive and workflow cold-start
receipts, per-role capability/tool projections, custom-profile fixture,
missing/ambiguous identity fixtures, cross-surface semantic parity, drift rejection,
full verification, final SHA and independent review.
