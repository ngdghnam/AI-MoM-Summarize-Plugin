# Architecture and boundaries

Read when analyzing or changing architecture, services, deployment, APIs, or data. The following are intended directions, not proof of implementation; verify the repository.

- Browser extension: meeting integration, permitted audio capture, UI, and client-side coordination.
- NestJS API: intended authenticated backend for meeting lifecycle, access control, and application data.
- Python AI service: speech-to-text and AI processing.
- Database: intended storage for application data, glossaries, and meeting metadata.

Do not assume the extension can access participant identities or isolated per-participant audio from Google Meet; verify permissions, APIs, and actual capture behavior. Distinguish authenticated accounts, meeting participants, audio sources, diarization labels, and verified identities. NestJS authentication alone does not establish who is speaking.

For cross-service changes, read the contracts and docs for every affected service. Explain and obtain approval for major architecture changes. Do not add frameworks, databases, queues, services, or infrastructure without justification and approval.
