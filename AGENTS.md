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
   orchestrator merges only after APPROVED. On a single-token repo GitHub cannot
   require an *independent* approving review (the author cannot self-approve), so
   this gate is process-enforced: a SEPARATE reviewer agent gives the verdict and
   the orchestrator performs the merge. Bypassing it is a constitution violation.
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
