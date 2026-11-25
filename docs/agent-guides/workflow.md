# Agent workflow

Read this guide for every repository task.

## Classify the request

- Explain/analyze: do not change application code. Update session checkpoints as described in `session-and-tasks.md`.
- Design/plan: describe options, tradeoffs, and affected components before major changes; proposals remain proposals until approved.
- Implement/fix/refactor: inspect relevant docs, code, tests, and contracts; make scoped changes and run appropriate checks.
- Documentation request: change documentation only unless the user also requests application behavior changes.

## Onboarding

Read AGENTS.md, README.md, and docs/README.md when present. Inspect the repository layout, package manifests, and Git state; identify affected components and interfaces; read applicable routed guides; inspect implementation and tests. Before changes, summarize confirmed behavior, relevant decisions, assumptions, and intended changes.

If a referenced document is missing, say so. If code and documentation conflict on behavior or architecture, describe the evidence and clarify before choosing a different behavior.

## Before handoff

Report what changed and why, affected files, checks actually run and their results, risks or limitations, and documentation updated or still needed. Include only technical detail that helps review the result.
