"""Reproducible offline/legacy-WebSocket comparisons. Run from apps/ai_service."""
import argparse
import asyncio
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import statistics
import sys
import time
import unicodedata
import wave

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.config import config


def read_audio(path, source="left"):
    with wave.open(str(path), "rb") as reader:
        if reader.getframerate() != 16000 or reader.getsampwidth() != 2 or reader.getnchannels() not in (1, 2):
            raise ValueError("Expected PCM16 WAV, 16000 Hz, mono/stereo. Convert explicitly before replay.")
        channels = reader.getnchannels()
        frames = reader.getnframes()
        raw = reader.readframes(frames)
        if len(raw) != frames * channels * 2 or not frames:
            raise ValueError("Empty or truncated WAV")
    pcm = np.frombuffer(raw, dtype="<i2").reshape(-1, channels)
    if channels == 1:
        stereo = np.zeros((len(pcm), 2), dtype="<i2")
        stereo[:, 0 if source == "left" else 1] = pcm[:, 0]
    else:
        stereo = pcm.copy()
    return stereo


def normalize(text):
    text = unicodedata.normalize("NFC", text).lower()
    return " ".join("".join(c for c in text if not unicodedata.category(c).startswith("P")).split())


def distance(a, b):
    row = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        next_row = [i]
        for j, y in enumerate(b, 1):
            next_row.append(min(next_row[-1] + 1, row[j] + 1, row[j - 1] + (x != y)))
        row = next_row
    return row[-1]


def scores(reference, hypothesis):
    ref, hyp = normalize(reference), normalize(hypothesis)
    words = ref.split()
    return {"wer": distance(words, hyp.split()) / len(words) if words else None,
            "cer": distance(ref, hyp) / len(ref) if ref else None,
            "word_errors": distance(words, hyp.split()), "reference_words": len(words),
            "character_errors": distance(ref, hyp), "reference_characters": len(ref)}


def summarize_events(path):
    records = [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]
    sessions = {r["session_id"] for r in records}
    if len(sessions) != 1:
        raise ValueError("Use one session's debug manifest, not a mixed server log")
    def values(event, key):
        return [r[key] for r in records if r.get("event") == event and r.get(key) is not None]
    def percentiles(xs):
        return {"p50": float(np.percentile(xs, 50)), "p95": float(np.percentile(xs, 95))} if xs else None
    return {"session_id": next(iter(sessions)),
            "session_config": [r for r in records if r.get("event") == "session_start"],
            "inference_rtf": percentiles(values("inference", "rtf")),
            "queue_wait_s": percentiles(values("dequeued", "queue_wait_s")),
            "receive_to_processed_s": percentiles(values("chunk_processed", "receive_to_processed_s")),
            "receive_end_to_send_s": percentiles(values("result_sent", "receive_end_to_send_s")),
            "max_backlog_audio_s": max(values("backlog", "audio_s"), default=0),
            "segments": [r for r in records if r.get("event") == "segment"],
            "session_end": [r for r in records if r.get("event") == "session_end"],
            "pending": [r for r in records if r.get("event") == "pending_state"]}


def offline(stereo, repeats):
    from faster_whisper import WhisperModel
    from src.utils.model_inference import transcribe_audio
    started = time.monotonic()
    from faster_whisper.utils import download_model
    model_path = download_model(config.MODEL_SIZE, local_files_only=True)
    model = WhisperModel(model_path, device=config.DEVICE, compute_type=config.COMPUTE_TYPE)
    result = {"model_load_s": time.monotonic() - started, "model_snapshot": str(model_path),
              "channels": {}}
    for i, channel in enumerate(("left", "right")):
        if not np.any(stereo[:, i]):
            continue
        audio = stereo[:, i].astype(np.float32) / 32768
        started = time.monotonic()
        transcribe_audio(audio, model)
        warmup_s = time.monotonic() - started
        runs = []
        for _ in range(repeats):
            started = time.monotonic()
            text = transcribe_audio(audio, model)
            elapsed = time.monotonic() - started
            runs.append({"text": text, "inference_s": elapsed, "rtf": elapsed / (len(audio) / 16000)})
        result["channels"][channel] = {"warmup_s": warmup_s, "runs": runs,
                                        "median_rtf": statistics.median(r["rtf"] for r in runs)}
    return result


async def streaming(stereo, uri, chunk_frames, tail_seconds, wait_seconds, stop_at):
    import websockets
    stop_frames = min(len(stereo), int(stop_at * 16000)) if stop_at is not None else len(stereo)
    tail_frames = 0 if stop_at is not None else int(tail_seconds * 16000)
    audio = np.concatenate((stereo[:stop_frames], np.zeros((tail_frames, 2), dtype="<i2")))
    messages = []
    started = time.monotonic()
    sent_frames = 0
    status = "legacy_no_completion_ack"
    error = None
    async def receive(socket):
        async for payload in socket:
            messages.append({"elapsed_s": time.monotonic() - started, "result": json.loads(payload)})
    try:
        async with websockets.connect(uri) as socket:
            receiver = asyncio.create_task(receive(socket))
            try:
                for start in range(0, len(audio), chunk_frames):
                    chunk = audio[start:start + chunk_frames]
                    await socket.send(chunk.astype("<i2", copy=False).tobytes())
                    sent_frames += len(chunk)
                    await asyncio.sleep(max(0, started + sent_frames / 16000 - time.monotonic()))
                if stop_at is not None:
                    status = "stop_disconnect_incomplete"
                else:
                    await asyncio.wait_for(asyncio.shield(receiver), wait_seconds)
                    status = "server_closed_incomplete"
            except asyncio.TimeoutError:
                status = "wait_expired_completion_unverified"
            finally:
                await socket.close()
                await receiver
    except Exception as exc:
        status = "error_incomplete"
        error = f"{type(exc).__name__}: {exc}"
    return {"status": status, "error": error, "sent_frames": sent_frames,
            "original_frames_sent": min(sent_frames, stop_frames), "appended_silence_frames": tail_frames,
            "chunk_frames": chunk_frames, "elapsed_s": time.monotonic() - started,
            "messages": messages, "server_metrics": None,
            "metrics_note": "Attach the matching server manifest with the events command; no completion ACK exists."}


def metadata(path, stereo):
    return {"audio_sha256": hashlib.sha256(Path(path).read_bytes()).hexdigest(),
            "frames": len(stereo), "duration_s": len(stereo) / 16000,
            "python": platform.python_version(), "cpu": platform.processor(), "logical_cpus": os.cpu_count(),
            "platform": platform.platform(),
            "versions": {p: importlib.metadata.version(p) for p in ("numpy", "faster-whisper", "silero-vad", "websockets", "ctranslate2", "av", "torch")},
            "config": {k: v for k, v in vars(config).items() if k.isupper()},
            "decoding": {"task": "transcribe", "vad_filter": False, "condition_on_previous_text": False}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("inspect", "offline", "streaming", "events"))
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source", choices=("left", "right"), default="left")
    parser.add_argument("--reference", type=Path, help="JSON object with left/right verbatim reference strings")
    parser.add_argument("--uri", default="ws://127.0.0.1:8000/ws/transcribe")
    parser.add_argument("--chunk-frames", type=int, default=4096)
    parser.add_argument("--tail-seconds", type=float, default=4)
    parser.add_argument("--wait-seconds", type=float, default=30)
    parser.add_argument("--stop-at", type=float)
    parser.add_argument("--repeats", type=int, default=3)
    args = parser.parse_args()
    if args.chunk_frames <= 0 or args.repeats < 3 or args.tail_seconds < 0 or args.wait_seconds <= 0 or (args.stop_at is not None and args.stop_at <= 0):
        parser.error("Require positive chunk/wait/stop, nonnegative tail, and at least 3 repeats")
    if args.output.resolve() == args.input.resolve() or (args.reference and args.output.resolve() == args.reference.resolve()):
        parser.error("Output must not overwrite input/reference")
    if args.mode == "events":
        report = summarize_events(args.input)
    else:
        stereo = read_audio(args.input, args.source)
        report = metadata(args.input, stereo)
        report["mode"] = args.mode
        if args.mode == "offline":
            report["offline"] = offline(stereo, args.repeats)
        elif args.mode == "streaming":
            report["streaming"] = asyncio.run(streaming(stereo, args.uri, args.chunk_frames, args.tail_seconds, args.wait_seconds, args.stop_at))
        if args.reference:
            references = json.loads(args.reference.read_text(encoding="utf-8"))
            report["references"] = references
            report["scores"] = {}
            for channel, reference in references.items():
                if channel not in ("left", "right") or not isinstance(reference, str):
                    raise ValueError("Reference must map left/right to strings")
                if args.mode == "offline":
                    runs = report["offline"]["channels"].get(channel, {}).get("runs", [])
                    report["scores"][channel] = [scores(reference, r["text"]) for r in runs]
                elif args.mode == "streaming":
                    text = " ".join(m["result"]["text"] for m in report["streaming"]["messages"] if m["result"].get("channel") == channel)
                    report["scores"][channel] = scores(reference, text)
            report["score_note"] = "Partial streaming output is scored against full reference; inspect status before comparison."
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Report saved: {args.output}")


if __name__ == "__main__":
    main()
