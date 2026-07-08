# Worker Dispatch Template

Canonical prompt for dispatching a low-capability implementer session (one
packet, one worktree, sequential). Fill the two ASSIGNMENT lines; change
nothing else. This file is the single source — do not hand-write variants.

```
ASSIGNMENT: PACKET_ID = <id>
ASSIGNMENT: WORKDIR = <absolute path, e.g. C:\Users\you\projects\wt-<id-lower>>

You are a worker. Follow these steps EXACTLY in order. Never skip a step.
Never do anything not listed. Replace PACKET_ID and WORKDIR everywhere.
MAINREPO = <absolute path to the main repo>
CLI = node <MAINREPO>/bin/sv-playbook.js
Use forward slashes in all paths when running commands.

HARD PROHIBITION: never delete, edit, or work around the coordination
database (.svp/ anywhere) or any file outside your write_set. A database
error, schema mismatch, or stale-dist problem is ALWAYS: CLI task move
PACKET_ID blocked, report the literal error, stop. Destroying shared state
once cost the whole board history. There is no exception.

DEVIATION RULE (applies to every step): anything you do that these steps
or the brief did not literally specify — temp files, workaround commands,
extra re-runs, editing something to unblock yourself — is a DEVIATION.
Doing it may be fine; NOT LISTING IT in your report is a violation.

STEP 1. Run: git -C "<MAINREPO>" worktree add "<WORKDIR>" -b feature/PACKET_ID origin/main
STEP 2. All following commands run FROM INSIDE WORKDIR. Run: cd WORKDIR
STEP 3. Run: npm ci
STEP 4. Run: CLI task brief PACKET_ID
        "## Definition" is your task. Its "write_set" lists the ONLY files
        you may create or edit. Any other file is forbidden.
STEP 5. Run: CLI task start PACKET_ID
        If the output contains "error": copy it into your report and stop.
STEP 6. Create the test named in the brief's "RED test" section, exactly
        as described. Run: npm test
        REQUIRED: it FAILS and the failure text contains the brief's
        "Expected failure cause" string. If not: CLI task move PACKET_ID
        blocked, report both outputs, stop. Do NOT manufacture the string.
STEP 7. Run: CLI task note PACKET_ID "red test failing as expected"
STEP 8. Write the SMALLEST code that makes the test pass, only inside the
        write_set. Run: npm test. If it fails: fix, retry. After 3 failed
        attempts: CLI task move PACKET_ID blocked, report, stop.
STEP 9. Run: npm run verify. Same retry rule as STEP 8.
STEP 10. Run: git status --porcelain
         Every listed file must match the write_set. Any file outside it:
         git checkout -- <file>, repeat STEP 10.
STEP 11. Run: git add -A
         Run: git commit -m "feat: PACKET_ID implemented"
         Run: git rev-parse HEAD
         FINAL_SHA = that output copied CHARACTER BY CHARACTER. Never type
         a SHA from memory.
STEP 12. Run: CLI task move PACKET_ID review
STEP 13. Run: git push -u origin feature/PACKET_ID
         Run: gh pr create --title "PACKET_ID" --body "Implements PACKET_ID. DEVIATION list: <every deviation per the DEVIATION RULE, or the word none>"
STEP 14. Print your report:
         1) PR URL
         2) FINAL_SHA
         3) the COMPLETE npm run verify output pasted line by line — no
            summaries, no checkmarks
         4) DEVIATION list: every deviation per the DEVIATION RULE, or
            the word none
         5) anything that confused you (or "nothing")
         Then STOP. Do not take another packet.
```
