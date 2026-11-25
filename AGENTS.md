# AI Record MoM Plugin — Agent Instructions

## Project overview

This project builds a browser extension that captures meeting audio, transcribes speech, and supports meeting minutes. The repository currently contains an extension, a Python STT service, and a sample NestJS API; do not assume target components are complete.

## Getting started

The expected onboarding command is:

```sh
make setup && make test
```

`make setup` installs Node and Python dependencies. The current Makefile does not define a `test` target; run the relevant package tests after setup and add a standard target when that workflow is implemented.

## Global non-negotiable rules

1. Read this file, the root README, and `docs/README.md` when present; verify code and manifests before treating a design as implemented.
2. For each task, read the applicable routed guides and inspect relevant code, tests, and decisions before editing.
3. Separate repository facts from proposals and assumptions; identify missing referenced documents instead of inventing settled content.
4. Keep changes scoped and consistent; do not add frameworks, services, databases, or infrastructure without justification and approval.
5. Never put secrets or sensitive meeting data in code, default logs, or documentation.
6. Preserve compatibility; change public interfaces or behavior only when requested or approved.
7. Mark proposals accepted only after user approval; record consequential architecture decisions in an ADR.
8. Do not infer speaker identity from login, channel labels, or mixed audio; preserve unknown attribution when evidence is insufficient.
9. Do not present contextual transcript correction as verbatim evidence; preserve raw text separately when designing persistence.
10. Preserve audio timing, ordering, and source metadata when available; consider backpressure, dropped/duplicate chunks, partial/final results, and reconnects.
11. Handle audio/transcripts with least privilege, consent, and appropriate retention; enable debug audio deliberately and with controls.
12. Prefer CPU-compatible STT for the MVP; do not assume a GPU is available.
13. Never report tests, lint, builds, or integrations as passing unless they were actually run and their results checked.
14. Respond in English by default; report changes, files, checks, limitations, and missing documentation.
15. Create a dedicated `todo/` file for defined tasks, keep it current, and delete only that task file after its deliverable and checks are complete.

## Topic guides

Read only the guides relevant to the task. A guide describing a target does not prove it is implemented.

| Guide | Read when |
| --- | --- |
| [Agent workflow](docs/agent-guides/workflow.md) | Starting any task that needs request classification, onboarding, implementation, or handoff. |
| [Sessions and task tracking](docs/agent-guides/session-and-tasks.md) | Any work session, defined task, session checkpoint, or `todo/` update. |
| [Progress and decisions](docs/agent-guides/session-and-tasks.md#start-and-end-checkpoints) | At the start and end of every session: update `PROGRESS.md` with current status, checks, blockers, and next steps; update `DECISION.md` with decisions, rationale, and approval status, or an explicit no-new-decision checkpoint. |
| [Architecture and boundaries](docs/agent-guides/architecture.md) | Analyzing or changing architecture or extension/API/AI/database boundaries. |
| [Audio and transcription](docs/agent-guides/audio-transcription.md) | Changing capture, PCM, WebSocket, VAD, queues, STT, timing, or audio debugging. |
| [Context and speakers](docs/agent-guides/context-speakers.md) | Changing glossary, terminology, participants, diarization, or speaker attribution. |
| [Documentation and decisions](docs/agent-guides/documentation-decisions.md) | Changing interfaces, behavior, deployment, canonical docs, or architecture decisions. |
| [Testing and conventions](docs/agent-guides/testing.md) | Choosing or reporting test, lint, or build commands. |

## Common development commands

- `make dev`: run services through the workspace configuration.
- `make dev-api`, `make dev-ext`, `make dev-ai`: run an individual service.
- See [agent workflow](docs/agent-guides/workflow.md) and [testing](docs/agent-guides/testing.md) for task-specific guidance.
