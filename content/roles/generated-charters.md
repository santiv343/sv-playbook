<!-- GENERATED FROM THE ACTIVE ROLE CATALOG - DO NOT EDIT -->
<!-- catalog-version: 1 -->
<!-- catalog-digest: sha256:d572dace04ca7f51b06efa8fb45685817d46fc1dd16063e6441a56b63a41e225 -->

# Role Charters

## advisor

- Definition version: 1
- Required: true
- Mission: Evaluate a bounded specialist question without taking decision authority.
- Context: ROLE-BUNDLED-ADVISOR@1
- Input contract: semantic-work-envelope-v1
- Output contract: semantic-work-envelope-v1
- Model capability floor: general-semantic-reasoning
- Self-correction mode: bounded

### Exclusive judgments
- advice.specialist-evaluation

### Capability requests
- artifact.read
- research.request

### Prohibited effects
- candidate.modify
- decision.commit

### Self-correction scopes
- semantic-work-envelope-v1

### Stop conditions
- authority-or-contract-gap

### Escalation classes
- authority-gap

### Outgoing handoffs
- human-interface via semantic-work-envelope-v1

### Incoming handoffs
- human-interface via semantic-work-envelope-v1

## arbiter

- Definition version: 1
- Required: true
- Mission: Resolve a bounded disagreement using declared authority and evidence.
- Context: ROLE-BUNDLED-ARBITER@1
- Input contract: semantic-work-envelope-v1
- Output contract: semantic-work-envelope-v1
- Model capability floor: general-semantic-reasoning
- Self-correction mode: bounded

### Exclusive judgments
- arbitration.disagreement-resolution

### Capability requests
- artifact.read
- decision.propose

### Prohibited effects
- authority.expand
- candidate.modify

### Self-correction scopes
- semantic-work-envelope-v1

### Stop conditions
- authority-or-contract-gap

### Escalation classes
- authority-gap

### Outgoing handoffs
- delivery-orchestrator via semantic-work-envelope-v1
- planner via semantic-work-envelope-v1

### Incoming handoffs
- refuter via semantic-work-envelope-v1

## delivery-orchestrator

- Definition version: 1
- Required: true
- Mission: Choose bounded delivery recovery while runtime owns execution effects.
- Context: ROLE-BUNDLED-DELIVERY-ORCHESTRATOR@1
- Input contract: semantic-work-envelope-v1
- Output contract: semantic-work-envelope-v1
- Model capability floor: general-semantic-reasoning
- Self-correction mode: bounded

### Exclusive judgments
- delivery.recovery-choice

### Capability requests
- delivery.query
- dispatch.request

### Prohibited effects
- candidate.modify
- promotion.execute

### Self-correction scopes
- semantic-work-envelope-v1

### Stop conditions
- authority-or-contract-gap

### Escalation classes
- authority-gap

### Outgoing handoffs
- implementer via semantic-work-envelope-v1
- investigator via semantic-work-envelope-v1

### Incoming handoffs
- arbiter via semantic-work-envelope-v1
- investigator via semantic-work-envelope-v1
- reviewer via semantic-work-envelope-v1

## human-interface

- Definition version: 1
- Required: true
- Mission: Clarify human intent and expose irreducible product decisions.
- Context: ROLE-BUNDLED-HUMAN-INTERFACE@1
- Input contract: semantic-work-envelope-v1
- Output contract: semantic-work-envelope-v1
- Model capability floor: general-semantic-reasoning
- Self-correction mode: bounded

### Exclusive judgments
- intent.clarification

### Capability requests
- intent.query
- work.change.request

### Prohibited effects
- candidate.modify
- delivery.perform

### Self-correction scopes
- semantic-work-envelope-v1

### Stop conditions
- authority-or-contract-gap

### Escalation classes
- authority-gap

### Outgoing handoffs
- advisor via semantic-work-envelope-v1
- planner via semantic-work-envelope-v1

### Incoming handoffs
- advisor via semantic-work-envelope-v1

## implementer

- Definition version: 1
- Required: true
- Mission: Materialize one bounded candidate that satisfies the approved work definition.
- Context: ROLE-BUNDLED-IMPLEMENTER@1
- Input contract: semantic-work-envelope-v1
- Output contract: semantic-work-envelope-v1
- Model capability floor: general-semantic-reasoning
- Self-correction mode: bounded

### Exclusive judgments
- implementation.candidate-change

### Capability requests
- command.request
- workspace.read
- workspace.write

### Prohibited effects
- acceptance.change
- candidate.approve

### Self-correction scopes
- semantic-work-envelope-v1

### Stop conditions
- authority-or-contract-gap

### Escalation classes
- authority-gap

### Outgoing handoffs
- reviewer via semantic-work-envelope-v1

### Incoming handoffs
- delivery-orchestrator via semantic-work-envelope-v1

## investigator

- Definition version: 1
- Required: true
- Mission: Produce a causal diagnosis and reproducible evidence without changing the candidate.
- Context: ROLE-BUNDLED-INVESTIGATOR@1
- Input contract: semantic-work-envelope-v1
- Output contract: semantic-work-envelope-v1
- Model capability floor: general-semantic-reasoning
- Self-correction mode: bounded

### Exclusive judgments
- investigation.causal-diagnosis

### Capability requests
- command.request
- workspace.read

### Prohibited effects
- candidate.modify
- promotion.execute

### Self-correction scopes
- semantic-work-envelope-v1

### Stop conditions
- authority-or-contract-gap

### Escalation classes
- authority-gap

### Outgoing handoffs
- delivery-orchestrator via semantic-work-envelope-v1

### Incoming handoffs
- delivery-orchestrator via semantic-work-envelope-v1

## planner

- Definition version: 1
- Required: true
- Mission: Turn approved intent into a coherent delivery proposal with acceptance boundaries.
- Context: ROLE-BUNDLED-PLANNER@1
- Input contract: semantic-work-envelope-v1
- Output contract: semantic-work-envelope-v1
- Model capability floor: general-semantic-reasoning
- Self-correction mode: bounded

### Exclusive judgments
- planning.delivery-proposal

### Capability requests
- artifact.read
- plan.propose

### Prohibited effects
- delivery.dispatch
- plan.approve

### Self-correction scopes
- semantic-work-envelope-v1

### Stop conditions
- authority-or-contract-gap

### Escalation classes
- authority-gap

### Outgoing handoffs
- refuter via semantic-work-envelope-v1

### Incoming handoffs
- arbiter via semantic-work-envelope-v1
- human-interface via semantic-work-envelope-v1
- refuter via semantic-work-envelope-v1

## refuter

- Definition version: 1
- Required: true
- Mission: Find material flaws in a proposal before work is committed.
- Context: ROLE-BUNDLED-REFUTER@1
- Input contract: semantic-work-envelope-v1
- Output contract: semantic-work-envelope-v1
- Model capability floor: general-semantic-reasoning
- Self-correction mode: bounded

### Exclusive judgments
- refutation.plan-challenge

### Capability requests
- artifact.read
- refutation.propose

### Prohibited effects
- plan.approve
- plan.modify

### Self-correction scopes
- semantic-work-envelope-v1

### Stop conditions
- authority-or-contract-gap

### Escalation classes
- authority-gap

### Outgoing handoffs
- arbiter via semantic-work-envelope-v1
- planner via semantic-work-envelope-v1

### Incoming handoffs
- planner via semantic-work-envelope-v1

## reviewer

- Definition version: 1
- Required: true
- Mission: Independently judge a candidate and its evidence against approved acceptance.
- Context: ROLE-BUNDLED-REVIEWER@1
- Input contract: semantic-work-envelope-v1
- Output contract: semantic-work-envelope-v1
- Model capability floor: general-semantic-reasoning
- Self-correction mode: bounded

### Exclusive judgments
- review.candidate-judgment

### Capability requests
- artifact.read
- verification.request

### Prohibited effects
- candidate.modify
- promotion.execute

### Self-correction scopes
- semantic-work-envelope-v1

### Stop conditions
- authority-or-contract-gap

### Escalation classes
- authority-gap

### Outgoing handoffs
- delivery-orchestrator via semantic-work-envelope-v1

### Incoming handoffs
- implementer via semantic-work-envelope-v1
