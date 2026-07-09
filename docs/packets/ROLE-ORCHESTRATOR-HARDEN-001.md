---
id: ROLE-ORCHESTRATOR-HARDEN-001
title: orchestrator role fully transferable: front-half planning, review-gate honesty, human-decision taxonomy; reviewer owns the merge
depends_on: []
write_set: ["content/roles/orchestrator.md","content/roles/reviewer.md","AGENTS.md","content/review.md","docs/how-it-works.md"]
requirements: []
evidence_required: ["verify-root","final-sha"]
---

## Task
Make the orchestrator role fully transferable to any cold agent, and resolve the single-source conflict about who merges. Three gaps + one conflict.

**Conflict to resolve first — who owns the merge (PRINCIPLE-011).** Today three docs disagree: orchestrator.md says the orchestrator "never merges"; AGENTS.md says "the orchestrator performs the merge"; reviewer.md (M1-M3) says the reviewer merges, verifies MERGED, and closes. DECISION (founder-approved): **the reviewer owns the merge.** Make one consistent statement everywhere it appears:
- content/roles/reviewer.md — keep/clarify M1-M3 as the single authoritative merge procedure (reviewer merges → verifies state==MERGED → moves packet to done).
- content/roles/orchestrator.md — orchestrator DELEGATES review and NEVER merges; on APPROVED the reviewer merges-and-closes; the orchestrator only relays.
- AGENTS.md — rewrite the hard-rule line so it says the reviewer performs the merge after APPROVED (not the orchestrator).
- content/review.md — the merge-gate [gate] section must name the reviewer as the actor that merges.
- docs/how-it-works.md — fix §7 table, §8 sequence, and §10 diagram so the REVIEWER is the merge actor (I introduced the wrong actor there; correct it).

**Gap 1 — the front half of the role is missing.** orchestrator.md starts at "poll board / dispatch ready packets". Add the upstream steps: how packets come to exist — the orchestrator drives PLANNING (invokes/authors via the planner charter) to turn founder intent and discovered findings into packets, and records unvalidated ideas in docs/backlog.md instead of dropping them. Add these as EXEC/JUDGMENT steps BEFORE the current step 1.

**Gap 2 — honesty about the review gate.** The independent-approval requirement is NOT mechanized (a solo-token repo has required_approving_review_count=0; GitHub cannot force an independent approval). AGENTS.md and content/review.md currently imply it is a hard [gate]. Relabel it truthfully: branch protection (PR required, CI verify on two OSes, linear history, enforce_admins) IS mechanized; the independent reviewer APPROVAL is process-enforced. Record the PLANNED mechanization path (a second identity / bot token, or CODEOWNERS) so it can become a true [gate] later.

**Gap 3 — the human-decision taxonomy.** orchestrator.md only says "ESCALATE to human" generically. Add an explicit JUDGMENT table of what belongs to the human (architecture decisions, tier changes, scope changes, anything irreversible/outward-facing) vs. what the orchestrator resolves autonomously (reversible work that follows from approved intent: dispatch, retry-once, harness rotation, board hygiene). This is what keeps a cheap orchestrator from either escalating everything or merging a decision that was the founder's.

## Gate (no RED test; docs/charter [criterion] packet)
Reviewer verifies: (a) grep the write_set for "merge" — every statement of who merges names the REVIEWER, zero contradictions remain; (b) orchestrator.md now covers planning/backlog (gap 1), the honesty relabel is present in AGENTS.md + review.md (gap 2), and the human-decision table exists (gap 3); (c) every charter still obeys the `docs roles/format` EXEC/JUDGMENT structure; (d) `verify` green.

## Stop conditions
Touching code or the cli.md/README/spec cleanup (owned by CONSTITUTION-CLEANUP-001); changing the format contract itself; adding a rule not derived from founder-approved decisions in this thread.

## Evidence required at close
verify-root, final-sha.
