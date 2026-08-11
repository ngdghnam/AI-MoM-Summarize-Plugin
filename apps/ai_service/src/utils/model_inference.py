import torch
import numpy as np
from faster_whisper import WhisperModel
from silero_vad import get_speech_timestamps

from src.config import config

def has_voice_activity(audio_float32: np.ndarray, vad_model) -> bool:
    """
    Check if the audio segment contains voice (using Silero VAD).
    """
    audio_tensor = torch.from_numpy(audio_float32)
    timestamps = get_speech_timestamps(
        audio_tensor,
        vad_model,
        sampling_rate=config.SAMPLE_RATE,
        threshold=0.7,
        min_speech_duration_ms=300,
    )
    return len(timestamps) > 0

def transcribe_audio(audio_float32: np.ndarray, whisper_model: WhisperModel) -> str:
    """
    Transcribe voice from float32 audio array, returns text string.
    """
    segments, _ = whisper_model.transcribe(
        audio_float32,
        language=config.LANGUAGE,
        beam_size=3,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    return " ".join(seg.text.strip() for seg in segments).strip()
