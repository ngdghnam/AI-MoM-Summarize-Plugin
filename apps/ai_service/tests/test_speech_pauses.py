import unittest
from unittest.mock import AsyncMock, patch

import numpy as np

from src.config import config
from src.services.stt_service import STTService


class SpeechPauseTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.service = STTService(None, None)
        self.socket = AsyncMock()
        self.chunk = np.zeros(self.service.eval_samples, dtype=np.float32)
        self.vad = patch('src.services.stt_service.has_voice_activity')
        self.voice = self.vad.start()
        self.addCleanup(self.vad.stop)
        self.inference = patch('src.services.stt_service.transcribe_audio', return_value='Original speech')
        self.transcribe = self.inference.start()
        self.addCleanup(self.inference.stop)

    async def feed(self, voiced, count=1, channel='left'):
        self.voice.return_value = voiced
        for _ in range(count):
            await self.service._handle_audio_chunk(self.chunk, channel, self.socket)

    async def test_short_pause_and_resume_stay_in_one_segment(self):
        await self.feed(True)
        await self.feed(False, 3)  # 1.5 seconds thinking mid-sentence.
        await self.feed(True)
        self.transcribe.assert_not_called()
        await self.feed(False, 5)
        self.transcribe.assert_called_once()
        audio = self.transcribe.call_args.args[0]
        self.assertEqual(len(audio), 10 * len(self.chunk))
        self.socket.send_text.assert_awaited_once()

    async def test_listening_continues_after_long_pause(self):
        for _ in range(2):
            await self.feed(True)
            await self.feed(False, 5)
        self.assertEqual(self.transcribe.call_count, 2)

    async def test_duration_limit_also_applies_during_pause(self):
        self.service.max_speech_ms = 2000
        await self.feed(True, 3)
        await self.feed(False)
        self.transcribe.assert_called_once()

    async def test_continuous_speech_is_bounded_and_resumes(self):
        count = config.VAD_MAX_SPEECH_MS // config.VAD_CHECK_INTERVAL_MS
        await self.feed(True, count + 1)
        self.transcribe.assert_called_once()
        self.assertTrue(self.service.state['left'].is_speaking)
        self.assertEqual(self.service.state['left'].speech_duration_ms, 500)

    async def test_other_channel_does_not_finalize_paused_speaker(self):
        await self.feed(True)
        await self.feed(False, 3)
        await self.feed(True, channel='right')
        self.transcribe.assert_not_called()
        self.assertTrue(self.service.state['left'].is_speaking)
        await self.service.flush_all(self.socket)
        self.assertEqual(self.transcribe.call_count, 2)
