<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: DOCS-001
title: privacy, retention, storage, deletion, and backup capability contract
depends_on: []
write_set: ["src/privacy/**","src/schema/privacy*","src/reports/**","src/notifications/**","src/db/backup*","src/config.ts","src/config.types.ts","src/config.constants.ts","src/config.test.ts","docs/privacy/**","content/cli.md","playbook.config.json"]
requirements: ["local-first","content-minimization","secret-exclusion","storage-agnostic","provider-agnostic-backups","deletion-honesty"]
evidence_required: ["data-flow-inventory","content-exclusion-fixtures","secret-redaction-fixtures","deletion-receipts","storage-conformance","backup-conformance","restore-receipt","verify-root","final-sha","independent-review"]
---

﻿## Problem

The runtime needs durable state, evidence, backups, reports, activity receipts, notifications, and resumability, but storing raw human/agent content by default would create unnecessary secret, privacy, cost, and deletion risk. Retention by external services is outside the runtime's direct control and must not be hidden.

## Task

Define the data-classification, retention, redaction, access, export, deletion, and backup contract independently of storage engine, transport, deployment topology, operating system, and vendor.

1. Classify data independently of storage/transport: authority/state metadata, immutable evidence/artifacts, structured reports/decisions, human intent content, agent prompt/output/transcript content, tool/log content, telemetry, credentials/secrets, and backups.
2. The default local profile stores authoritative structured state, source/version hashes, bounded content-free activity/effect receipts, decisions, Intent Contracts, and validated reports. It does not persist raw reasoning, continuous agent output, full transcripts, tool inputs/outputs, environment dumps, or credentials.
3. Evidence payloads are content-addressed and carry classification, owner/project, purpose, created time, retention rule, access policy, redaction status, locator, digest, and deletion/legal-hold state. A reference is not permission to read the payload.
4. Redact or reject known secret classes before general persistence, reports, notifications, UI, or backups. Raw protected diagnostics require explicit policy, narrower access, bounded retention, and a separate evidence class.
5. Retention is policy data by class and instance/project, with deterministic expiration/tombstone processing and receipts. Missing policy fails closed for new raw-content capture; it never means retain forever.
6. Provide project export and deletion semantics, including authoritative stores, derived indexes, generated projections, caches, activity history, and backup tombstones. Deletion reports what cannot be recalled from an external service or backup and why.
7. Backups use a `BackupSink` capability. Local verified snapshots are the initial adapter/default. Optional periodic off-device or cloud-synced destinations are configured adapters with encryption, access, integrity, restore conformance, cadence, retention, failure notification, and no vendor assumption.
8. Storage adapters implement a narrow persistence capability and pass the same classification, secret-exclusion, retention, export, deletion, backup, and restore conformance suite. A bundled local database adapter is an implementation choice, not a policy authority.
9. Document external adapter/service data flow and retention separately from runtime guarantees. The UI shows what leaves the local boundary before activation.
10. No compliance claim is inferred. Multi-user/tenant access control and legal retention requirements belong to the corresponding security/product level.

## RED test

Send a secret fixture through persistence, report, notification, UI, and backup serialization boundaries. The contract validator must reject or redact it before every adapter call. Before the classification contract exists, at least one boundary accepts unclassified content and the fixture fails.

## Acceptance

- Default runtime activity/report fixtures contain no prompt, reasoning, tool input/output, transcript tail, environment value, or credential.
- A secret fixture is redacted or rejected before persistence, report, notification, UI, and backup serialization.
- Missing retention policy blocks raw diagnostic capture but not content-free state receipts.
- Expiration removes payload and derived indexes while retaining a non-sensitive tombstone receipt.
- Project export/deletion lists all local classes and outstanding external/backup limitations.
- Two fake storage adapters and two fake backup destinations receive equivalent classified contracts; disallowed classes never reach them.
- A periodic backup failure preserves authoritative local state and emits one deduplicated notification.
- External-service retention appears as an explicit adapter limitation, not a runtime promise.

## Stop conditions

- No raw-content journaling before this contract is activated.
- No credentials in any authoritative store, report, event, notification, prompt, or unencrypted backup.
- No hardcoded database engine, cloud vendor, path layout, transport, or retention duration in core policy.
- No silent indefinite retention.
- No deletion-success claim while known copies remain unaccounted for.
- No generic storage abstraction that hides different consistency or security guarantees; adapters declare capabilities and limitations explicitly.

## Evidence

Data-flow inventory, content-exclusion fixtures, secret/redaction fixtures, expiry/export/deletion receipts, storage and backup adapter conformance, restore receipt, full verification, final SHA, and independent privacy/security review.
