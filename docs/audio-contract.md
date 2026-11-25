# Audio contract và instrumentation

## Đang triển khai

Extension kết nối `/ws/transcribe`, gửi mỗi binary WebSocket message là raw
PCM16 little-endian interleaved stereo, sample rate 16.000 Hz. Một frame là 4 byte
(`[left int16, right int16]`). Payload không chia hết cho 4 bị đóng với code 1003.
Không gửi header WAV, Float32, WebM hoặc Opus. Payload rỗng không thêm sample.

| Kênh | Nguồn | Nhãn UI hiện tại |
| --- | --- | --- |
| left | local_mic | You |
| right | remote_tab, audio tab tổng hợp | Others |

Nhãn nguồn không xác minh danh tính. Không suy ra từng người nói từ remote mix.
Extension vẫn dùng ScriptProcessor 4.096 frame; kiểm tra `AudioContext.sampleRate`
thực tế và báo lỗi nếu khác 16 kHz. Sample rate track đầu vào có thể khác; browser
xử lý nguồn trong AudioContext. Chưa có resampler riêng hoặc AudioWorklet.
Sample count extension tính trên callback audio, không đo được khoảng mất trước callback.
Int16Array phía browser dùng native endian trên các nền tảng browser hiện được thử;
việc đóng gói little-endian tường minh sẽ được chuẩn hóa trong task capture.

Response giữ nguyên `{channel, speaker, text, timestamp}`. Không thêm control message.
Stop hiện đóng socket; backend hủy task xử lý, không drain hoặc gọi `flush_all`.
Inference đã chạy trong thread có thể tiếp tục sau khi task asyncio bị hủy;
không được suy ra đã hoàn tất hoặc đã hủy CPU inference từ disconnect.

## Timeline và telemetry hiện có

Mỗi kết nối server có UUID session, sequence nhận bắt đầu 1 và sample offset bắt
đầu 0. Offset là frame **mỗi kênh**, khoảng `[start_sample, end_sample)`; duration
là `(end-start)/16000`. Segment sequence riêng mỗi kênh bắt đầu 1.

Server tự đánh số lúc nhận. Nó không thể phát hiện chunk mất trước khi đến server,
duplicate do client gửi lại hoặc so sánh timestamp browser/server. Chưa resume phiên.
Tracker giữ nguyên cửa sổ VAD hiện tại (gom toàn bộ eval buffer khi đủ 500 ms),
bao gồm pre-roll và tail khi `flush_all` được gọi trực tiếp. Không đổi segmentation.

Các event JSON đi qua Python logging hiện có:

- `session_start`, `received`, `received_levels`: config, sequence, frame ranges,
  RMS/peak và clipping ratio theo từng kênh, không chứa audio/text.
- `backlog`, `dequeued`, `chunk_processed`: queue theo giây audio, thời gian chờ
  và receive-to-processed. Backlog chỉ tính queue, không gồm chunk đang xử lý.
- `vad`, `segment`, `inference`, `result_sent`: vùng sample, decision/thời gian
  VAD, duration, mức âm, thời gian inference và `RTF = inference_s/duration_s`.
- `result_sent.receive_end_to_send_s`: từ lúc nhận chunk chứa sample cuối segment
  đến lúc send trả về; không phải latency từ người nói ngừng nói đến UI.
  Lịch sử timestamp bị chặn ở 512 chunk; ngoài phạm vi này giá trị là null.
- `session_end`, `pending_state`: kết quả chưa hoàn tất, queued/active/in-flight
  ranges và số sample còn trong eval/speech/pre-roll. Không cộng các số này
  tùy tiện: active chunk có thể đã đi vào một channel nhưng chưa vào channel kia.

Duration dùng monotonic clock. PCM chuẩn hóa theo 32768; clipping là tỷ lệ sample
chạm -32768 hoặc +32767. Không log transcript mặc định. Số liệu về pre-roll đang
giữ không chứng minh đó là lời nói bị mất; cần nghe artifact và đối chiếu VAD.

## Debug audio hiện có

`STT_DEBUG_AUDIO=1` bật ghi local, mặc định tắt. `STT_DEBUG_DIR` mặc định `sessions`
theo working directory; mỗi session có `received.wav` stereo trước VAD, WAV mono
`left/right-NNNNNN.wav` đúng audio trước STT và `manifest.jsonl` nối vùng sample.
Log thường không chứa transcript; báo cáo replay có transcript do người dùng chủ động tạo.

`STT_DEBUG_MAX_BYTES` mặc định 67.108.864 byte cho WAV và manifest mỗi session.
`STT_DEBUG_MAX_SECONDS` mặc định 600, giới hạn cả thời gian mở debug và duration
audio nhận. Chạm quota/lỗi I/O thì tắt ghi artifact, log lý do, giữ pipeline chạy.
File được đóng khi disconnect; đã ghi đến đâu giữ đến đó. Không có retention tự
động hay quota tổng giữa các session: operator phải xóa artifact sau đánh giá,
giới hạn quyền truy cập và chỉ bật khi được phép thu audio. `sessions/` bị Git ignore.
Nếu đổi debug directory, operator phải bảo đảm directory đó cũng không bị commit.

## Đề xuất v1 — chưa triển khai

Giữ client binary hiện tại trong giai đoạn chuyển tiếp. Client v1 phải opt-in rõ
bằng WebSocket subprotocol `stt.pcm.v1`; server chỉ chấp nhận khi đã triển khai,
không tự suy đoán từ bytes. Không fallback âm thầm sang legacy.

1. Client gửi JSON `start`: `session_id` (UUID mới mỗi kết nối), `sample_rate:16000`,
   `encoding:"pcm_s16le"`, `channels:["local_mic","remote_tab"]`. Server ACK `started`.
2. Mỗi binary message có header 24 byte: `sequence`, `start_sample`, `sample_count`,
   đều unsigned 64-bit little-endian, sau đó là PCM stereo. Sequence bắt đầu 1,
   offset bắt đầu 0; count là frame mỗi kênh, payload đúng `count*4` byte.
   Số JSON tương ứng phải nằm trong miền safe integer của JavaScript.
3. Sequence hoặc offset không liên tục: server báo `error` với `code`, session,
   expected/received và kết thúc incomplete; không tự chèn im lặng hay bỏ duplicate.
4. Stop: client ngừng capture, gửi phần PCM cuối, rồi JSON `stop` có session,
   `last_sequence`, `end_sample` trên cùng socket. Phiên không có audio dùng 0/0.
   Server kiểm tra counters, flush tail, drain, gửi kết quả cuối rồi
   `transcription_complete` có session và counters đã xử lý; sau đó đóng bình thường.
5. Timeout/mất mạng/overload không phải complete. Reconnect tạo UUID mới;
   chưa có persistence nên không hứa resume. Transcript v1 thêm session, source,
   segment sequence và sample ranges; vẫn giữ các trường response cũ.

Đây là contract để task 02–06 phối hợp, không phải tính năng đang hoạt động.
