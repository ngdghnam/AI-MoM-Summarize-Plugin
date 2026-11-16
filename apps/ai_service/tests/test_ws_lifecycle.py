import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import WebSocketDisconnect
from src.websockets.stt_ws import websocket_transcribe


class WebSocketLifecycleTests(unittest.IsolatedAsyncioTestCase):
    def socket(self, receive):
        return SimpleNamespace(
            app=SimpleNamespace(state=SimpleNamespace(whisper_model=None, vad_model=None)),
            accept=AsyncMock(), close=AsyncMock(), receive_bytes=receive,
        )

    async def test_receives_disconnect_while_inference_is_blocked(self):
        processing = asyncio.Event()
        cancelled = asyncio.Event()
        calls = 0

        async def receive():
            nonlocal calls
            calls += 1
            if calls == 1:
                return b'audio'
            await processing.wait()
            raise WebSocketDisconnect(1000)

        async def process(*args):
            processing.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

        service = SimpleNamespace(process_chunk=process, flush_all=AsyncMock())
        with patch('src.websockets.stt_ws.STTService', return_value=service):
            await asyncio.wait_for(websocket_transcribe(self.socket(receive)), 2)
        self.assertTrue(cancelled.is_set())
        service.flush_all.assert_not_awaited()

    async def test_send_disconnect_stops_receiver(self):
        calls = 0

        async def receive():
            nonlocal calls
            calls += 1
            if calls == 1:
                return b'audio'
            await asyncio.Event().wait()

        service = SimpleNamespace(process_chunk=AsyncMock(side_effect=WebSocketDisconnect(1006)))
        socket = self.socket(receive)
        with patch('src.websockets.stt_ws.STTService', return_value=service):
            await asyncio.wait_for(websocket_transcribe(socket), 2)
        self.assertEqual(service.process_chunk.await_count, 1)
        socket.close.assert_awaited_once()

    async def test_overload_closes_with_explicit_code(self):
        socket = self.socket(AsyncMock(return_value=b'x' * (16000 * 4 * 30 + 1)))
        with patch('src.websockets.stt_ws.STTService'):
            await asyncio.wait_for(websocket_transcribe(socket), 2)
        socket.close.assert_any_await(code=1013, reason='STT processing overloaded')
