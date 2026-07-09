# AGENTS.md — sv-playbook

You are an AI agent working under the sv-playbook methodology on THIS repo
(sv-playbook dogfooding itself). Read this first; everything else is on demand
via `npx sv-playbook docs <topic>`.

## Hard rules (non-negotiable; mechanized where stated)
1. **Never push or merge to `main` directly.** `main` is branch-protected: direct
   pushes are rejected. Every change goes through a pull request. Enforcement:
   GitHub branch protection (`enforce_admins` on, PR required, `verify` status
   checks required, linear history) — this is a `[gate]`, not a request.
2. **No PR is merged without a reviewer's APPROVED verdict.** A reviewer agent
   (or the human) runs `npx sv-playbook docs review` on the diff; the
   **reviewer performs the merge** on APPROVED (M1–M3 in `docs roles/reviewer`).
   The mechanized floor is GitHub branch protection (no direct push, PR required,
   `verify` status checks on ubuntu + windows, linear history, `enforce_admins`).
   The *independent approving review* itself is **process-enforced** — on a
   single-token repo GitHub cannot require it via API (the author cannot
   self-approve), so a SEPARATE reviewer agent gives the verdict and then merges.
   `PLANNED`: mechanize the approval with a second identity / bot token or
   CODEOWNERS so review becomes a true `[gate]`. Bypassing it is a constitution
   violation.
3. **Evidence is captured by the CLI, never transcribed.** SHAs and verify output
   come from `task move <id> review`, not from memory or pasting (D24).
4. **Single source (PRINCIPLE-011).** No fact defined twice — duplicated unions,
   parallel lists, scattered literals, or restated rules are instant review
   failures.

## Your role (one per task — read the charter before starting)
- **PM / orchestrator** — drives the board, delegates to workers/reviewers,
  merges on APPROVED. `npx sv-playbook docs roles/orchestrator`
- **Implementer (worker)** — one packet, one branch, RED-first, verify green.
  `npx sv-playbook docs roles/implementer`
- **Reviewer** — the checklist, verdict APPROVED | REQUEST CHANGES.
  `npx sv-playbook docs roles/reviewer`
- **Planner / product** — `npx sv-playbook docs roles/planner` · `docs roles/product`

## Operate
- Board: `npx sv-playbook status` · Health: `npx sv-playbook doctor`.
- The CLI is the ONLY writer of operational state. Never hand-edit `.svp/` or a
  packet's status.
- `.svp/` is local/gitignored (SQLite operational truth). Packet docs live in
  `docs/packets/`. SQLite is operational truth — NOT rebuildable from files;
  durability is `backup state` / `restore state`.

## Constitution (on demand)
`npx sv-playbook docs principles` · `docs cli` · `docs review` ·
`docs roles/<role>` · `docs dispatch/...`
