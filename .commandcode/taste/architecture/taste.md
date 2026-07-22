# architecture
- Store all data in SQLite database, never in markdown files (no front matter, no `.md` documents). Confidence: 0.90
- Keep playbook data gitignored and fully independent from git. Confidence: 0.80
- Design playbook as project-agnostic with no language-specific dependencies (even non-code projects). Confidence: 0.80
- Decouple the state machine (core) from addons (agentic integration, frontend, etc.) so each can work independently. Confidence: 0.75
- Make the system highly configurable so users adapt it to their needs, not the reverse. Confidence: 0.75
- Use configuration files (not CLI commands) for app configuration. Confidence: 0.75
- Do not rename concepts that should be similar (e.g. keep "packet" naming consistent with familiar systems). Confidence: 0.70
