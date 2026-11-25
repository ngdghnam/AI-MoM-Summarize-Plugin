# Conventions and testing

Read when choosing test, lint, or build commands, or when a change needs verification.

Choose checks based on the affected package and scope. Inspect root and package scripts and service guidance before running them. Record the exact command, date, scope, and result in `PROGRESS.md`; do not infer that the whole monorepo passes from a single package.

The root `Makefile` currently has `setup`, `setup-python`, `dev`, and per-app development targets, but no `test` target. Therefore `make setup && make test` is the desired onboarding command but does not currently run as written; adding a test target is separate work. Do not report lint or typecheck as passing unless run. Avoid tests that merely mirror implementation; prefer meaningful behavior checks.
