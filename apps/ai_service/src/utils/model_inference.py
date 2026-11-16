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
        threshold=config.VAD_THRESHOLD,
        min_speech_duration_ms=config.VAD_MIN_SPEECH_MS,
    )
    return len(timestamps) > 0

def transcribe_audio(audio_float32: np.ndarray, whisper_model: WhisperModel) -> str:
    """
    Transcribe voice from float32 audio array, returns text string.
    """
    segments, _ = whisper_model.transcribe(
        audio_float32,
        task="transcribe",
        language=config.LANGUAGE,
        beam_size=config.BEAM_SIZE,
        initial_prompt=config.INITIAL_PROMPT,
        # The streaming service already performs VAD and retains speech padding.
        vad_filter=False,
        condition_on_previous_text=False,
    )
    return " ".join(seg.text.strip() for seg in segments).strip()
