import logging
from fastapi import APIRouter

from src.config import config

log = logging.getLogger(__name__)
router = APIRouter()

@router.get("/health")
def health():
    return {"status": "ok", "model": config.MODEL_SIZE, "language": config.LANGUAGE}

