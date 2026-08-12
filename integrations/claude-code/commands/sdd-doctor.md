---
description: Diagnose repository prerequisites for Team SDD.
argument-hint: [delivery-id]
disable-model-invocation: true
---

# Team SDD: doctor

Run the repository-local diagnostic command `node ${CLAUDE_PROJECT_DIR}/dist/cli.js doctor --json`. A Delivery ID is optional and is not used to change diagnostic scope.

Present its JSON result and findings unchanged. Do not use `--fix`, alter repository configuration, edit Delivery metadata, or append workflow events.
