"""Content-free pipeline events and opt-in, bounded local audio artifacts."""
import json
import logging
import os
import time
import uuid
import wave
from collections import deque
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)


def levels(audio):
    x = np.asarray(audio, dtype=np.float64)
    return {
        "samples": int(x.size),
        "rms": float(np.sqrt(np.mean(x * x))) if x.size else 0.0,
        "peak": float(np.max(np.abs(x))) if x.size else 0.0,
        "clipping_ratio": float(np.mean((x <= -1) | (x >= 32767 / 32768))) if x.size else 0.0,
    }


class AudioDiagnostics:
    def __init__(self, sample_rate=16000, debug=None, root=None, max_bytes=None, max_seconds=None):
        self.session_id = uuid.uuid4().hex
        self.sample_rate = sample_rate
        self.started = time.monotonic()
        self.chunk_times = deque(maxlen=512)
        self.enabled = (os.getenv("STT_DEBUG_AUDIO", "0") == "1") if debug is None else debug
        self.limit = max_bytes if max_bytes is not None else int(os.getenv("STT_DEBUG_MAX_BYTES", "67108864"))
        self.seconds_limit = max_seconds if max_seconds is not None else float(os.getenv("STT_DEBUG_MAX_SECONDS", "600"))
        self.used = 0
        self.writer = None
        self.manifest = None
        self.directory = Path(root or os.getenv("STT_DEBUG_DIR", "sessions")) / self.session_id
        if self.enabled:
            try:
                self.directory.mkdir(parents=True, exist_ok=False)
                self.manifest = (self.directory / "manifest.jsonl").open("w", encoding="utf-8")
            except OSError:
                self.enabled = False
                self.event("debug_error", reason="cannot_create_artifacts")

    def event(self, event, **fields):
        record = {"event": event, "session_id": self.session_id,
                  "elapsed_s": time.monotonic() - self.started, **fields}
        log.info(json.dumps(record, ensure_ascii=False, allow_nan=False))
        if self.enabled and self.manifest:
            try:
                line = json.dumps(record, ensure_ascii=False, allow_nan=False) + "\n"
                size = len(line.encode("utf-8"))
                if self.used + size > self.limit:
                    self.disable("quota")
                else:
                    self.manifest.write(line)
                    self.manifest.flush()
                    self.used += size
            except OSError:
                self.disable("manifest_write_failed")

    def disable(self, reason):
        self.enabled = False
        self.close()
        log.warning(json.dumps({"event": "debug_disabled", "session_id": self.session_id, "reason": reason}))

    def reserve(self, size):
        if not self.enabled:
            return False
        if self.used + size > self.limit or time.monotonic() - self.started > self.seconds_limit:
            self.disable("quota")
            return False
        self.used += size
        return True

    def received(self, raw, start, received_at=None):
        end = start + len(raw) // 4
        self.chunk_times.append((start, end, time.monotonic() if received_at is None else received_at))
        audio = np.frombuffer(raw, dtype="<i2").reshape(-1, 2).astype(np.float32) / 32768
        self.event("received_levels", start_sample=start, end_sample=end,
                   left=levels(audio[:, 0]), right=levels(audio[:, 1]))
        if self.enabled and end / self.sample_rate > self.seconds_limit:
            self.disable("audio_duration_quota")
        if not self.reserve(len(raw) + (44 if self.writer is None else 0)):
            return
        try:
            if self.writer is None:
                self.writer = wave.open(str(self.directory / "received.wav"), "wb")
                self.writer.setparams((2, 2, self.sample_rate, 0, "NONE", "not compressed"))
            self.writer.writeframes(raw)
            self.event("debug_received", start_sample=start, end_sample=start + len(raw) // 4,
                       file="received.wav")
        except (OSError, wave.Error):
            self.disable("wav_write_failed")

    def receive_latency(self, end_sample):
        """Age of the received chunk containing the final sample, not UI latency."""
        for start, end, received_at in reversed(self.chunk_times):
            if start < end_sample <= end:
                return time.monotonic() - received_at
        return None  # No provenance (unit-level input), or outside bounded history.

    def segment(self, audio, channel, sequence, start):
        if not self.reserve(len(audio) * 2 + 44):
            return
        pcm = np.clip(np.rint(audio * 32768), -32768, 32767).astype("<i2").tobytes()
        filename = f"{channel}-{sequence:06d}.wav"
        try:
            with wave.open(str(self.directory / filename), "wb") as writer:
                writer.setparams((1, 2, self.sample_rate, 0, "NONE", "not compressed"))
                writer.writeframes(pcm)
            self.event("debug_segment", channel=channel, sequence=sequence, file=filename,
                       start_sample=start, end_sample=start + len(audio))
        except (OSError, wave.Error):
            self.disable("wav_write_failed")

    def close(self):
        for attr in ("writer", "manifest"):
            handle = getattr(self, attr)
            setattr(self, attr, None)
            if handle:
                try:
                    handle.close()
                except OSError:
                    log.warning("Audio diagnostic artifact could not be closed")
