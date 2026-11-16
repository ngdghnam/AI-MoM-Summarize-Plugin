import logging
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.services.stt_service import STTService

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
    stt_service = STTService(whisper_model, vad_model)

    # Keep receiving while inference runs. Bound queued PCM to 30 seconds.
    queue = asyncio.Queue()
    queued_bytes = 0
    max_queued_bytes = 16000 * 2 * 2 * 30

    async def receive_audio():
        nonlocal queued_bytes
        while True:
            raw_bytes = await websocket.receive_bytes()
            if queued_bytes + len(raw_bytes) > max_queued_bytes:
                log.warning("STT cannot keep up: audio backlog exceeded 30 seconds.")
                await websocket.close(code=1013, reason="STT processing overloaded")
                return
            queued_bytes += len(raw_bytes)
            queue.put_nowait(raw_bytes)

    async def process_audio():
        nonlocal queued_bytes
        while True:
            raw_bytes = await queue.get()
            queued_bytes -= len(raw_bytes)
            await stt_service.process_chunk(raw_bytes, websocket)

    tasks = [asyncio.create_task(receive_audio()), asyncio.create_task(process_audio())]

    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()

    except WebSocketDisconnect as exc:
        log.info("Extension disconnected: code=%s reason=%s", exc.code, exc.reason)
    except Exception as e:
        log.error(f"Error during processing: {e}", exc_info=True)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        # A disconnected client cannot receive final captions. Do not run more
        # inference or attempt sends for audio left in this session.
        try:
            await websocket.close()
        except Exception:
            pass
