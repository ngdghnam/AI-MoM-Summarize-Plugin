import asyncio
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch
import wave

import numpy as np

from src.services.stt_service import STTService
from src.utils.audio_diagnostics import AudioDiagnostics, levels
from src.utils.audio_utils import deinterleave_stereo
from tools.replay import read_audio, scores, streaming, summarize_events
from tools.prepare_wav import convert


class AudioFormatTests(unittest.TestCase):
    def test_endian_channels_and_limits(self):
        left, right = deinterleave_stereo(bytes.fromhex("0080ff7f0100ffff"))
        np.testing.assert_array_equal(left, [-1, 1 / 32768])
        np.testing.assert_array_equal(right, [32767 / 32768, -1 / 32768])
        for length in (1, 2, 3, 5):
            with self.assertRaises(ValueError):
                deinterleave_stereo(bytes(length))
        self.assertEqual(levels(np.array([-1, 0, 32767 / 32768]))["clipping_ratio"], 2 / 3)

    def test_debug_disabled_quota_and_roundtrip(self):
        with tempfile.TemporaryDirectory() as root:
            disabled = AudioDiagnostics(root=root, debug=False)
            disabled.received(bytes(4), 0)
            disabled.close()
            self.assertEqual(list(Path(root).iterdir()), [])
            diag = AudioDiagnostics(root=root, debug=True, max_bytes=10000)
            pcm = np.array([-32768, 32767, 123, -456], dtype="<i2").tobytes()
            diag.received(pcm, 0)
            diag.segment(np.array([-1, 123 / 32768], dtype=np.float32), "left", 1, 0)
            diag.close()
            with wave.open(str(diag.directory / "received.wav")) as reader:
                self.assertEqual(reader.getnchannels(), 2)
                self.assertEqual(reader.readframes(2), pcm)
            with wave.open(str(diag.directory / "left-000001.wav")) as reader:
                self.assertEqual(reader.readframes(2), np.array([-32768, 123], dtype="<i2").tobytes())
            manifest = [json.loads(x) for x in (diag.directory / "manifest.jsonl").read_text().splitlines()]
            self.assertEqual(manifest[-1]["end_sample"], 2)
            limited = AudioDiagnostics(root=root, debug=True, max_bytes=44)
            limited.received(pcm, 0)
            self.assertFalse(limited.enabled)
            self.assertIsNone(limited.manifest)

    def test_replay_validation_scoring_and_event_report(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "input.wav"
            with wave.open(str(path), "wb") as writer:
                writer.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
                writer.writeframes(np.array([1, -2], dtype="<i2").tobytes())
            pcm = read_audio(path, "right")
            np.testing.assert_array_equal(pcm, [[0, 1], [0, -2]])
            with wave.open(str(path), "wb") as writer:
                writer.setparams((1, 2, 22050, 0, "NONE", "not compressed"))
                writer.writeframes(bytes(4))
            with self.assertRaises(ValueError):
                read_audio(path)
            self.assertEqual(scores("Tôi, KHÔNG đi.", "Tôi không đi")["wer"], 0)
            self.assertEqual(scores("một hai", "một ba bốn")["wer"], 1)
            self.assertIsNone(scores("", "inserted")["wer"])
            diag = AudioDiagnostics(root=root, debug=True)
            diag.event("inference", rtf=0.5)
            diag.event("inference", rtf=1.5)
            diag.event("backlog", audio_s=2)
            diag.close()
            summary = summarize_events(diag.directory / "manifest.jsonl")
            self.assertEqual(summary["inference_rtf"]["p50"], 1)
            self.assertEqual(summary["max_backlog_audio_s"], 2)

    def test_explicit_conversion_preserves_stereo_and_duration(self):
        with tempfile.TemporaryDirectory() as root:
            source, output = Path(root) / "original.wav", Path(root) / "converted.wav"
            original = np.zeros((22050, 2), dtype="<i2")
            original[:, 1] = 8000
            with wave.open(str(source), "wb") as writer:
                writer.setparams((2, 2, 22050, 0, "NONE", "not compressed"))
                writer.writeframes(original.tobytes())
            info = convert(source, output)
            pcm = read_audio(output)
            self.assertEqual(pcm.shape, (16000, 2))
            self.assertTrue(np.all(pcm[:, 0] == 0))
            self.assertGreater(float(np.mean(pcm[:, 1])), 7900)
            self.assertEqual(info["channels"], 2)
            self.assertTrue(output.with_suffix(".conversion.json").exists())
            with self.assertRaises(ValueError):
                convert(source, source)

    def test_debug_io_failure_and_duration_cap_do_not_raise(self):
        with tempfile.TemporaryDirectory() as root:
            diag = AudioDiagnostics(root=root, debug=True, max_seconds=1)
            diag.received(bytes(8), 16000)
            self.assertFalse(diag.enabled)
            diag = AudioDiagnostics(root=root, debug=True)
            with patch("src.utils.audio_diagnostics.wave.open", side_effect=OSError("disk failure")):
                diag.received(bytes(8), 0)
            self.assertFalse(diag.enabled)
            self.assertIsNone(diag.manifest)


class SampleTracingTests(unittest.IsolatedAsyncioTestCase):
    async def test_irregular_chunks_pre_roll_and_segment_integrity(self):
        diag = AudioDiagnostics(debug=False)
        events = []
        diag.event = lambda event, **fields: events.append({"event": event, **fields})
        service = STTService(None, None, diag)
        service.max_silence_ms = 500
        # Preserve existing variable VAD windows: each pair of 4096-frame callbacks.
        blocks = [np.full(4096, i / 10, dtype=np.float32) for i in range(6)]
        with patch("src.services.stt_service.has_voice_activity", side_effect=[False, True, False]), patch(
            "src.services.stt_service.transcribe_audio", return_value="private text"
        ) as infer:
            for block in blocks:
                await service._handle_audio_chunk(block, "left", AsyncMock())
        audio = infer.call_args.args[0]
        expected = np.concatenate(blocks)[192:]
        np.testing.assert_array_equal(audio, expected)
        segment = next(e for e in events if e["event"] == "segment")
        self.assertEqual((segment["start_sample"], segment["end_sample"]), (192, 24576))
        self.assertEqual(segment["end_sample"] - segment["start_sample"], len(audio))
        self.assertNotIn("private text", json.dumps(events))
        self.assertGreaterEqual(next(e for e in events if e["event"] == "inference")["rtf"], 0)

    async def test_flush_tail_offsets_and_independent_channels(self):
        diag = AudioDiagnostics(debug=False)
        events = []
        diag.event = lambda event, **fields: events.append({"event": event, **fields})
        service = STTService(None, None, diag)
        with patch("src.services.stt_service.has_voice_activity", return_value=True), patch(
            "src.services.stt_service.transcribe_audio", return_value=""
        ):
            await service.process_chunk(bytes(400), AsyncMock())
            await service.flush_all(AsyncMock())
        segments = [e for e in events if e["event"] == "segment"]
        self.assertEqual([e["channel"] for e in segments], ["left", "right"])
        self.assertTrue(all(e["start_sample"] == 0 and e["end_sample"] == 100 for e in segments))

    async def test_streaming_stop_is_incomplete_and_has_no_silence_tail(self):
        class Socket:
            def __init__(self):
                self.closed = asyncio.Event()
                self.sent = []
            async def send(self, raw):
                self.sent.append(raw)
            async def close(self):
                self.closed.set()
            def __aiter__(self):
                return self
            async def __anext__(self):
                await self.closed.wait()
                raise StopAsyncIteration
        socket = Socket()
        context = AsyncMock()
        context.__aenter__.return_value = socket
        with patch("websockets.connect", return_value=context):
            report = await streaming(np.zeros((160, 2), dtype="<i2"), "ws://test", 16, 4, 0.01, 0.005)
        self.assertEqual(report["sent_frames"], 80)
        self.assertEqual(report["appended_silence_frames"], 0)
        self.assertEqual(report["status"], "stop_disconnect_incomplete")
        socket = Socket()
        context.__aenter__.return_value = socket
        with patch("websockets.connect", return_value=context):
            report = await streaming(np.zeros((16, 2), dtype="<i2"), "ws://test", 16, 0.001, 0.01, None)
        self.assertEqual(report["status"], "wait_expired_completion_unverified")
        self.assertEqual(report["appended_silence_frames"], 16)
        self.assertEqual(report["sent_frames"], 32)
