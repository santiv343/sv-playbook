<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-008
title: transversal portability boundary: enforce core-to-port-to-adapter direction and capability conformance
depends_on: ["GATE-005","GATE-007","DOCS-001","ROLE-CONFIG-001"]
write_set: ["src/architecture/**","src/check/architecture*","src/schema/architecture*","src/config.ts","src/config.types.ts","src/config.constants.ts","src/config.test.ts","package.json","package-lock.json","content/cli.md"]
requirements: ["provider-agnostic","harness-agnostic","storage-agnostic","machine-enforced-boundaries","capability-conformance","no-speculative-abstractions"]
evidence_required: ["tool-research-selection","architecture-manifest-fixtures","dependency-violation-fixtures","migration-baseline-receipt","adapter-descriptor-fixtures","multi-adapter-conformance-receipts","semantic-execution-identity-receipt","exception-expiry-receipt","verify-root","final-sha","independent-review"]
---

## Problem

`provider-agnostic` is repeated in prose, but prose cannot prevent core modules from importing a concrete harness, database, transport, operating-system API, forge, UI channel, or vendor SDK. Conversely, abstracting every class creates speculative ports and generic names that hide real coupling. The runtime needs one enforceable boundary policy that preserves portability without pretending all implementations have equal guarantees.

## Task

Implement an architecture-boundary and adapter-conformance gate derived from DEC-031. It governs all real external/volatility boundaries while leaving domain semantics concrete and understandable.

1. Define a small versioned architecture manifest that classifies modules as stable core policy/semantics, capability contract, concrete adapter, or composition/activation. Classification is path- and package-based, validated, and has one authority source.
2. Enforce the dependency direction mechanically:
   - stable core may depend on domain types and capability contracts, never concrete adapters or vendor packages;
   - capability contracts expose the narrow behavior, errors, guarantees, and evidence the core needs, without vendor data types;
   - adapters may depend inward on contracts and outward on concrete technology;
   - only declared composition roots may select and instantiate adapters.
3. Cover the actual changing/external axes used by the product: agent harness, provider/model route, process/isolation mechanism, persistence, backup destination, transport, VCS/forge, notification/UI channel, and external artifact service. Add a new axis only with observed need and an authority/volatility rationale.
4. Every adapter descriptor declares id/version, capability set, limitations, supported security guarantee level, configuration schema, authentication mode, health/activity semantics, error mapping, conformance version, and activation evidence. Names or provider labels never imply capability.
5. Separate portable semantic identity from execution identity. Adapter/provider/model/OS/storage/transport choices do not enter semantic content digests, but every concrete choice and capability version enters execution, evidence, and audit bindings.
6. Run one reusable conformance suite per capability contract. Fake alternatives prove the contract is substitutable; the first real adapter is named, dogfooded, and tested. Capability extensions are explicit and cannot weaken core invariants or silently degrade guarantees.
7. Add deterministic dependency checks to normal verification. Evaluate maintained tools before writing a custom parser; dependency-cruiser is the initial candidate because it supports custom forbidden dependency rules and CI exit codes. Record the selection and version as tooling, not product semantics.
8. Generate an explainable receipt listing classified modules, selected rules, violations, adapter descriptors, conformance results, and any declared exceptions. Exceptions are versioned, owner-bound, expiring policy records; inline disable comments are insufficient.
9. Apply this gate to new boundaries immediately. Existing violations become an explicit finite migration inventory with owners and cannot grow.

## Semantic review

Mechanical checks prove dependency direction, registration, descriptors, and test coverage. Independent architecture review still decides whether a proposed port corresponds to real volatility/authority/isolation, whether its contract leaks vendor semantics, and whether differing guarantees are represented honestly. That judgment is recorded as a structured review, not inferred from a green import graph.

## RED tests

- `core importing a concrete adapter is rejected`
- `core importing a declared vendor package is rejected`
- `adapter vendor types cannot leak through a capability contract`
- `only a registered composition root can instantiate an adapter`
- `missing capability limitation or conformance evidence blocks activation`
- `two adapters pass the same contract suite without core changes`
- `adapter change preserves semantic digest and changes execution binding`
- `expired boundary exception fails verification`

## Acceptance

- The current module graph is classified and produces a finite baseline receipt; no new unclassified external dependency is allowed.
- A fixture directly imports OpenCode, a database driver, an operating-system process API, and a notification vendor from core; each fails for the same architecture rule, without product-specific engine branches.
- Fake alternative harness, persistence, backup, and notification adapters pass their corresponding shared conformance suites.
- A weaker adapter cannot activate under a policy requiring a stronger guarantee; the failure identifies the missing capability/evidence.
- The bundled concrete adapters remain plainly named in adapter/composition code and documentation. Core remains free of their behavioral branching.
- Full verification includes the architecture dependency check and adapter conformance receipts.

## Stop conditions

- No interface-per-class or abstraction without an observed boundary.
- No `generic`, `default`, or `universal` naming that conceals concrete coupling.
- No lowest-common-denominator contract that silently removes stronger guarantees.
- No provider/model/harness/storage/OS/vendor name used as capability evidence.
- No regex-only source scan when the chosen maintained dependency tool can parse the module graph.
- No manually maintained second list of adapters or architecture entrypoints.

## Evidence

Tool research/selection record, architecture manifest schema fixtures, dependency-violation fixtures, migration baseline receipt, adapter descriptor fixtures, multi-adapter conformance receipts, semantic-vs-execution identity receipt, exception-expiry receipt, full verification, final SHA, and independent architecture/security review.
