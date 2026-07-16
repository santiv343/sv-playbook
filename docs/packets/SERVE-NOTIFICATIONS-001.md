<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: SERVE-NOTIFICATIONS-001
title: notification policy: deterministic event grouping, routing, acknowledgement, and channel adapters
depends_on: ["BUG-014","DECISION-LOG-001","DOCS-002","FLOW-009"]
write_set: ["src/notifications/**","src/schema/notification*","src/status/**","src/serve/**","src/cli/commands/notification*","src/config.ts","src/config.types.ts","src/config.constants.ts","src/config.test.ts","content/cli.md","playbook.config.json"]
requirements: ["event-policy","channel-agnostic","deterministic-dedup","privacy-safe","configurable"]
evidence_required: ["class-severity-fixtures","dedup-recovery-history","quiet-hour-receipts","channel-conformance","fallback-receipt","content-exclusion-proof","cross-surface-parity","verify-root","final-sha","independent-review"]
---

﻿## Problem

Notifications are currently described as an in-app list of several database conditions. Without an event policy they will duplicate, interrupt unnecessarily, leak content, and diverge across CLI/web/future channels. A channel is delivery, not notification semantics.

## Task

Implement a channel-neutral notification policy and read model. Local web/in-app is the first delivery adapter; other channels remain optional adapters.

1. Normalize eligible runtime events into notification classes: human decision required, invariant/security violation, delivery blocked, review action/disagreement, budget threshold, activity stale/orphaned, backup/restore failure, recovery result, and informational completion/digest.
2. Define severity and interruption independently: `info | attention | urgent | critical` plus `digest | passive | interrupt`. Runtime facts determine class; no LLM decides whether an event exists.
3. Apply deterministic correlation, deduplication, grouping, update/recovery, and cooldown rules. Repeated events update one logical notification and preserve occurrence history; recovery resolves but does not erase it.
4. Notification records include stable id/correlation key, class, severity, state, project/task/run/review/decision references, first/last occurrence, count, required human action/capability when any, policy version, acknowledgement/resolution, and content-safe evidence refs.
5. Policy config controls class routing, thresholds, quiet hours, batching/digest cadence, acknowledgement requirement, escalation delay, retry/backoff, and enabled channel capabilities. Safety-critical local visibility cannot be disabled by an ordinary task.
6. Channel adapters receive the same canonical notification and return delivery receipts. Web/local fallback remains available when an external channel is unavailable. Adapter failure never loses the canonical record.
7. Acknowledgement, snooze, resolve, and linked action are runtime capabilities with authorization and receipts. Viewing/acknowledging does not falsely resolve the underlying condition.
8. Human-interface and sprint reports receive grouped notification/decision summaries, not continuous events. Delivery-orchestrator receives only operational notification classes it owns.
9. Apply privacy/redaction before notification construction. No transcript, reasoning, command, tool output, credential, or raw error detail in general notification payloads.
10. One builder feeds CLI, web, digest, and future adapters. Renderers do not reclassify severity or state.

## RED test

Emit repeated stale-activity events followed by verified recovery, plus an external channel failure. The runtime must create one correlated notification, increment occurrence history, resolve it once, and preserve local visibility while retrying the failed adapter. Before canonical policy exists, the fixtures duplicate, disappear, or diverge by channel.

## Acceptance

- Repeated stale-progress events produce one active notification with incremented count; resumed activity resolves it once and retains history.
- Quiet hours defer an attention notification to digest but never hide a critical invariant violation from local UI.
- An external channel failure retries per policy and keeps the local canonical notification visible.
- Acknowledgement does not resolve an orphaned process; verified cleanup does.
- CLI/web/fake external adapters render the same id, class, severity, state, and references.
- A user action deep-links to the exact capability/request and related task/run/decision.
- Content scan rejects transcript/reasoning/tool/secret fixtures before any adapter call.
- Different instance profiles change routing/cadence without core changes.

## Stop conditions

- No notification logic per view/channel.
- No hardcoded email/Slack/OS/web assumption in core.
- No LLM summarization in event classification/dedup.
- No silent drop after adapter failure.
- No acknowledgement-as-resolution shortcut.

## Evidence

Provide class/severity matrix fixtures, dedup/recovery history, quiet-hour/digest receipts, channel conformance and fallback receipts, content-exclusion proof, cross-surface parity, full verification, final SHA, and independent UX/privacy review.
