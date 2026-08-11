import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from faster_whisper import WhisperModel
from silero_vad import load_silero_vad

from src.config import config

log = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load models when server starts, release when it shuts down."""
    log.info(f"Loading Whisper model '{config.MODEL_SIZE}' on {config.DEVICE} ({config.COMPUTE_TYPE})...")
    
    whisper_model = WhisperModel(
        config.MODEL_SIZE,
        device=config.DEVICE,
        compute_type=config.COMPUTE_TYPE,
    )
    # Save to app state for controllers/services to use
    app.state.whisper_model = whisper_model
    log.info("Whisper model is ready!")

    log.info("Loading Silero VAD model...")
    vad_model = load_silero_vad()
    app.state.vad_model = vad_model
    log.info("VAD model is ready!")

    yield  # Server is running

    log.info("Server is shutting down, releasing resources...")
    app.state.whisper_model = None
    app.state.vad_model = None
