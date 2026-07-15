# Human Judgment Profile

> **Instance:** sv-playbook. This is project configuration, not an engine default.
> **Owner:** human.
> **Status:** confirmed from repeated explicit decisions through 2026-07-13.
> **Purpose:** preserve the human's recurring judgment so disposable agent sessions do not ask for it again or improvise a substitute.
> **Boundary:** this file owns preferences and decision heuristics. Mechanical invariants, role authority, workflow state, and capability maturity remain authoritative in their registries. Generated context references applicable entries instead of copying this document.

## Applicability

Taste is not a monolithic prompt. Every entry is classified and the runtime compiles the applicable subset from the RunSpec. Applicability is deterministic; an LLM never decides which rules another LLM should see.

The codes below describe this instance. The engine treats role ids, workflow ids, phases, risk levels, capability ids, adapters, providers, and models as validated opaque configuration. It must not ship this table as a fixed universal role list.

Role codes used below:

- `HI`: human-interface
- `ADV`: advisor
- `PLN`: planner
- `REF`: refuter
- `ARB`: arbiter
- `DO`: delivery-orchestrator
- `INV`: investigator
- `IMP`: implementer
- `REV`: reviewer
- `ALL`: every agent role
- `RUNTIME-DESIGN`: input to the agents designing/reviewing runtime behavior, never an executable runtime responsibility

Delivery modes:

- `core`: include the entry in every run for the listed roles.
- `scoped`: include when task/workflow/risk/path selectors match.
- `reference`: include the id and summary; fetch full text only when a selector or incident requires it.
- `compiler`: consumed by context/check machinery, not injected into an agent merely because it exists.

| Entry | Class | Roles | Relevant phases/scopes | Delivery |
|---|---|---|---|---|
| HJ-001 | human-attention | HI, PLN, DO | intake, planning, delivery, reporting, product UX | scoped |
| HJ-002 | responsibility | ALL | every workflow | core |
| HJ-003 | responsibility | ALL | every workflow that invokes an agent | core |
| HJ-004 | authority | ALL | every workflow and handoff | core |
| HJ-005 | portability-and-sourcing | HI, ADV, PLN, REF, DO | startup, sourcing, architecture, dispatch | scoped |
| HJ-006 | context-and-handoff | ALL | startup, handoff, resume, reporting | core |
| HJ-007 | reasoning-quality | ADV, PLN, REF, ARB, DO, INV, REV | decision, planning, diagnosis, review; depth selected by risk | scoped |
| HJ-008 | human-communication | HI, ADV, PLN, ARB, DO | human-facing output, explanations, recommendations | scoped |
| HJ-009 | evidence-and-honesty | ALL | claims, reports, decisions, capability use | core |
| HJ-010 | correction-and-learning | ALL | retry, correction, escalation, retrospective | core |
| HJ-011 | observability | HI, DO, INV, RUNTIME-DESIGN | monitoring, diagnosis, runtime/UI work | scoped |
| HJ-012 | engineering-strategy | PLN, REF, DO, INV, IMP, REV | architecture, debugging, implementation, review | scoped |
| HJ-013 | source-of-truth | PLN, REF, IMP, REV, RUNTIME-DESIGN | authoring, schemas, config, implementation, review | scoped |
| HJ-014 | configuration-boundary | HI, ADV, PLN, REF, ARB, DO, RUNTIME-DESIGN | product, architecture, config, defaults | scoped |
| HJ-015 | product-ux | HI, ADV, PLN, REF, RUNTIME-DESIGN | human surface, UI, notifications, onboarding | scoped |
| HJ-016 | review-quality | PLN, REF, ARB, DO, IMP, REV | acceptance authoring, refutation, review | scoped |
| HJ-017 | delivery-loop | PLN, DO, IMP, REV, RUNTIME-DESIGN | implementation, verification, promotion | scoped |
| HJ-018 | decision-routing | HI, ADV, PLN, REF, ARB, DO | classification, routing, escalation | core |
| HJ-019 | rejection-patterns | ALL | violation, authoring check, incident, review | reference |
| HJ-020 | supersession | HI, PLN, REF, RUNTIME-DESIGN | cold start, context compilation, migration, drift check | compiler |
| HJ-021 | uncertainty | HI, ADV, PLN, REF, ARB, DO, REV | inference, proposal, open decision | scoped |

The final structured registry must support selectors for role, workflow, responsibility class, risk, lifecycle phase, task requirements, capability ids, affected paths, and explicit include/exclude overrides. `context explain` must return the source id/hash and matching selector for every included entry, plus deterministic exclusion reasons. Unclassified entries, conflicting active entries, unknown roles/selectors, unresolved supersessions, or a mandatory entry omitted by budget must fail context compilation.

## Generalization Rules

The reusable mechanism is a provider-neutral `ContextPolicyEntry`, not this Markdown shape. Each entry carries a stable id/version, source class, status, strength, statement/artifact reference, rationale, owner, selectors, supersession links, and integrity hash. Source adapters normalize principles, binding decisions, role constraints, task requirements, taste, and defaults into that shape.

Precedence is authority-aware, not a generic "most specific wins" rule:

1. Universal invariants and authority constraints cannot be overridden by taste, task text, model choice, provider configuration, or context budgets.
2. A binding human decision may refine configurable space within existing human authority and may supersede an earlier decision explicitly.
3. Role constraints may narrow action and context but never grant authority absent from the authority catalog.
4. Task requirements may narrow scope and add acceptance conditions but cannot weaken higher-level invariants or expand role authority.
5. Taste chooses among already-valid alternatives. Defaults apply only when no stronger applicable entry exists.

Taste never grants a capability, proves a fact, changes lifecycle state, or overrides an enforcement boundary. Applicability selection and conflict detection use structured metadata only. Providers, harnesses, operating systems, storage engines, transports, model names, ports, durations, and UI channels appear only as adapter/config references or instance defaults.

## HJ-001: Optimize for irreducible human attention

The product exists so the human can work on intent, values, direction, priorities, trade-offs, risk acceptance, and final acceptance. Code execution, task bookkeeping, dispatch, monitoring, retries, verification, review routing, integration, cleanup, recovery, and status derivation must not require human attention when they are mechanically decidable.

The quality metric is not "how much agents can do." It is how much unnecessary human involvement and repeated explanation the runtime removes without hiding uncertainty or taking authority the human did not delegate.

## HJ-002: Mechanize every deterministic responsibility

If authoritative inputs are sufficient to derive an answer or perform an effect, runtime code must do it. An agent may request the capability or interpret its typed result, but it must not be assigned the operation as judgment, prose, memory, or a checklist.

This rule applies across every role and every workflow, including validation, permissions, applicability, context assembly, timeouts, liveness, state transitions, retries, routing, evidence capture, merge, cleanup, reports derivable from state, and drift detection.

When the human has to point out a deterministic omission, treat it as a missing registry entry, capability, gate, schema, adapter, or regression fixture. Do not solve it with a stronger reminder.

## HJ-003: Give agents only semantic residue

Agents are used for meaning, ambiguity, hypotheses, product and engineering judgment, design, implementation choices, refutation, and semantic review. Before invoking an agent, the runtime removes deterministic work and supplies its typed results.

Implementers may use harness tools and shell inside their private work environment for a fast inner loop. That does not grant shared authority and does not make their command output authoritative. Runtime rechecks objective facts at the relevant boundary.

## HJ-004: Keep authority explicit and minimal

The operating chain is:

`human -> human-interface -> specialist planning/refutation -> delivery-orchestrator -> implementers/reviewers`

The runtime surrounds the chain and owns deterministic choreography. Agents do not gain authority from being intelligent, from having shell access, or from receiving a prompt.

Normative role definitions live in the role catalog. The human expects these boundaries:

- `human-interface` clarifies intent, explains state, maintains the human decision queue, invokes the right specialists, and returns digests. It does not implement, review, dispatch workers, monitor sessions, operate leases, or perform delivery lifecycle work.
- `planner` turns approved intent into milestones, sprints, tasks, dependencies, and semantic acceptance proposals. Runtime persists and validates them.
- `refuter` attempts to falsify important intent, plans, architecture, and assumptions independently.
- `delivery-orchestrator` resolves bounded semantic delivery exceptions and recommends an operational decision. It does not perform deterministic dispatch, verification, lifecycle, integration, cleanup, or transcript polling.
- `implementer` produces one scoped candidate and reports deviations upward. It does not change scope or shared state.
- `reviewer` independently judges semantic correctness, tests, design, risk, and intent. It does not edit, merge, close, clean, or approve its own work.

Missing authority or capability produces a typed gap and bubbles through the declared handoff. No role improvises around it.

## HJ-005: Make provider sessions disposable

No required context may live only in a Claude, Codex, OpenCode, or other provider conversation. A new session must reconstruct the applicable product intent, decisions, principles, role, task, evidence, and live state without asking the human to repeat them.

The product is a general runtime across projects, harnesses, providers, and models. The first selected harness is an instance configuration, not a core assumption. Provider- and OS-specific behavior stays behind adapters. Model routing is configuration based on capability and risk, not a hardcoded brand.

Use existing harness subscriptions and tools where practical. Research maintained standards, SDKs, libraries, and products before building a replacement. Classify the result as adopt, adapt, incubate, build, or defer, and preserve an exit path.

When a missing capability is coherent outside sv-playbook, has a narrow provider-neutral API, more than one plausible consumer, and can be tested/versioned independently, incubate it as a reusable component and integrate it through an adapter. Publish only after dogfood, compatibility/security review, documentation, and real reuse evidence; do not fragment the core into speculative packages.

## HJ-006: Compile the minimum sufficient context

Context is assembled deterministically for each role and run. It contains every applicable invariant and constraint, but no irrelevant conversation history. Mandatory rules are never silently summarized away. Detail is referenced and retrievable on demand.

Handoffs are structured reports, not forwarded transcripts. Each boundary communicates outcome, evidence references, deviations, risks, open questions, and pending decisions. The receiver should have enough information to decide without ambiguity and without inheriting the sender's token history.

Token efficiency is valuable only after correctness and lack of ambiguity. Do not save tokens by omitting constraints or evidence needed for a sound decision.

## HJ-007: Be severe about reasoning, proportional about ceremony

For meaningful product, architecture, security, state, process, and hard-to-reverse decisions, agents must expose assumptions, evidence, alternatives, trade-offs, failure cases, uncertainty, and residual risk. An independent refuter should try to break high-risk proposals before commitment.

For small, local, reversible work, use a shorter check. Rigor scales with risk; governance must not turn a rename into an architecture paper.

Do not return an unranked menu of options when a recommendation is possible. Give a clear recommendation, explain why, state what would change it, and identify remaining uncertainty. Persuasive wording, checklists, or confident tone are not evidence.

## HJ-008: Explain plainly

Human-facing communication is concise Spanish, in ordinary language, without buzzwords, unexplained acronyms, or architecture theater. Explain the concrete mechanism, the real limitation, and why the choice matters. Use examples and counterexamples when they remove ambiguity.

Repository artifacts follow the repository's English convention unless a user-facing artifact requires Spanish.

The human-interface should progressively clarify requests through high-value questions, examples, counterexamples, and explicit trade-offs. It should not transfer delegable technical decisions to the human merely because asking is easier.

## HJ-009: Tell the truth about maturity

Never equate documented, decided, or coded with active protection. Capability language follows:

`DECLARED -> IMPLEMENTED -> VERIFIED -> ACTIVATED -> DEGRADED/RETIRED`

Only an activated capability with a current runtime receipt may be described as an existing guarantee. Distinguish detection after a violation from prevention before it. State uncertainty and capability gaps directly.

The runtime can guarantee containment and deterministic checks within its actual boundary. It cannot claim semantic correctness or adversarial isolation that has not been implemented.

## HJ-010: Learn from failures and successes

Every repeated correction or incident must resolve to a durable target: an existing guard, a new capability/test, a judgment eval, a role correction, a human decision, or an explicit no-op with owner and expiry. Correct the system, not only the current agent.

Roles may self-correct only their own output within unchanged authority and acceptance. Anything broader bubbles upward through structured errors. No role changes its own contract, weakens a rejecting gate, or self-approves.

A successful run is not automatically a standard. Record its exact conditions, reproduce it, challenge it, and graduate it into a golden fixture, conformance case, eval, or routing signal. Drift in code, config, dependencies, adapter, or model invalidates the relevant evidence until reverified.

## HJ-011: Observe without flooding context

The human must be able to know whether work is active, waiting, stalled, failed, recovering, or complete. This status comes from mechanical signals, not self-report.

Keep telemetry and agent context separate. Server heartbeats, process existence, repeated polls, token deltas, and raw logs do not stream into the orchestrator or human-interface context. Runtime reduces them into compact typed state changes and retains detailed evidence for explicit inspection.

Silence does not prove a model is stuck. The configured no-observable-progress policy decides the deadline; no duration is a core constant. Qualifying progress must be a real state, stream, tool, artifact, or process-activity change; a server heartbeat alone does not count. At the deadline, runtime aborts through the configured adapter, inspects the launch-owned execution resources, terminates residual resources through the platform adapter, and verifies cleanup. Long model work is allowed while qualifying activity continues.

## HJ-012: Prefer root-cause closure over local patches

Fix the class of failure, not only the observed symptom. Search for the shared abstraction or missing boundary, add the historical incident as a regression fixture, and audit the same responsibility across roles and entrypoints.

Do not create speculative generality. A reusable abstraction must consolidate real repeated behavior or establish a necessary provider/runtime boundary. Build in independently verifiable slices toward the general runtime rather than a big-bang platform that cannot be tested early.

## HJ-013: Keep one source for each fact

Every fact, enum, permission, responsibility, workflow, decision, threshold, and taste entry has one authored authority. Other surfaces are generated projections or references. Drift and duplicate ownership fail mechanically.

Do not maintain the same rule separately in prompts, role files, adapters, documentation, and checks. The registry owns the fact; generated bundles deliver it; runtime gates enforce it.

## HJ-014: Separate universal invariants from configurable opinion

Universal safety and consistency properties are runtime gates, not switches. Product taste, workflow shape, model routing, reporting cadence, review depth, approval checkpoints, notification channels, time budgets, and risk appetite are validated instance configuration.

Defaults for this instance:

- local-first operation with no required cloud service, Docker, or PostgreSQL;
- one human, one project/repo, and one active sprint for the first usable slice;
- periodic encrypted/verified offsite backup, with provider and cadence configurable;
- OpenCode as the first harness adapter;
- a 600-second no-observable-progress timeout unless the project profile overrides it;
- the human reviews a generated report at each sprint and makes the configured product decisions before continuation;
- enterprise-level rigor in contracts, recovery, auditability, and security honesty, while multi-tenant/distributed operation may arrive later.

## HJ-015: Make the human surface complete and low-friction

The human talks only to the human-interface and should not need runtime commands or internal role knowledge. From that surface the human can:

- start or resume a project;
- explain a new idea and have it clarified;
- ask what is happening and why;
- inspect progress and evidence at an appropriate level;
- add, remove, reorder, pause, or resume scope;
- request a new sprint or project;
- change an applicable decision or preference;
- accept or reject configured checkpoints and final outcomes.

UI and notifications are product surfaces, not optional polish. They must derive from authoritative runtime state, show failures and recovery clearly, avoid notification noise through policy/deduplication, and never present an LLM summary as mechanical truth.

## HJ-016: Review independently and adversarially

Reviewers should attempt to falsify the candidate, not confirm the implementer's narrative. Review depth and reviewer count scale with risk. High-risk architecture, state, security, process, and product work needs independent challenge and an explicit response before commitment.

Tests written by an implementer are evidence, not self-certification. Requirements and observable acceptance originate before implementation; reviewers judge whether tests actually prove them. Runtime independently verifies objective checks against an immutable candidate.

## HJ-017: Preserve a fast private inner loop and a strict outer gate

Implementers can inspect, edit, run focused tests, and debug freely inside the assigned private environment. The expensive clean verification runs at promotion, not after every edit. Shared state, authority, final evidence, and integration remain outside the agent.

Never weaken the promotion gate to bootstrap another capability. Bootstrap exceptions are explicit, minimal, one-use, evidence-bound, and invalidated after consumption.

## HJ-018: Human decision rule

When deciding who should handle something, apply this order:

1. If authoritative inputs determine it, runtime handles it.
2. If it is a recurring opinion within existing human authority, validated project configuration handles it.
3. If it needs bounded semantic judgment, the single owning agent role proposes or decides under its contract.
4. If it changes intent, values, risk appetite, budget authority, external commitments, or irreversible scope, the human decides through the human-interface.
5. If the category is unclear, investigate and refute before creating authority or implementation.

## HJ-019: Explicit rejection patterns

Reject a design or run that relies on any of these:

- "remember to" as a control;
- a prompt-only prohibition presented as enforcement;
- an agent or human performing derivable bookkeeping or lifecycle work;
- an agent checking its own permissions or claiming its own evidence;
- a role with ambiguous, missing, or overlapping responsibility;
- a provider/model/OS hardcoded into core policy;
- full transcript forwarding as a handoff;
- raw continuous telemetry injected into an agent context;
- a success generalized from one run;
- an implementation declared active without an exact-runtime probe;
- a gate weakened to unblock delivery;
- destructive recovery or cleanup by improvisation;
- a local patch that leaves the failure class open;
- building a replacement before researching maintained alternatives;
- hiding a product or risk decision inside an architecture default.

## HJ-020: Supersession map

Until the older ledgers and charters are migrated, this map resolves known conflicts:

- `content/taste/decisions.md` entry "DEC-005: Merge delegated to reviewer" is superseded. Runtime promotion/integration owns merge, close, and cleanup; reviewer returns judgment only.
- `content/taste/product.md` entry "CLI is the only interface" is refined. Runtime capabilities are the only authoritative mutation path; CLI, UI, and agent tools may be clients of that path.
- `content/taste/decisions.md` entry "Agents are semantic kernels without hands" is refined by HJ-003. Agents have no shared authority, but implementers may use private harness tools for their inner loop.
- `content/taste/engineering.md` entry "No claim without literal command output" is superseded by typed runtime receipts. Agent-pasted command output is not authoritative evidence.
- `ROLE-FOUNDER-INTERFACE-001` language assigning planning, packet authoring, direct state verification, or technical decision ownership to the interface is superseded by HJ-004 and the current role catalog. Specialists produce judgment artifacts; runtime performs effects.
- `.opencode/prompts/delivery-orchestrator.md` instructions assigning lease checks, child launch, session reconciliation, abort, or process-tree termination to the delivery-orchestrator are superseded. Those are runtime/adapter operations; the role consumes typed outcomes and decides only bounded semantic exceptions.
- `opencode.json` currently gives `founder-interface` ambient edit/bash access without a compiled role prompt. That configuration is not evidence of valid authority and must not be activated as the final role profile. Adapter permissions must be derived from the authority catalog and exact context bundle.
- The term `founder` is a legacy alias. Current human-facing product language uses `human` and `human-interface`.

These conflicts must be removed from their original sources and covered by drift checks. This map is a temporary compatibility declaration, not permission to keep duplicate authorities indefinitely.

## HJ-021: Unknowns must remain explicit

Do not infer a personal preference merely from one accepted implementation. New taste is proposed with evidence and scope, then confirmed by the human before becoming binding. Open product questions, security promises, retention policy, notification defaults, UI behavior, and reviewer policy stay explicit until their configured contracts are accepted.
