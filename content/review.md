# Reviewer Checklist

Run on EVERY pull request, in full, by the human or reviewer agent. Items
here cannot be validated mechanically — that is why they exist. Anything
that becomes mechanizable graduates to a lint/gate and leaves this list.

## Hard rules — any hit is an INSTANT REQUEST CHANGES, no weighing
- [ ] Single source (PRINCIPLE-011), concept-wide: no fact defined twice — no duplicated type unions, scattered domain literals, parallel lists, half-applied constants, copy-pasted config, restated rules. If two places must change together, it is one hit.
- [ ] Any suppression, gate weakening, or baseline added.
- [ ] Any claim without literal command output.

## Code judgment
- [ ] Names say what things are; an outsider understands each public name at sight.
- [ ] Dispatch/branching uses lookup tables once past ~3 branches.
- [ ] No reinvented wheels: prefer stdlib/established solutions within the dependency policy.
- [ ] Abstractions are earned: no speculative interfaces, wrappers, or "just in case" layers.
- [ ] Errors expected by contract return codes/results; broken invariants throw.

## Test quality (anti TDD-theater)
- [ ] Each RED test fails for the named functional cause, not incidentally.
- [ ] Tests would catch a plausible regression (not vacuous, not tautological).
- [ ] Edge and failure paths outweigh happy paths in new coverage.

## Scope and evidence
- [ ] Diff stays inside the declared write-set; every DEVIATION is recorded with rationale.
- [ ] Evidence quotes literal command output; SHAs come from git, not memory.
- [ ] Docs the change makes stale are updated in the same PR.

## Taste pass
- [ ] Read the user's global + project taste files; flag anything that violates
      an entry, and propose new taste entries for corrections the review makes.
