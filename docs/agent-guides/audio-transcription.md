# Audio and transcription

Read when changing capture, transport, buffering, VAD, transcription scheduling, inference, or output delivery.

Prioritize correctness, stability, and observability. Treat capture, transport, buffering, VAD, scheduling, inference, post-processing, and delivery as separate stages. Preserve timing, ordering, and source metadata when available. Consider backpressure, bounded queues, dropped or duplicate chunks, partial/final results, and reconnect behavior.

Do not treat language-model or contextual transcript correction as verbatim evidence. When designing persistence, keep raw text separate from corrected or enriched text. Do not silently change names, terminology, or speaker attribution without sufficient evidence.

The MVP direction favors CPU-compatible STT; do not assume a GPU. Handle audio and transcripts with consent, least privilege, and appropriate retention. Enable debug artifacts deliberately, limit them, and protect access. Check the current contract before changing the protocol.
