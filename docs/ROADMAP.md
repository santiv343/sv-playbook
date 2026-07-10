# Roadmap

Organizes the program. See VISION.md for *why*, FEATURES.md for *what each part solves*.
Status: `done` (on main) · `in-flight` (planning/impl PR open) · `v2` (planned).

## v1 — the mechanized core

**Done (on main):** packet lifecycle · leases/takeover/recover · CLI-authored packets ·
CLI-captured evidence (D24) · real backups (VACUUM INTO + verified restore + configurable dir) ·
DB-rich model (body + deps in DB) · task import · status table · handoff · repo-state skill ·
role charters + reviewer-owns-merge + branch protection.

**In-flight (planning/impl PRs open):**
- Durability rails — rebuild + recovery-guard, migration-safety, backup-cadence, backup-filename fix.
- Store concurrency (shared store, WAL + transactions).
- Transition gates — write-set diff, verify-green, evidence-required, depends_on (mechanize what the agent must remember).
- CLI-sole-interface lint gate + PRINCIPLE-012.
- Typed tasks + auto-generated ids.
- check · instructions/mirrors · merge-close · worktree-hygiene.
- Doors: init · adopt (+ inventory fix from the first Aurora run).
- serve (minimal read-only board).
- Shareable core: taste ledger + opinion-free principle (PRINCIPLE-013).

**v1 exit:** Aurora adopted at TIER-3, agents implementing under full strictness, the founder
watching via serve — shipping without touching the code.

## v2 — optimize the flow & full transparency

Two goals: **(a) make the agent flow faster/cheaper/self-improving**, and **(b) give the human
total, second-by-second visibility.**

### Transparency & control (the human's window)
- **serve rich task detail** (`SERVE-DETAIL-001`) — open a task and see the live agent
  transcript, files being modified (+ scope compliance), event timeline, evidence, verify
  status, PR/CI, cost, health signal. The IDEA-045 operations-bar / activity-feed / escalations
  panel. Control buttons that call the CLI (dispatch/abort/takeover).
- **serve config page** — switch pipeline/autonomy modes, edit the constitution (writes via CLI).

### Planning & cadence (organize the work)
- **Roadmap as a first-class artifact** (`ROADMAP-CMD-001`) — a repo tracks phases/milestones → sprints → packets, viewable in serve.
- **Sprints** (`SPRINT-001`) — group packets into a sprint with a goal and a start/close.
- **Sprint retros** (`RETRO-001`) — generate a retrospective from the events table (blockers, deviations, verify cycles, rework, time-per-state, incidents→rails); feeds the learning loop.

### Self-improvement of the agent flow
- **Autonomous dispatch pipeline** (IDEA-027) — ready packet auto-dispatches; reviewer verdict routes automatically.
- **Auto-rotation on provider errors** (IDEA-044) · **model×role routing from observed rework** (IDEA-007).
- **Token economy** (IDEA-031) — prompt-cache-friendly ordering + per-session cost telemetry.
- **Type-specific rigor** (IDEA-005) — each packet type declares its required evidence/gates.
- **Notifications** (IDEA-004) — the human is pinged only when needed.

### Shareability (the product for others)
- **Config-ification** of every hardcoded opinion (guarded now by PRINCIPLE-013): the state
  machine (IDEA-046), roles, gates/thresholds + the module-layout rule, columns, packet types,
  tier definitions, the review checklist, dispatch routing.
- **MCP wrapper** auto-generated from `describe` (IDEA-018).

**Anti-sv-forge rule (PRINCIPLE-008):** v1 is used on a real project (Aurora) before v2 work
starts. The methodology is not a second product.
