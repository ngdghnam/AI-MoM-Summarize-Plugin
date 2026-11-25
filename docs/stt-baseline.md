# Baseline STT: vận hành và kết quả

## Chạy công cụ

Dùng virtualenv đã cài `requirements.txt`. PyAV là dependency hiện có của
Faster-Whisper. Các lệnh dưới chạy từ `apps/ai_service` trong PowerShell.

```powershell
# Chuyển đổi tường minh; giữ file gốc, tạo WAV và conversion sidecar chứa hash.
../../.venv/Scripts/python.exe tools/prepare_wav.py ../../test/sample_speech.wav ../../sessions/baseline/sample-16k.wav

# Kiểm tra format và ghi config, hash, môi trường; không load model.
../../.venv/Scripts/python.exe tools/replay.py inspect ../../sessions/baseline/sample-16k.wav --output ../../sessions/baseline/inspect.json

# Offline: cần model small trong cache; không tự tải mạng.
# Tách load model, warm-up, rồi ít nhất 3 lượt cho từng kênh không im lặng.
../../.venv/Scripts/python.exe tools/replay.py offline ../../sessions/baseline/sample-16k.wav --output ../../sessions/baseline/offline.json

# Chạy service ở terminal khác, dùng HOST/PORT như cấu hình hiện có.
# WAV debug tùy chọn: chỉ bật cho audio được phép thu.
$env:STT_DEBUG_AUDIO = "1"
$env:STT_DEBUG_DIR = "../../sessions/stream-debug"
../../.venv/Scripts/python.exe server.py

# Terminal client: điều chỉnh URI theo PORT đang chạy.
../../.venv/Scripts/python.exe tools/replay.py streaming ../../sessions/baseline/sample-16k.wav --uri ws://127.0.0.1:8000/ws/transcribe --output ../../sessions/baseline/streaming.json

# Sau khi socket kết thúc, tổng hợp đúng manifest của phiên vừa chạy.
../../.venv/Scripts/python.exe tools/replay.py events ../../sessions/stream-debug/SESSION_ID/manifest.jsonl --output ../../sessions/baseline/server-metrics.json
```

`--source left|right` chọn nguồn cho WAV mono; WAV stereo giữ nguyên hai kênh.
`--reference path.json` nhận object `left/right` chứa bản chép thực tế. Chuẩn hóa
NFC, chữ thường, bỏ Unicode punctuation, gom whitespace; giữ dấu tiếng Việt,
không chuyển số/chữ viết tắt. CER tính cả khoảng trắng đã chuẩn hóa.
Reference rỗng trả rate null, vẫn báo số insertion. WER/CER và text gốc nằm trong
report; chỉ so sánh trên cùng hash audio, nguồn, reference và quy tắc chuẩn hóa.
Model/decoding config không thay giữa offline và streaming.

Streaming mặc định gửi 4.096 frame/chunk, realtime, thêm 4 giây silence riêng rồi
chờ tối đa 30 giây (`--chunk-frames`, `--tail-seconds`, `--wait-seconds`). Report
ghi riêng sample thật và silence thêm; silence không tính vào duration đầu vào.
Tail im lặng là trợ giúp benchmark legacy, không phải sửa lifecycle production.
`--stop-at 2.5` cắt gửi tại thời điểm tương đối và đóng ngay, không thêm silence.

Giao thức chưa có completion ACK nên hết thời gian chờ luôn là
`wait_expired_completion_unverified`, kể cả khi đã nhận text. Disconnect/Stop và
lỗi đều incomplete. CLI ghi report kể cả lỗi kết nối: phải đọc status, không dùng
exit code làm bằng chứng phiên đã complete. Streaming score có thể chỉ là phần
output; không xem đó là accuracy toàn bộ nếu chưa kiểm tra audio/manifest.
Report client không có server RTF/backlog; dùng lệnh `events` và đối chiếu đúng
session từ manifest. Manifest debug hết quota không phải telemetry đầy đủ.
Phân vị chỉ mô tả số quan sát có thật; một segment không tạo ra phân bố đáng tin.

## Kết quả smoke thực tế — 18/11/2026

Đầu vào duy nhất hiện có `test/sample_speech.wav`: mono PCM16, 22.050 Hz,
107.468 frame, khoảng 4,874 giây. Chuyển bằng PyAV 19.0.2 thành mono PCM16 16 kHz,
77.982 frame. SHA256 file chuẩn:
`529affbfa93e5a404b1e45e013100cf40dc308a7431fe24696d99ee658ee6041`.

Môi trường: Windows 11, Python 3.12.9, CPU `Intel64 Family 6 Model 140 Stepping 1`,
8 logical CPU; numpy 2.5.5, faster-whisper 1.2.1, silero-vad 6.2.3, websockets 17.4.
Model small CPU int8, beam 5, auto-language, không prompt; snapshot
`536b0662742c02347bc0e980a01041f333bce120`.

| Phép đo offline, nguồn trái | Kết quả |
| --- | --- |
| Load model | 2,000 giây |
| Warm-up | 4,734 giây |
| Inference 3 lượt | 4,531 / 6,703 / 5,422 giây |
| RTF 3 lượt | 0,930 / 1,375 / 1,112 |
| Median RTF | 1,112 |

Smoke WebSocket local dùng đúng WAV, chunk 4.096 frame, tail 4 giây, chờ 3 giây:
nhận 1 result. Segment trái `[0,106496)`, duration 6,656 giây, clipping ratio 0;
RTF một inference 0,693, peak backlog 2,218 giây audio; queue-wait p95 3,961 giây.
Receive-chunk-cuối đến send là 4,625 giây, không phải latency UI.
Server nhận 141.982 frame/kênh gồm 64.000 frame silence thêm. Manifest cuối có
queue 0 nhưng còn 2.718 frame eval/channel, không có speech pending; trạng thái
vẫn `disconnected_incomplete`. Đây là hành vi legacy đã được quan sát.

Artifact local nằm trong `sessions/baseline/`: `offline.json`, `streaming.json`,
conversion sidecar và `stream-artifacts/<session>/`. Không commit audio/text debug.
Các số này là smoke sample ngắn trên máy hiện tại, không chứng minh throughput
realtime bền vững, cải thiện accuracy hay hiệu năng CPU mục tiêu. Chưa có reference
được nghe và xác nhận, vì vậy chưa tính WER/CER. Không suy ra ground truth từ TTS
script hoặc từ chính output model.

## Kiểm chứng và phần còn thiếu

- 17 tests Python pass: format/endian, pre-roll/tail sample ranges, WAV, quota,
  conversion, replay scoring, metrics, Stop và lifecycle. 8 tests extension pass:
  lifecycle, PCM mapping và từ chối sample rate thực tế không phù hợp.
- TypeScript toàn extension còn lỗi ngoài phạm vi task ở `components/ui/pagination.tsx`
  (type-only import) và `components/ui/resizable.tsx` (API react-resizable-panels).
- Chưa kiểm chứng browser/capture thực tế, chưa có bộ audio người thật với reference
  Việt/Anh/xen kẽ và chưa xác nhận máy hiện tại là CPU mục tiêu.
- Thu theo [recording kit](stt-recording-kit.md), chạy cùng bộ offline/streaming,
  lưu config và ít nhất 3 lượt sau warm-up; tổng hợp riêng từng nhóm ngôn ngữ.
  Streaming cần ghi phiên warm-up và các phiên đo riêng; CLI chỉ chạy một phiên/lệnh.
- Giữ task 01 mở tới khi có audio/reference và kết quả browser. Chưa sửa VAD,
  transcription queue, model, context hoặc Stop/drain trong task này.
