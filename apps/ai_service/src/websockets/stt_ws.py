import logging
import asyncio
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.services.stt_service import STTService
from src.utils.audio_diagnostics import AudioDiagnostics
from src.config import config

log = logging.getLogger(__name__)
router = APIRouter()

@router.websocket("/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    """
    WebSocket endpoint receiving PCM Stereo audio stream from the Extension.
    """
    await websocket.accept()
    log.info("Extension connected!")

    # Get models from app.state
    whisper_model = websocket.app.state.whisper_model
    vad_model = websocket.app.state.vad_model

    # Initialize service for this connection
    diagnostics = AudioDiagnostics(config.SAMPLE_RATE)
    stt_service = STTService(whisper_model, vad_model, diagnostics)
    diagnostics.event("session_start", sample_rate=config.SAMPLE_RATE, channels=2, encoding="pcm_s16le",
                      config={key: value for key, value in vars(config).items()
                              if key.isupper() and key != "INITIAL_PROMPT"},
                      initial_prompt_configured=config.INITIAL_PROMPT is not None)

    # Keep receiving while inference runs. Bound queued PCM to 30 seconds.
    queue = asyncio.Queue()
    queued_bytes = 0
    max_queued_bytes = 16000 * 2 * 2 * 30
    received_samples = 0
    sequence = 0
    outcome = "disconnected_incomplete"
    active_chunk = None

    async def receive_audio():
        nonlocal queued_bytes, received_samples, sequence, outcome
        while True:
            raw_bytes = await websocket.receive_bytes()
            received_at = time.monotonic()
            if len(raw_bytes) % 4:
                outcome = "invalid_format"
                diagnostics.event("format_error", bytes=len(raw_bytes))
                await websocket.close(code=1003, reason="Expected complete PCM16LE stereo frames")
                return
            sequence += 1
            start = received_samples
            received_samples += len(raw_bytes) // 4
            diagnostics.received(raw_bytes, start, received_at)
            diagnostics.event("received", sequence=sequence, start_sample=start,
                              end_sample=received_samples, bytes=len(raw_bytes))
            if queued_bytes + len(raw_bytes) > max_queued_bytes:
                outcome = "overloaded_incomplete"
                diagnostics.event("overflow", rejected_samples=len(raw_bytes) // 4)
                log.warning("STT cannot keep up: audio backlog exceeded 30 seconds.")
                await websocket.close(code=1013, reason="STT processing overloaded")
                return
            queued_bytes += len(raw_bytes)
            queue.put_nowait((raw_bytes, received_at, start))
            diagnostics.event("backlog", audio_s=queued_bytes / (config.SAMPLE_RATE * 4))

    async def process_audio():
        nonlocal queued_bytes, active_chunk
        while True:
            raw_bytes, received_at, start = await queue.get()
            queued_bytes -= len(raw_bytes)
            active_chunk = {"start_sample": start, "end_sample": start + len(raw_bytes) // 4}
            diagnostics.event("dequeued", **active_chunk, queue_wait_s=time.monotonic() - received_at,
                              backlog_audio_s=queued_bytes / (config.SAMPLE_RATE * 4))
            await stt_service.process_chunk(raw_bytes, websocket)
            diagnostics.event("chunk_processed", **active_chunk,
                              receive_to_processed_s=time.monotonic() - received_at)
            active_chunk = None

    tasks = [asyncio.create_task(receive_audio()), asyncio.create_task(process_audio())]

    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()

    except WebSocketDisconnect as exc:
        log.info("Extension disconnected: code=%s reason=%s", exc.code, exc.reason)
    except Exception as e:
        outcome = "processing_error_incomplete"
        log.error(f"Error during processing: {e}", exc_info=True)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        diagnostics.event("session_end", outcome=outcome, received_samples=received_samples,
                          queued_samples=queued_bytes // 4, active_chunk=active_chunk)
        diagnostics.event("pending_state", **stt_service.diagnostic_state())
        diagnostics.close()
        # A disconnected client cannot receive final captions. Do not run more
        # inference or attempt sends for audio left in this session.
        try:
            await websocket.close()
        except Exception:
            pass
