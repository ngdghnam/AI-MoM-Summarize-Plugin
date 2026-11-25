import logging
import asyncio
import time
import numpy as np
from fastapi import WebSocket
from faster_whisper import WhisperModel

from src.config import config
from src.utils.audio_utils import deinterleave_stereo, build_response
from src.utils.model_inference import has_voice_activity, transcribe_audio
from src.utils.audio_diagnostics import AudioDiagnostics, levels

log = logging.getLogger(__name__)

from src.models.channel_state import ChannelState

class STTService:
    def __init__(self, whisper_model: WhisperModel, vad_model, diagnostics=None):
        self.whisper_model = whisper_model
        self.vad_model = vad_model
        self.diagnostics = diagnostics or AudioDiagnostics(debug=False)
        self.in_flight = None
        
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
        state.received_samples += len(chunk)
        state.eval_buffer.append(chunk)
        
        eval_total = sum(len(c) for c in state.eval_buffer)
        
        # When eval buffer is full, check VAD
        if eval_total >= self.eval_samples:
            eval_audio = np.concatenate(state.eval_buffer)
            state.eval_buffer.clear()
            eval_start = state.evaluated_samples
            state.evaluated_samples += len(eval_audio)
            
            vad_started = time.monotonic()
            has_voice = await asyncio.to_thread(has_voice_activity, eval_audio, self.vad_model)
            self.diagnostics.event("vad", channel=channel, start_sample=eval_start,
                                   end_sample=state.evaluated_samples, voiced=has_voice,
                                   duration_s=len(eval_audio) / config.SAMPLE_RATE,
                                   vad_s=time.monotonic() - vad_started, **levels(eval_audio))
            chunk_duration_ms = int((len(eval_audio) / config.SAMPLE_RATE) * 1000)
            
            if has_voice:
                if not state.is_speaking:
                    state.speech_start = eval_start - state.pre_roll.size
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
        state.segment_sequence += 1
        segment = dict(channel=channel, sequence=state.segment_sequence,
                       start_sample=int(state.speech_start),
                       end_sample=int(state.speech_start + len(audio)))
        self.in_flight = segment
        self.diagnostics.segment(audio, channel, state.segment_sequence, state.speech_start)
        self.diagnostics.event("segment", **segment, duration_s=len(audio) / config.SAMPLE_RATE,
                               **levels(audio))
        
        # Reset state before awaiting transcription
        state.speech_buffer.clear()
        state.is_speaking = False
        state.silence_duration_ms = 0
        state.speech_duration_ms = 0
        
        started = time.monotonic()
        text = await asyncio.to_thread(transcribe_audio, audio, self.whisper_model)
        elapsed = time.monotonic() - started
        self.diagnostics.event("inference", **segment, inference_s=elapsed,
                               rtf=elapsed / (len(audio) / config.SAMPLE_RATE))
        if text:
            # Let disconnect errors terminate the connection's processing task.
            send_started = time.monotonic()
            await websocket.send_text(build_response(channel, text))
            self.diagnostics.event("result_sent", **segment, send_s=time.monotonic() - send_started,
                                   receive_end_to_send_s=self.diagnostics.receive_latency(segment["end_sample"]))
        self.in_flight = None

    async def flush_all(self, websocket: WebSocket):
        """Transcribe any remaining audio in the buffers."""
        for channel, state in self.state.items():
            if state.eval_buffer:
                tail = np.concatenate(state.eval_buffer)
                state.eval_buffer.clear()
                tail_start = state.evaluated_samples
                state.evaluated_samples += len(tail)
                if state.is_speaking or await asyncio.to_thread(has_voice_activity, tail, self.vad_model):
                    if not state.is_speaking:
                        state.speech_start = tail_start - state.pre_roll.size
                    if not state.is_speaking and state.pre_roll.size:
                        state.speech_buffer.append(state.pre_roll)
                    state.speech_buffer.append(tail)
            state.pre_roll = np.empty(0, dtype=np.float32)
            await self._flush_channel(channel, websocket)

    def diagnostic_state(self):
        return {"in_flight": self.in_flight, "channels": {
            channel: {"received_samples": state.received_samples,
                      "pending_eval_samples": sum(len(x) for x in state.eval_buffer),
                      "pending_speech_samples": sum(len(x) for x in state.speech_buffer),
                      "pre_roll_samples": int(state.pre_roll.size)}
            for channel, state in self.state.items()}}
