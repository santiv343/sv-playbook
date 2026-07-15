<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-015
title: authoritative state-machine catalog and complete serve state projection
depends_on: ["CHECK-SELF-001"]
write_set: ["src/state/**","src/schema/state*","src/serve/state*","src/serve/server*","src/tasks/service*","src/orchestration/*constants*","src/orchestration/observability*","src/gateway/*constants*","src/db/store.migration*","src/db/store.migrations.ts"]
requirements: ["machine-first","provider-agnostic","transactional-guards","complete-state-visibility"]
evidence_required: ["entity-coverage-matrix","transition-guard-fixtures","cross-surface-parity","migration-receipt","verify-root","final-sha","independent-review"]
---

## Problem

State is currently split across flat string arrays, local transition maps, workflow
tables, gateway observations and UI labels. There is no complete authoritative catalog
from which runtime guards and serve views can derive every current/possible state.

## Task

Implement a versioned runtime state-machine catalog and projection contract.

1. Register every stateful entity type in one catalog. Current closure must explicitly
   cover plan, task/packet, workflow run, step/effect, dispatch/session, review,
   promotion and system health. A generated completeness check fails when any future
   stateful entity has no machine; do not rely on a permanent hardcoded count.
2. For every machine define stable id/version/digest, entity identity, initial states,
   and all states. Each state exposes stable id, human label, plain-language meaning,
   category and initial/terminal/degraded/orphaned/unknown flags.
3. Define every transition with source/result, triggering event, typed guard refs,
   authorized actor/capability, authorized effect, denial code/reason and recovery path.
   Guard/effect implementation ids resolve through canonical operation/authority
   registries; prose is not executable policy.
4. Evaluate guards and reserve/mutate authority atomically with transitions. External
   effects use reservation/idempotency plus a pinned final recheck. CLI, serve, agents
   and adapters cannot use alternate transition paths.
5. Pin definition versions for active entities. New definitions affect new instances;
   stale/replan/migration policy is explicit and never silently changes in-flight
   semantics.
6. Expose a provider-neutral serve contract containing machine catalogs, current
   entity state, source ref/version/digest, legal actions and denied-action reasons.
   Filters, labels, tooltips, diagrams, explanations and action availability are
   projections. Frontend code owns no status enum, transition/action list or provider
   fact.
7. Model degraded and unknown data honestly. Serve remains readable in degraded mode
   and identifies affected surfaces plus only the recovery capabilities that remain
   valid independently of the failed registry.
8. Migrate existing state non-destructively under exclusive writer coordination,
   verified backup/restore and explicit legacy/unknown provenance policy.

## RED test

- A registered stateful entity has no machine definition.
- A state or transition lacks required metadata/recovery.
- A transition references an unknown guard/effect/capability.
- UI or API exposes an action absent from the catalog.
- CLI takes a transition denied by the same guard used by serve.
- An active instance silently adopts a new machine version.
- A stale projection digest is consumed as current.
- Degraded mode advertises a recovery action depending on the failed registry.
- Existing packet/workflow/gateway states fail to map during migration.

## Acceptance

- Current entity coverage is complete and generated from registrations.
- One transition capability produces identical allow/deny results for CLI, serve and
  agent clients.
- Serve exposes all possible states and current states from the same versioned source.
- Adding a registered state or machine updates serve without frontend code changes.
- Full verification and independent state/data-integrity review pass.

## Stop conditions

- No duplicate UI/backend status enums or transition maps.
- No generic graph engine beyond required state-machine semantics.
- No provider/harness branching in core state definitions.
- No destructive migration or timestamp-inferred provenance presented as fact.

## Evidence

Provide entity-coverage matrix, transition/guard fixtures, cross-surface parity receipt,
stale/degraded fixtures, migration backup/restore receipt, full verification, final SHA
and independent state-machine/data-integrity review.
