<!-- GENERATED FROM context_items — DO NOT EDIT -->

# Human Judgment Profile

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

## HJ-021: Unknowns must remain explicit

Do not infer a personal preference merely from one accepted implementation. New taste is proposed with evidence and scope, then confirmed by the human before becoming binding. Open product questions, security promises, retention policy, notification defaults, UI behavior, and reviewer policy stay explicit until their configured contracts are accepted.

## HJ-022: Weigh agentic code-generation fit when choosing tools

When choosing a framework, language, library, or platform for work agents will implement, code-generation reliability is an explicit factor, not an afterthought: how well-represented the tool is in training data, how stable its API surface is, and how recently it changed shape. A technically superior tool that generates unreliable code from agents is not automatically the better choice, and a popular tool is not automatically the right one regardless of fit.

Weigh this against the tool's actual fit for the problem and any real sunk cost already invested. State the trade-off explicitly — what is gained, what is risked — so the human decides with it visible, per HJ-007. Do not let it silently become the sole deciding factor.
