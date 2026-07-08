# sv-playbook

An end-to-end methodology for building software with AI agents — from raw
idea to finished product — packaged as a markdown constitution plus a
verifier CLI. Agent-agnostic, project-agnostic, deterministic wherever
possible.

**Status: pre-release. The design is stable; the CLI is under construction.**

## Why

Everything that works with agents is mechanized; everything left as prose
gets violated. The playbook is two layers with a hard boundary:

- **The constitution** — process documents and templates (this package's
  `content/`). Gives capable models judgment.
- **The police** — this CLI. Verifies, scaffolds, and tracks state. It
  verifies; it never decides.

Design spec: [`docs/specs/2026-07-07-sv-playbook-design.md`](docs/specs/2026-07-07-sv-playbook-design.md)

## Use

```sh
npx sv-playbook docs            # list process topics
npx sv-playbook docs principles # read the principles
npx sv-playbook docs cli        # when/why for each command
npx sv-playbook task create --id P2-101 --title "Do work" --write "src/**" --body-file body.md
npx sv-playbook task list --json
npx sv-playbook task start P2-101
npx sv-playbook task move P2-101 review
npx sv-playbook task brief P2-101
npx sv-playbook task takeover P2-101 --force
```

## Development

Node >= 22.13. `npm install`, then `npm run verify` (typecheck + lint +
build + tests). CI runs the same on Windows and Linux.

## License

MIT
