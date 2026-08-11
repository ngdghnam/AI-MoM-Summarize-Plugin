import json
import datetime
import numpy as np

def deinterleave_stereo(raw_bytes: bytes) -> tuple[np.ndarray, np.ndarray]:
    """
    Split a PCM Stereo stream (16-bit, interleaved) into 2 independent Mono channels.
    - Left channel (even index): YOUR audio (Microphone)
    - Right channel (odd index): OTHER'S audio (Tab audio)

    Returns: (left_float32, right_float32) - float32 arrays in range [-1.0, 1.0]
    """
    pcm = np.frombuffer(raw_bytes, dtype=np.int16)
    left_int16 = pcm[0::2]
    right_int16 = pcm[1::2]

    left_float = left_int16.astype(np.float32) / 32768.0
    right_float = right_int16.astype(np.float32) / 32768.0

    return left_float, right_float

def build_response(channel: str, text: str) -> str:
    """Create JSON response to send back to the Extension."""
    speaker = "You" if channel == "left" else "Others"
    return json.dumps({
        "channel": channel,
        "speaker": speaker,
        "text": text,
        "timestamp": datetime.datetime.now().isoformat(),
    }, ensure_ascii=False)
