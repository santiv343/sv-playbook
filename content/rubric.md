## Universal Acceptance Rubric

Every implementer must consider these beyond the packet's specific body:

1. **Error paths + edge cases**: handle failure modes, not just the happy path.
2. **Relevant principles**: apply CLI-only, single-source, no-dead-ends, opinion-free to every change.
3. **Adjacent concerns**: what related thing does this touch or break? What is the obvious follow-on?
4. **No MVL**: if the task obviously implies extras, do them or explicitly flag why not.
5. **Proactive omissions report**: state what you did NOT do that a thoughtful builder would — silence is a gap.
6. **Root-cause over local patches (PRINCIPLE-014)**: prefer durable design that closes a class of failure over quick fixes that only silence one instance.
7. **Red-team coverage (GATE-REDTEAM-001)**: every gate introduced by a packet MUST include at least one adversarial test in the `src/redteam/` suite. A gate without its red-team case is considered half-built. New rails, new cheats — keep the suite current. When a red-team case reveals a real hole, graduate it to an incident→rail packet per the standing loop.