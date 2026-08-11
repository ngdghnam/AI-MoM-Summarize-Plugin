import logging
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

    try:
        while True:
            raw_bytes = await websocket.receive_bytes()
            await stt_service.process_chunk(raw_bytes, websocket)

    except WebSocketDisconnect:
        log.info("Extension disconnected.")
    except Exception as e:
        log.error(f"Error during processing: {e}", exc_info=True)
    finally:
        log.info("Flushing remaining audio buffers...")
        await stt_service.flush_all(websocket)
        try:
            await websocket.close()
        except Exception:
            pass
