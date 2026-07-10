# Vision — what sv-playbook is and why it exists

> The preserved source of the product's *why*. QUICKSTART.md is HOW you use and relieve the
> roles; how-it-works.md is HOW the machine works; **this is WHY the machine is shaped the way
> it is.** A PM (human or agent) reads this to inherit the product's mind. Nothing important
> about the vision lives only in a chat or one person's memory (PRINCIPLE-003).

## The thesis

sv-playbook is a system for **encoding a builder's judgment — product and engineering — into
layered, versioned, mechanically-enforced rules and taste, so a team of agents can execute
that intent at scale: consistently, learning from every error, and needing the human only for
genuinely new judgment, which it then absorbs.**

It is not "a Jira with agents." It is the substrate that lets a person build software through
agents without the quality collapsing to the agents' floor.

## The pattern it makes explicit

Everything here was discovered by repeating one loop until it became a system:

- An agent does something wrong (fabricates a SHA, wanders scope, deletes state, forgets to close).
- Instead of scolding, we build a **rail** so it can't happen again.
- The rail is mechanical, so it doesn't depend on any agent remembering or being honest.

**Incident → rail.** Every feature in FEATURES.md exists because a real problem demanded it.
The product is the accumulation of those rails plus the encoded judgment behind them.

## Three embodiments of one mind

The roles are not a division of labor — they are the builder's judgment, specialized:

| Role | Is the builder's… | Holds |
|------|-------------------|-------|
| **PM** | product brain | what to build, why, priorities, what's shippable, which tier |
| **TL / orchestrator** | engineering brain | how to build, the quality bar, conventions, the rails |
| **Implementers / reviewers** | hands & conscience | execute the rails; catch violations |

The layers **review each other** — each sees the others' blind spots (PM over-scopes → TL
pushes back; TL over-engineers → PM pushes back on value; implementers surface ground truth →
the plan changes). One judgment, triangulated by three specialists.

## The two pillars

1. **Encode the judgment (the taste ledger).** What the builder likes, would say yes/no to,
   values — becomes first-class, consultable, versioned data that review enforces. It stops
   living in a head or an agent's memory. Every decision is captured as a reusable preference;
   never asked twice. The human's involvement asymptotically approaches zero.

2. **Opinion-free core (shareability).** For this to be a product and not one person's tool,
   the **engine** carries no personal opinion. Everything that is an opinion — the workflow,
   kanban columns, roles, gates and thresholds, packet types, tier definitions, taste, agent
   routing — is **configuration with a single source of truth**. The engine ships opinion-free;
   each instance configures its own **constitution**. Two people share the engine and differ
   only in their constitution. The configurator is an **agent**: a person tells an agent to
   install and configure playbook, so config is CLI-driven, discoverable, validated, defaulted.

## The maturity ladder

Every rule travels: **prose** (an agent must remember) → **gate** (the CLI enforces) →
**config** (each instance chooses). Only *opinions* reach the config rung; universal
**invariants** stay in the engine. Where a rule sits tells you its next move. Most of the
early work is prose → gate; making the product shareable is gate → config.

## The invariants (the engine's spine — never configurable)

- **The CLI is the sole interface.** Operational state is never read or written directly — by
  agents or the orchestrator. If the CLI can't do something, that's a gap (a packet), never a
  shortcut.
- **Verify, never trust.** The CLI captures evidence and runs the checks itself; an agent's
  self-report is never believed. Verify beats assertion, always.
- **No dead ends.** Every error has a non-destructive exit. Durability is backups (primary) +
  a git reconstruction floor; the CLI never destroys state.
- **Everything in the repo.** The board (SQLite), definitions, code, decisions, vision — all
  durable. Nothing important lives only in a chat.
- **Single source for every fact.**

## The north star

- **Human touches per unit of work → 0.** Measured by escalations trending down as judgment
  is absorbed.
- **The moat is the accumulated judgment**, not the CLI code. A competitor copies the code;
  they cannot copy the rails-born-of-incidents and the encoded taste. The longer it runs, the
  more irreplaceable it becomes.
- **The founder can ship what the agents built without having touched the code** — and it
  meets their bar. The day that's true, the product has proven itself.

## The proving ground

**Aurora, at TIER-3 (maximum strictness, zero exceptions), is the test.** Applying the fully
mechanized, fully strict engine to the real product answers the only question that matters:
does the encoded judgment produce something the builder would ship? If yes, the thesis holds.

## Real-time transparency (a first-class requirement, not a nicety)

The builder must be able to see what every agent is doing **second by second** — the board,
each task, and on opening a task: the live agent transcript, the files being modified (and
whether they stayed in scope), the event timeline, evidence captured, verify status, the PR
and its CI, cost, and a health signal. The rich DB exists precisely so `serve` can render this.
"I need real data all the time" is a requirement, because trust comes from visibility, not faith.
