# STT Pipeline: chẩn đoán lỗi và triển khai Transcription Queue

## 1. Bối cảnh

Hệ thống browser extension truyền audio stereo qua WebSocket tới FastAPI. Backend tách kênh `left`/`right`, dùng VAD phát hiện lời nói và Faster-Whisper chuyển speech thành text. Hiện tượng: đọc số 1–8, phần đầu đúng nhưng phần sau bị sai hoặc thiếu.

**Không thể kết luận nguyên nhân chỉ từ đoạn code hiện có.** Cần kiểm tra định dạng PCM, sample rate, VAD, đoạn audio thực tế gửi vào Whisper và cấu hình decoding.

## 2. Những vấn đề trong code cũ

| Vấn đề | Biểu hiện / rủi ro | Giải pháp |
|---|---|---|
| `asyncio.create_task(_flush_channel(...))` không theo dõi task | Kết quả có thể đến không theo thứ tự; inference chạy đồng thời không kiểm soát | Đưa segment vào queue, worker riêng xử lý |
| VAD bỏ qua audio trước lúc phát hiện speech | Mất phụ âm/âm đầu, nhất là các từ ngắn | Pre-roll 200–300 ms |
| `eval_buffer.clear()` sau khi lấy toàn bộ | Cửa sổ VAD thay đổi độ dài | Cắt đúng `eval_samples`, giữ phần dư |
| `flush_all()` chỉ tạo task | WebSocket có thể đóng trước khi trả kết quả | Drain và join worker trước khi đóng |
| `self.state` nằm trên service | Nếu service singleton, nhiều session chia sẻ buffer | State thuộc từng WebSocket session |
| Chạy Whisper trực tiếp trong receive loop | Inference làm chậm nhận audio | Receiver → VAD → Queue → Worker |
| Không kiểm tra PCM / sample rate | Âm thanh bị tăng/giảm tốc hoặc méo | Kiểm tra frontend gửi PCM16LE stereo và sample rate thực tế |
| Thiếu giới hạn queue | Backend chậm hơn audio gây tăng RAM/latency | Queue có `maxsize`, theo dõi depth và áp dụng backpressure |

**Lưu ý:** `asyncio.Queue` bảo đảm thứ tự lấy item theo FIFO, nhưng không tự bảo đảm thứ tự gửi kết quả nếu nhiều worker xử lý song song. Ví dụ bên dưới dùng **một worker trên mỗi session**, do đó bảo đảm thứ tự enqueue trong session. Mỗi kênh được giữ riêng và có `channel_sequence` để phục vụ kiểm tra. Khi cần scale, bổ sung bộ sắp xếp kết quả theo sequence.

## 3. Kiến trúc đề xuất cho MVP

```text
Browser Extension (AudioWorklet)
    │ PCM16LE stereo, sample rate đã thống nhất
    ▼
FastAPI WebSocket receive loop
    │ validate frames / deinterleave
    ▼
Session-local STTProcessor
    ├── ChannelState(left): pre-roll + VAD + segment
    └── ChannelState(right): pre-roll + VAD + segment
    │
    ▼
asyncio.Queue[SpeechSegment] (bounded, FIFO)
    │
    ▼
1 transcription worker / session
    │ asyncio.to_thread(...) + global inference semaphore
    ▼
Faster-Whisper
    │
    ▼
WebSocket sender (duy nhất)
```

Với tải cao, một worker trên mỗi session vẫn có thể tạo nhiều inference đang chờ; `asyncio.Semaphore` dùng chung giới hạn số inference chạy đồng thời. Semaphore chỉ giới hạn concurrency trong một process, không giới hạn giữa nhiều Uvicorn workers hoặc nhiều replicas.

## 4. Code tham khảo

Các đoạn dưới đây là **skeleton có thể tích hợp**, cần điều chỉnh theo chữ ký hàm VAD, hàm transcribe, cấu hình thực tế và WebSocket route của dự án. Giả định:

- Audio là **raw PCM16 little-endian, interleaved stereo**, không phải WebM/Opus/Float32.
- Frontend đã resample về `SAMPLE_RATE = 16000` Hz (hoặc backend resample đúng trước khi gọi VAD/Whisper).
- `has_voice_activity(audio_float32, vad_model)` nhận một cửa sổ mono float32 chuẩn hóa và trả boolean; cần kiểm tra lại API VAD thực tế.
- `transcribe_audio(audio_float32, whisper_model)` trả `str` và không tự thay đổi buffer.
- VAD check interval phải tương thích với kích thước frame VAD model yêu cầu (ví dụ Silero có các yêu cầu cụ thể theo sample rate).

### 4.1 `models/channel_state.py`

```python
from collections import deque
from dataclasses import dataclass, field
import numpy as np

@dataclass
class ChannelState:
    pending: np.ndarray = field(default_factory=lambda: np.empty(0, dtype=np.float32))
    pre_roll: deque[np.ndarray] = field(default_factory=deque)
    pre_roll_samples: int = 0
    speech_parts: list[np.ndarray] = field(default_factory=list)
    is_speaking: bool = False
    silence_ms: float = 0.0
    speech_ms: float = 0.0
    sequence: int = 0
```

### 4.2 `models/speech_segment.py`

```python
from dataclasses import dataclass
import numpy as np

@dataclass(frozen=True)
class SpeechSegment:
    channel: str
    channel_sequence: int
    audio: np.ndarray
```

### 4.3 `services/stt_session.py`

```python
import asyncio
import json
import logging
from collections import deque
import numpy as np
from fastapi import WebSocket

from src.models.channel_state import ChannelState
from src.models.speech_segment import SpeechSegment
from src.utils.model_inference import has_voice_activity, transcribe_audio

log = logging.getLogger(__name__)

SAMPLE_RATE = 16000
VAD_WINDOW_MS = 32       # 512 samples at 16 kHz; confirm for your VAD
PRE_ROLL_MS = 256
MAX_SILENCE_MS = 480
MAX_SPEECH_MS = 12000
QUEUE_CAPACITY = 24

# Instantiate once per application process, share across sessions.
# For a GPU, start with 1; benchmark before raising.
INFERENCE_SEMAPHORE = asyncio.Semaphore(1)

class STTSession:
    def __init__(self, websocket: WebSocket, whisper_model, vad_model):
        self.websocket = websocket
        self.whisper_model = whisper_model
        self.vad_model = vad_model
        self.states = {"left": ChannelState(), "right": ChannelState()}
        self.queue: asyncio.Queue[SpeechSegment | None] = asyncio.Queue(
            maxsize=QUEUE_CAPACITY
        )
        self.window_samples = SAMPLE_RATE * VAD_WINDOW_MS // 1000
        self.pre_roll_limit = SAMPLE_RATE * PRE_ROLL_MS // 1000
        self.worker_task: asyncio.Task | None = None
        self.closed = False
        self.socket_writable = True

    async def start(self):
        self.worker_task = asyncio.create_task(self._transcription_worker())

    async def process_pcm_stereo(self, raw_bytes: bytes):
        if self.closed:
            raise RuntimeError("STT session already closed")
        if len(raw_bytes) % 4 != 0:
            raise ValueError("PCM16 stereo requires multiples of 4 bytes")
        # Exactly 2 channels, interleaved signed 16-bit little-endian PCM.
        samples = np.frombuffer(raw_bytes, dtype="<i2").reshape(-1, 2)
        left = samples[:, 0].astype(np.float32) / 32768.0
        right = samples[:, 1].astype(np.float32) / 32768.0
        await self._ingest("left", left)
        await self._ingest("right", right)

    async def _ingest(self, channel: str, chunk: np.ndarray):
        state = self.states[channel]
        state.pending = np.concatenate((state.pending, chunk))
        while len(state.pending) >= self.window_samples:
            window = state.pending[:self.window_samples].copy()
            state.pending = state.pending[self.window_samples:]
            await self._evaluate(channel, window)

    def _remember_pre_roll(self, state: ChannelState, window: np.ndarray):
        state.pre_roll.append(window)
        state.pre_roll_samples += len(window)
        while state.pre_roll_samples > self.pre_roll_limit and state.pre_roll:
            oldest = state.pre_roll.popleft()
            state.pre_roll_samples -= len(oldest)

    async def _evaluate(self, channel: str, window: np.ndarray):
        state = self.states[channel]
        # If VAD is lightweight, consider direct call to avoid thread overhead.
        # If VAD model has internal state, protect/isolate it per session/channel.
        voiced = await asyncio.to_thread(has_voice_activity, window, self.vad_model)
        duration_ms = 1000.0 * len(window) / SAMPLE_RATE

        if not state.is_speaking:
            if not voiced:
                self._remember_pre_roll(state, window)
                return
            state.is_speaking = True
            state.speech_parts = list(state.pre_roll) + [window]
            state.pre_roll.clear()
            state.pre_roll_samples = 0
            state.speech_ms = duration_ms
            state.silence_ms = 0.0
            return

        state.speech_parts.append(window)
        state.speech_ms += duration_ms
        state.silence_ms = 0.0 if voiced else state.silence_ms + duration_ms

        if (state.silence_ms >= MAX_SILENCE_MS or
                state.speech_ms >= MAX_SPEECH_MS):
            await self._emit_segment(channel)

    async def _emit_segment(self, channel: str):
        state = self.states[channel]
        if not state.speech_parts:
            return
        audio = np.concatenate(state.speech_parts)
        state.sequence += 1
        segment = SpeechSegment(channel, state.sequence, audio)
        # Bounded queue: applies backpressure instead of unbounded RAM growth.
        # Production: monitor queue size and disconnect/scale when persistently full.
        await self.queue.put(segment)
        state.speech_parts.clear()
        state.is_speaking = False
        state.silence_ms = 0.0
        state.speech_ms = 0.0

    async def _transcription_worker(self):
        while True:
            segment = await self.queue.get()
            try:
                if segment is None:
                    return
                async with INFERENCE_SEMAPHORE:
                    text = await asyncio.to_thread(
                        transcribe_audio, segment.audio, self.whisper_model
                    )
                if text and self.socket_writable:
                    payload = {
                        "channel": segment.channel,
                        "sequence": segment.channel_sequence,
                        "text": text,
                    }
                    try:
                        await self.websocket.send_text(json.dumps(payload, ensure_ascii=False))
                    except Exception:
                        self.socket_writable = False
                        log.exception("WebSocket send failed")
            except Exception:
                log.exception("Transcription failed for %s:%s",
                              getattr(segment, "channel", "?"),
                              getattr(segment, "channel_sequence", "?"))
            finally:
                self.queue.task_done()

    async def finish(self):
        """Call after the receive loop stops; don't ingest any more chunks."""
        if self.closed:
            return
        self.closed = True
        for channel, state in self.states.items():
            # Pending samples have not yet been evaluated by VAD.
            if len(state.pending):
                tail = state.pending.copy()
                state.pending = np.empty(0, dtype=np.float32)
                if state.is_speaking:
                    state.speech_parts.append(tail)
                # If not speaking, retain tail only for diagnostics;
                # no evidence yet that it is a complete speech segment.
            await self._emit_segment(channel)
        await self.queue.put(None)       # sentinel AFTER all speech segments
        if self.worker_task is not None:
            await self.worker_task       # drains FIFO and exits
```

**Quan trọng về VAD:** Nếu dùng Silero VAD stateful, một `vad_model` chia sẻ đồng thời giữa nhiều channel/session có thể làm nhiễu state nội bộ. Cần instance VAD/state độc lập theo channel hoặc sử dụng API VAD stateless với cơ chế đồng bộ phù hợp. Không được giả định `asyncio.to_thread()` làm model thread-safe.

**Quan trọng về max speech:** Khi chạm `MAX_SPEECH_MS`, code minh họa kết thúc segment và bắt đầu lại với pre-roll rỗng. Với lời nói liên tục, cách này có thể cắt giữa từ. Bản production nên thêm overlap 200–500 ms hoặc dùng chunking có ngữ cảnh và deduplication; tránh ghép văn bản trùng lặp.

**Quan trọng về backpressure:** `await queue.put()` khi queue đầy sẽ dừng nhận audio ở vòng lặp WebSocket. TCP/WebSocket sẽ tạo backpressure, nhưng browser có thể tiếp tục tích audio; cần giới hạn buffer phía frontend và metric độ trễ end-to-end. Nếu latency tăng mãi, phải tăng throughput hoặc từ chối session; không âm thầm drop speech.

### 4.4 WebSocket route

```python
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from src.services.stt_session import STTSession

router = APIRouter()

@router.websocket("/ws/stt")
async def stt_socket(websocket: WebSocket):
    await websocket.accept()
    # Get models from app.state / dependency container (initialized once).
    whisper_model = websocket.app.state.whisper_model
    vad_model = websocket.app.state.vad_model
    session = STTSession(websocket, whisper_model, vad_model)
    await session.start()
    try:
        while True:
            raw = await websocket.receive_bytes()
            await session.process_pcm_stereo(raw)
    except WebSocketDisconnect:
        session.socket_writable = False
    finally:
        await session.finish()
```

Nếu muốn client nhận đủ transcript cuối cùng, **đừng đóng socket ngay khi gửi stop**. Hãy thiết kế thông điệp điều khiển `stop`, dừng gửi audio, server `finish()` và trả `transcription_complete`, sau đó mới đóng WebSocket. Ví dụ route trên chỉ xử lý binary frames và minh họa trường hợp disconnect; sau disconnect không thể gửi kết quả cuối cho client. Trong hệ thống thực tế nên lưu transcript ở server để có thể lấy lại khi reconnect.

## 5. Có nên dùng Redis / Celery / RabbitMQ?

**MVP một backend instance:** `asyncio.Queue` + worker + semaphore là đủ, đơn giản và ít thành phần. Nhược điểm: queue nằm trong RAM và mất khi process crash; không thể chia sẻ giữa replicas.

**Khi scale nhiều instance:** dùng Redis Streams hoặc message broker để xử lý công việc bền vững hơn; worker độc lập và cần cơ chế ACK, retry, idempotency và định tuyến kết quả về đúng session. Đừng đưa dữ liệu audio dài vào Redis một cách vô hạn; có thể lưu segment vào object storage và gửi reference.

## 6. Kiểm tra trước khi tối ưu model

1. Ghi WAV **ngay sau khi decode PCM** (trước VAD) và **ngay trước Whisper**; dùng tên file có session/channel/sequence.
2. Nghe hai WAV: nếu đầu vào sai → sửa frontend/PCM/resampling; nếu đầu vào đúng nhưng đoạn gửi Whisper thiếu → sửa VAD/segmentation; nếu đoạn Whisper đúng mà text sai → xem model/decoding/language.
3. Kiểm tra `SAMPLE_RATE` thực tế; Web Audio thường chạy ở 48 kHz, không được chỉ đổi metadata thành 16 kHz.
4. Thử tắt VAD và transcribe một file WAV 5–10 giây đã kiểm chứng để cô lập lỗi.
5. Log `queue.qsize()`, segment duration, VAD decisions, inference duration, tổng latency, RMS/peak, tỷ lệ clipping và số lượng segment.
6. Thử đọc 1–8 liên tục và đọc từng số có khoảng nghỉ. So sánh transcript và WAV.
7. Kiểm tra Faster-Whisper: `language="vi"` khi chắc chắn nói tiếng Việt, `condition_on_previous_text=False` cho các segment độc lập, beam size/temperature và cách lọc hallucination; không mặc định mọi lỗi là do model.

## 7. Lộ trình triển khai

**Phase 1 — xác định nguyên nhân:** xác minh audio format, sample rate, ghi WAV trước/sau VAD, test offline.

**Phase 2 — ổn định pipeline:** session-local state, fixed VAD windows, pre-roll, bounded queue, một worker mỗi session, quản lý stop/drain.

**Phase 3 — production hardening:** VAD state riêng, overlap/dedup, send queue hoặc single writer, global GPU scheduler, metrics/backpressure, reconnect/recovery, persistence và load test nhiều session.

## 8. Những file cần đối chiếu trong code hiện tại

- `audio_utils.py`: `deinterleave_stereo()` và `build_response()`.
- `model_inference.py`: `has_voice_activity()` và `transcribe_audio()`.
- `config.py`: sample rate, VAD thresholds, model name, compute type.
- Browser extension: AudioWorklet, PCM serialization, resampling, channel mapping.

> Tài liệu này trình bày một phương án thiết kế và code tham khảo, chưa phải bản vá đã được kiểm thử trên repository thực tế.
