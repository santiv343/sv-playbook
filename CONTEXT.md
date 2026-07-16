# Agent Operations

sv-playbook exists so a team can delegate the coordinated operation of AI agents without making chat sessions the source of process truth or authority.

## Language

**Runtime**:
The product that coordinates, constrains, observes, and recovers agent work across projects, roles, models, and providers. Teams delegate agent operation to it.
_Avoid_: Methodology, verifier, prompt collection

**Methodology**:
The configurable rules, roles, quality criteria, and working practices enforced or surfaced by the Runtime. It is part of the product, not the whole product.
_Avoid_: Runtime, control plane

**Human Interface**:
The strategic agent role that works directly with the Human on product, priorities, architecture, and durable decisions. Its identity and state persist, while model sessions are disposable and activated only when needed.
_Avoid_: Delivery Orchestrator, implementer

**Context Pack**:
The minimum role- and run-scoped input compiled by the Runtime: charter, scope, applicable decisions and principles, dependency contracts, and required reports, with references for deeper inspection.
_Avoid_: Full conversation history, unscoped memory dump

**Handoff Report**:
A schema-validated transfer between roles containing outcomes, evidence references, deviations, risks, open questions, and pending decisions. It is the operational handoff; raw conversation is not.
_Avoid_: Chat transcript, unsupported status claim

**Runtime Capability**:
A typed, role-authorized control operation executed and evidenced by the Runtime. An Agent may request it and interpret its immutable result, but never becomes responsible for its execution or truth.
_Avoid_: Prompt instruction, agent-reported command, ambient shell authority

**Agent**:
A running session that combines a Role with a Harness, model, tools, workspace, and RunSpec. It may use native tools for its private inner loop; shared authority and final mechanical evidence remain with the Runtime.
_Avoid_: Role, raw LLM call, provider

**Harness**:
The executable agent environment, such as Codex CLI, Claude Code, OpenCode, an ACP agent, or an embedded Agent SDK.
_Avoid_: Model, Role, Runtime

**Agent Gateway**:
The internal adapter boundary through which the Runtime starts, resumes, observes, interrupts, and collects structured reports from external or embedded agents.
_Avoid_: Custom agent loop, provider-specific business logic

**Intent Contract**:
The Human-approved interpretation of what should be achieved: problem, desired outcome, audience, examples and counterexamples, boundaries, constraints, priorities, chosen trade-offs, observable success, open questions, and assumptions. It distinguishes human-stated facts from inferred or proposed content and governs planning without forwarding the full discovery conversation.
_Avoid_: Raw prompt, technical implementation plan, unconfirmed inference

**Delivery Orchestrator**:
The operational agent role that coordinates delivery within approved intent and delegates implementation and review.
_Avoid_: Founder Interface, implementer, TL with product authority

**Implementer**:
An execution role responsible for producing a scoped change and its test evidence for one packet.
_Avoid_: Planner, Delivery Orchestrator

**Reviewer**:
An independent judgment role responsible for evaluating a proposed change and its tests against requirements, principles, and risk.
_Avoid_: Implementer, merge automation

## Example Dialogue

> **Human:** The product must resume work without me restating prior decisions.
>
> **Human Interface:** I will record that product decision and turn it into approved work.
>
> **Delivery Orchestrator:** I will coordinate the Implementer and Reviewer under that approved intent.
>
> **Runtime:** I will preserve state, apply deterministic gates, and perform the operational transitions around their judgment.
