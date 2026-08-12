---
description: Diagnose Team SDD repository health and report its governed repair path.
allowed-tools: Bash(node dist/cli.js doctor --json)
disable-model-invocation: true
---

# Team SDD: doctor

Run exactly `node dist/cli.js doctor --json` from the active workspace root, using only the narrowly scoped Bash permission declared above. This is read-only diagnostics: do not add flags, use shell operators, or use `--fix`.

Present its JSON result, findings, or error unchanged. If diagnostics return findings or an error, direct the user to `/sdd-doctor` for repository diagnostics, then perform only the next repair step it reports. Do not mutate Delivery state, metadata, approvals, or events directly.
