import logging
from fastapi import FastAPI

from src.core.lifespan import lifespan
from src.controllers.stt_controller import router as stt_router
from src.websockets.stt_ws import router as ws_router
from src.config.settings import settings

# ------------------------------------
# Logging
# ------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# ------------------------------------
# FastAPI App
# ------------------------------------
app = FastAPI(
    title="AI Mom - STT Service",
    description="Real-time Speech-to-Text via WebSocket using faster-whisper",
    version="1.0.0",
    lifespan=lifespan,
)

# Include Routers
app.include_router(stt_router)
app.include_router(ws_router, prefix="/ws")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host=settings.HOST, port=settings.PORT, reload=True)