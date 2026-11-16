import logging
import asyncio
import numpy as np
from fastapi import WebSocket
from faster_whisper import WhisperModel

from src.config import config
from src.utils.audio_utils import deinterleave_stereo, build_response
from src.utils.model_inference import has_voice_activity, transcribe_audio

log = logging.getLogger(__name__)

from src.models.channel_state import ChannelState

class STTService:
    def __init__(self, whisper_model: WhisperModel, vad_model):
        self.whisper_model = whisper_model
        self.vad_model = vad_model
        
        self.state = {
            "left": ChannelState(),
            "right": ChannelState()
        }
        
        self.eval_samples = int(config.SAMPLE_RATE * (config.VAD_CHECK_INTERVAL_MS / 1000.0))
        self.max_silence_ms = config.VAD_MAX_SILENCE_MS
        self.max_speech_ms = config.VAD_MAX_SPEECH_MS

    async def process_chunk(self, raw_bytes: bytes, websocket: WebSocket):
        """Process an audio chunk from WebSocket."""
        left_chunk, right_chunk = deinterleave_stereo(raw_bytes)
        await self._handle_audio_chunk(left_chunk, "left", websocket)
        await self._handle_audio_chunk(right_chunk, "right", websocket)

    async def _handle_audio_chunk(self, chunk: np.ndarray, channel: str, websocket: WebSocket):
        state = self.state[channel]
        state.eval_buffer.append(chunk)
        
        eval_total = sum(len(c) for c in state.eval_buffer)
        
        # When eval buffer is full, check VAD
        if eval_total >= self.eval_samples:
            eval_audio = np.concatenate(state.eval_buffer)
            state.eval_buffer.clear()
            
            has_voice = await asyncio.to_thread(has_voice_activity, eval_audio, self.vad_model)
            chunk_duration_ms = int((len(eval_audio) / config.SAMPLE_RATE) * 1000)
            
            if has_voice:
                if not state.is_speaking and state.pre_roll.size:
                    state.speech_buffer.append(state.pre_roll)
                    state.speech_duration_ms += int(state.pre_roll.size * 1000 / config.SAMPLE_RATE)
                    state.pre_roll = np.empty(0, dtype=np.float32)
                state.is_speaking = True
                state.silence_duration_ms = 0
                state.speech_buffer.append(eval_audio)
                state.speech_duration_ms += chunk_duration_ms
                
                # Force transcribe if speech is too long
                if state.speech_duration_ms >= self.max_speech_ms:
                    await self._flush_channel(channel, websocket)
            else:
                if state.is_speaking:
                    state.speech_buffer.append(eval_audio)
                    state.speech_duration_ms += chunk_duration_ms
                    state.silence_duration_ms += chunk_duration_ms
                    
                # End of speech detected (silence duration exceeds max silence)
                if state.is_speaking and (
                    state.silence_duration_ms >= self.max_silence_ms
                    or state.speech_duration_ms >= self.max_speech_ms
                ):
                    await self._flush_channel(channel, websocket)
                else:
                    if not state.is_speaking:
                        pre_roll_samples = int(config.SAMPLE_RATE * config.VAD_PRE_ROLL_MS / 1000)
                        state.pre_roll = np.concatenate((state.pre_roll, eval_audio))[-pre_roll_samples:]

    async def _flush_channel(self, channel: str, websocket: WebSocket):
        state = self.state[channel]
        if not state.speech_buffer:
            return
            
        audio = np.concatenate(state.speech_buffer)
        
        # Reset state before awaiting transcription
        state.speech_buffer.clear()
        state.is_speaking = False
        state.silence_duration_ms = 0
        state.speech_duration_ms = 0
        
        text = await asyncio.to_thread(transcribe_audio, audio, self.whisper_model)
        if text:
            speaker_tag = "You" if channel == "left" else "Others"
            log.info(f"[{speaker_tag}]: {text}")
            # Let disconnect errors terminate the connection's processing task.
            await websocket.send_text(build_response(channel, text))

    async def flush_all(self, websocket: WebSocket):
        """Transcribe any remaining audio in the buffers."""
        for channel, state in self.state.items():
            if state.eval_buffer:
                tail = np.concatenate(state.eval_buffer)
                state.eval_buffer.clear()
                if state.is_speaking or await asyncio.to_thread(has_voice_activity, tail, self.vad_model):
                    if not state.is_speaking and state.pre_roll.size:
                        state.speech_buffer.append(state.pre_roll)
                    state.speech_buffer.append(tail)
            state.pre_roll = np.empty(0, dtype=np.float32)
            await self._flush_channel(channel, websocket)
