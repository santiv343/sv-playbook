<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: LANGUAGE-POLICY-001
title: language policy: configurable chat, artifact, and code languages with strict gates
depends_on: ["CLI-CONFIG-001","TASK-CORE-DB-001"]
write_set: ["src/language/policy.ts","src/language/policy.types.ts","src/language/policy.test.ts","src/config.ts","src/config.types.ts","src/config.constants.ts","src/tasks/service.ts","src/tasks/service.test.ts","content/language.md","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Make language policy configurable and strict. The playbook must not hardcode "all English" or allow mixed-language artifacts by convention. It must separate human conversation language from authored artifact language and enforce the configured policy mechanically.

Implement language policy with these concepts:
1. `chat_language`: the language agents use when reporting to the human.
2. `artifact_language`: the language for authored project artifacts: packet titles/bodies, docs, role charters, PR bodies, and generated instruction mirrors.
3. `code_language`: the language for code identifiers, comments, and technical naming; default `en`.
4. `allowed_mixed_language`: explicit exceptions such as proper nouns, file paths, commands, literal command output, quoted user text, IDs, and configured terms.

For sv-playbook dogfood, the default profile is:
- `chat_language = es`
- `artifact_language = en`
- `code_language = en`

Add a deterministic language check:
- `task move <id> ready` refuses packet definitions that mix languages outside the configured exceptions.
- The refusal names the field/file and the violating text fragment category; it must not rely on vague reviewer judgment.
- `check` / docs validation should be able to reuse the same single language-policy source once `CHECK-001` exists.
- Existing mixed-language packets should not be silently normalized outside their write_set. They are either amended through the CLI or reported as remediation work.

The implementation may start with a conservative detector: clear Spanish function words in an English artifact, clear English function words in a Spanish artifact, and explicit mixed-language markers. False positives must have a documented escape hatch through configured terms/exceptions, not inline suppressions.

## RED test (write first)
Add a task/service or language-policy test named exactly: "task move ready refuses a packet that mixes artifact languages".

Create a fixture config with `artifact_language = "en"` and a draft packet whose title/body mixes English and Spanish outside configured exceptions. Attempt `task move <id> ready` and assert:
- the command exits non-zero;
- the packet remains draft;
- the error names the language-policy violation;
- an allowed proper noun/path/command fragment does not trigger the violation.

Expected failure cause (literal string in the output): the test name "task move ready refuses a packet that mixes artifact languages".

## Reuse
`loadConfig` and config validation; `movePacket` ready transition; packet body/title reads from the DB; `CHECK-001` as the future shared check surface; `PACKET-AUTHORING-GATE-001` for authoring-quality gate composition.

## Stop conditions
Hardcoding English as the only possible artifact language; mixing conversation language with artifact language; accepting inline suppressions instead of configured exceptions; silently rewriting packet language; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
