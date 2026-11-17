# AI Record MoM Plugin — Agent Instructions

## 1. Purpose

This file is the entry point for AI coding agents working on the AI Record MoM Plugin project. Follow the existing code and maintained documentation, rather than assuming proposed designs have already been implemented.

The product aims to capture meeting audio from a browser extension, transcribe speech accurately, associate utterances with speakers where evidence permits, and produce useful meeting minutes.

## 2. Mandatory onboarding before changes

Before proposing or editing code:

1. Read this `AGENTS.md` completely.
2. Read `README.md` and `docs/README.md` if they exist.
3. Inspect the actual repository layout and relevant package manifests.
4. Identify which components and interfaces the task affects.
5. Read the relevant documents listed in the documentation routing table below.
6. Inspect existing implementation and tests before suggesting changes.
7. Summarize the current behavior, relevant documented decisions, assumptions, and intended change.

If a referenced document does not exist, say so explicitly. Never invent its contents. If code conflicts with documentation, identify the discrepancy and ask for direction when it changes behavior or architecture.

## 3. Documentation routing

The following paths describe the intended documentation structure. Check existence before reading.

| Task | Read first |
| --- | --- |
| General architecture, deployment, boundaries | `docs/architecture/overview.md` |
| Browser extension, Google Meet integration, capture | `docs/architecture/extension.md` |
| NestJS API, authentication, authorization, identity | `docs/architecture/backend.md` |
| Python inference and AI processing | `docs/architecture/ai-service.md` |
| Audio transport, VAD, buffering, queues, WebSocket, STT | `docs/architecture/audio-pipeline.md`, `docs/features/transcription.md` |
| Context enhancement, names, terminology, dictionary | `docs/architecture/context-engine.md`, `docs/features/glossary.md` |
| Speaker attribution and meeting participants | `docs/architecture/speaker-identification.md` |
| Minutes and summaries | `docs/features/meeting-summary.md` |
| Existing architectural decisions | `docs/decisions/README.md` and applicable ADRs |
| Conventions and tests | `docs/development/conventions.md`, `docs/development/testing.md` |

Read only task-relevant documents plus their explicit dependencies. For cross-service changes, read the relevant documents for every affected service.

## 4. Architectural context and boundaries

The discussed target architecture includes:

- **Browser extension:** meeting integration and permitted audio capture, plus UI and client-side coordination.
- **NestJS API:** intended application backend for authenticated users, meeting lifecycle, access control, and persisted application data.
- **Python AI service:** speech-to-text and AI processing, with context-aware transcription and meeting summarization.
- **Database:** intended persistent storage for application records, dictionaries, glossaries, and meeting metadata.

These are design directions, not proof of what is implemented. Verify the repository before treating a component as operational.

Do not assume NestJS can identify speakers merely because users are authenticated. Distinguish authenticated account identity, meeting participant identity, audio-source identity, diarization speaker labels, and verified speaker attribution. Document uncertainty and do not fabricate participant-to-voice mappings.

Do not assume Google Meet exposes participant identities or isolated per-participant audio streams to the extension. Confirm available permissions, APIs, and actual capture behavior first.

## 5. Audio and transcription principles

- Prioritize correctness, stability, and observability before premature optimization.
- Current MVP discussions emphasize CPU-compatible STT; do not assume a GPU is available.
- Treat capture, audio transport, buffering, voice activity detection, transcription scheduling, inference, post-processing, and output delivery as separate stages.
- Preserve audio timing, ordering, and relevant speaker/source metadata when available.
- Consider backpressure, bounded queues, dropped chunks, duplicate segments, partial/final results, and reconnect behavior.
- Do not present language-model correction or contextual rewriting as verbatim audio evidence.
- Preserve raw transcription separately from corrected/enriched transcription when designing persistence.
- Never silently change names, technical terms, or attributed speakers without sufficient evidence.

## 6. Context and speaker intelligence

- Aim for automatic discovery of meeting context and participants when technically and legally available; do not require users to enter all participant names manually.
- Allow optional user-configured context and terminology.
- Use a glossary/dictionary as supporting evidence, not an unconditional replacement list.
- Distinguish speaker diarization (`speaker_1`, `speaker_2`) from real-world identity attribution.
- Provide confidence/unknown states where identity or transcription is uncertain.
- Apply least privilege and appropriate consent, retention, and access controls to meeting audio, transcripts, and participant metadata.

## 7. Agent execution rules

### Request classification

- **Explain / analyze / discuss:** do not edit files or run destructive commands.
- **Design / plan:** provide alternatives, trade-offs, affected components, and a proposed approach before implementation.
- **Implement / fix / refactor:** inspect docs and code, make scoped changes, and run relevant checks.
- **Documentation request:** produce or update the requested documentation; do not silently change application behavior.

If the user's instruction is ambiguous about editing code, ask before making significant changes.

### Before implementation

1. State which docs and code paths were inspected.
2. Identify confirmed behavior versus assumptions or proposals.
3. Check applicable ADRs and service contracts.
4. For cross-service or architectural changes, explain the plan and obtain approval before large-scale changes.

### During implementation

- Keep changes minimal, cohesive, and consistent with existing conventions.
- Do not introduce a new framework, database, service, queue, or infrastructure dependency without justification and approval.
- Do not hardcode credentials, secrets, or sensitive meeting data.
- Preserve compatibility unless a breaking change is explicitly approved.
- Add or update relevant tests for changed behavior.

### After implementation

Report:

1. What changed and why.
2. Files changed.
3. Tests/checks run and their results (or why they could not run).
4. Risks, unresolved questions, and assumptions.
5. Documentation updated or documentation changes still needed.

## 8. Documentation maintenance

When implementation changes an interface, behavior, deployment requirement, data contract, or architectural decision, update the relevant documentation in the same change.

Use ADRs for consequential decisions. An ADR should include context, decision, alternatives, consequences, and status (`proposed`, `accepted`, `superseded`). Do not mark a proposal accepted without user approval.

Avoid duplicating long architecture descriptions in this file; link to the canonical document instead. If documentation is missing, propose the missing file rather than fabricating a settled design.

## 9. Communication

- Respond in Vietnamese by default unless the user asks otherwise.
- Be explicit, technical, and clear about trade-offs.
- Separate observed repository facts from recommendations.
- Do not claim to have read documents, run tests, or verified integration unless that actually happened.
- Ask focused questions only when an answer materially affects correctness or the chosen architecture.

## 10. Definition of done

A task is complete only when the requested deliverable is provided, relevant checks have been performed or limitations reported, and any affected documentation is updated or explicitly identified as pending.

### Task tracking in `todo/`

- Before starting a defined task, create a separate Markdown file in the repository-root `todo/` directory. Use an ordered, descriptive filename such as `01-audio-contract-baseline.md`.
- Each task file must state its objective, status, dependencies, affected components, actionable checklist, and acceptance criteria. Distinguish proposed behavior from implemented behavior.
- Each task file must include a short `Context` section explaining the observed problem, why this task is needed in the overall plan, relevant code/document references, and scope boundaries. It must be understandable without rereading the conversation. Update this context when dependencies or decisions change; do not describe planned dependency outputs as already implemented.
- Keep the file updated as work progresses, including check results, blockers, and remaining work. Split newly defined tasks into their own files.
- Delete only that task's file after its deliverable, checks, and required documentation are complete. Do not delete unfinished or blocked task files, and do not delete the entire `todo/` directory.
- Before deletion, retain durable interface/behavior decisions in the relevant project documentation and report the outcome and verification to the user. Todo files are temporary work tracking, not canonical documentation.
