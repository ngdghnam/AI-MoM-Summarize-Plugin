# CPU Speech-to-Text: Hiện trạng, nguyên nhân nhận diện sai và hướng cải thiện

> **Dự án:** AI Record MoM / AI-MoM-Summarize-Plugin  
> **Phạm vi:** Phân tích và đề xuất; **chưa thay đổi source code**.  
> **Nguồn kiểm tra:** ZIP repository do người dùng cung cấp, phiên bản có trong cuộc hội thoại (17–18/11/2026).  
> **Mục tiêu MVP:** Ưu tiên không bỏ sót lời nói, cải thiện độ chính xác tiếng Việt trên CPU, giữ độ trễ chấp nhận được.

## 1. Tóm tắt vấn đề

Hệ thống hiện dùng browser extension truyền audio PCM qua WebSocket tới FastAPI; Silero VAD xác định vùng có tiếng nói, Faster-Whisper chuyển audio thành văn bản. Người dùng báo cáo **nhiều từ thông thường lẫn tên riêng bị nhận diện sai**, ví dụ câu “Tôi là Nguyễn Đặng Hoài Nam” thành “Tôi là Nguyễn Đặng Phòi Năm”. Đây là dấu hiệu cần điều tra cả **chất lượng âm thanh đầu vào, cách chia đoạn và khả năng của model**, không thể quy toàn bộ lỗi cho CPU hay VAD.

**Kết luận cốt lõi:** CPU không tự làm Whisper nhận diện sai; CPU giới hạn tốc độ và kích thước model có thể dùng realtime. WebRTC cũng không tự làm model nghe đúng hơn nếu audio qua WebSocket vốn đã đầy đủ và đúng định dạng.

## 2. Cấu hình và đường đi audio hiện tại (xác nhận từ source)

| Hạng mục | Giá trị / triển khai hiện tại | File |
|---|---|---|
| Whisper | `small`, `device="cpu"`, `compute_type="int8"` | `apps/ai_service/src/config/config.py` |
| Decoding | `beam_size=5`, `condition_on_previous_text=False` | `apps/ai_service/src/utils/model_inference.py` |
| Language | `LANGUAGE=None` (tự nhận diện) | `config.py` |
| Context prompt | `INITIAL_PROMPT=None` | `config.py` |
| Audio PCM | 16 kHz, 2 channels theo cấu hình backend | `config.py` |
| VAD | Silero `get_speech_timestamps`, threshold 0.5, kiểm tra theo cửa sổ 500 ms | `model_inference.py`, `stt_service.py` |
| Pre-roll | 500 ms | `config.py`, `stt_service.py` |
| Kết thúc đoạn | Im lặng 2.500 ms; giới hạn đoạn 20 giây | `config.py`, `stt_service.py` |
| WebSocket | Queue PCM có ngưỡng backlog 30 giây | `apps/ai_service/src/websockets/stt_ws.py` |
| Inference | `_flush_channel()` đợi `asyncio.to_thread(transcribe_audio, ...)` | `stt_service.py` |

Luồng hiện tại:

```text
Browser capture → PCM stereo → WebSocket → receive queue
    → deinterleave left/right → Silero VAD → speech buffer
    → Faster-Whisper small (CPU int8) → transcript
```

**Lưu ý:** Left/right trong cấu hình được gắn nhãn `You`/`Others`. Hai kênh audio không đồng nghĩa tự nhận diện được từng người nói trong một cuộc họp có nhiều người tham gia.

## 3. Những khó khăn khi chạy CPU

### 3.1. Giới hạn tốc độ inference

Model phải giải mã audio bằng CPU; thời gian xử lý có thể dài hơn thời lượng audio, đặc biệt với segment dài hoặc nhiều cuộc họp đồng thời. Dùng **Real-Time Factor (RTF)** để đo:

`RTF = thời gian inference / thời lượng audio`

- `RTF < 1`: riêng lượt inference nhanh hơn thời gian thực; chưa đảm bảo cả pipeline đủ nhanh.
- `RTF >= 1`: dễ tích tụ backlog nếu lời nói đến liên tục.
- Không suy đoán RTF từ cấu hình: phải đo trên CPU thực tế.

### 3.2. Trade-off giữa model size và độ trễ

`small` + `int8` là lựa chọn tiết kiệm tài nguyên nhưng có thể nhận diện kém hơn model lớn với giọng, ngữ cảnh và thuật ngữ khó. `medium` hoặc model chuyên tiếng Việt **vẫn có thể chạy CPU**; vấn đề là liệu có đáp ứng tốc độ, RAM và số cuộc họp đồng thời hay không. GPU không phải điều kiện bắt buộc để thử model khác.

### 3.3. Queue không làm inference nhanh hơn

Trong source, WebSocket có task nhận audio riêng, nhưng task xử lý audio sẽ chờ `_flush_channel()` hoàn thành Whisper. Khi inference chậm, queue đầu vào có thể tăng đến giới hạn 30 giây và kết nối bị đóng. Queue giúp tách nhận dữ liệu khỏi xử lý nhưng không tăng năng lực CPU. Cần đo backlog, throughput và thiết kế backpressure.

### 3.4. Tài nguyên cạnh tranh

Silero VAD và Whisper cùng dùng CPU. Nếu chạy nhiều thread/worker không kiểm soát, tranh chấp tài nguyên có thể khiến tổng latency tăng. Số thread tối ưu phải benchmark trên phần cứng thực tế.

## 4. Vì sao model nghe sai nhiều từ?

### A. Giới hạn khả năng nhận diện của model

Whisper `small` có thể nhầm âm gần nhau, dấu thanh, từ ít gặp, tên riêng và hội thoại tự nhiên. Đây là lỗi **model accuracy** ngay cả khi audio hoàn chỉnh. Không thể khẳng định lỗi này chỉ xảy ra với tên riêng. Giải pháp dài hạn là benchmark model khác, nhưng chưa cần thay model ngay.

### B. Thiếu ngữ cảnh khi transcription

- `LANGUAGE=None`: Whisper tự xác định ngôn ngữ theo mỗi lời gọi; segment ngắn hoặc nói xen Việt–Anh có thể khiến dự đoán không ổn định.
- `INITIAL_PROMPT=None`: chưa có gợi ý từ vựng/chủ đề cuộc họp.
- Mỗi lần `_flush_channel()` gọi `transcribe()` riêng; `condition_on_previous_text=False` không truyền lịch sử transcript giữa các lời gọi. **Chỉ bật thành `True` không tự động tạo context xuyên các lời gọi độc lập.**
- Những đoạn bị cắt giữa câu có thể thiếu từ khóa để phân biệt các cách nghe gần giống nhau.

**Hướng cải thiện B:**

1. Thử cấu hình ngôn ngữ theo cuộc họp (`vi` cho họp chủ yếu tiếng Việt), đồng thời hỗ trợ lựa chọn đa ngôn ngữ khi cần; không hardcode cho mọi người dùng.
2. Duy trì **context history có giới hạn** theo meeting: vài câu đã xác nhận gần nhất, chủ đề, thuật ngữ, tên người tham gia nếu có nguồn đáng tin cậy.
3. Cung cấp context có chọn lọc qua `initial_prompt` hoặc cơ chế phù hợp với phiên bản thư viện; phân biệt transcript đã xác nhận với dự đoán chưa chắc chắn.
4. Đặt giới hạn context, loại bỏ dữ liệu cũ/không liên quan, tránh model lặp từ hoặc tự sinh tên và thuật ngữ không được nói.
5. Đo WER/CER trước và sau thay đổi; không dùng prompt như công cụ tự động sửa mọi lỗi.

### C. VAD và chia đoạn chưa tối ưu

Trong `stt_service.py`, audio được gom để đánh giá VAD theo ngưỡng 500 ms. Khi đủ mẫu, code xử lý **toàn bộ `eval_buffer` rồi xóa buffer**, không giữ phần mẫu dư sang cửa sổ kế tiếp. Điều này có thể làm thời lượng mỗi lần đánh giá không đều; không nhất thiết gây mất audio, nhưng làm ranh giới xử lý kém nhất quán.

`get_speech_timestamps()` được gọi trên từng cửa sổ độc lập để trả lời có/không có giọng nói. Các âm tiết nhỏ, đầu câu hoặc đoạn nằm sát ranh giới có thể khó phát hiện. Pre-roll 500 ms giúp nhưng không bảo đảm mọi âm đầu đều được giữ. Khi chạm ngưỡng 20 giây, segment có thể bị cắt giữa câu. Khi không phát hiện giọng nói, buffer chỉ giữ pre-roll giới hạn; cần kiểm chứng thực tế liệu có bỏ sót đoạn nói ngắn hay không.

**Hướng cải thiện C:**

1. Giữ **audio buffer liên tục** và tách chính xác các frame đánh giá VAD, bảo toàn phần dư.
2. Dùng VAD streaming có trạng thái hoặc cửa sổ overlap + hysteresis; kiểm tra với giọng nói nhỏ, nhanh và ngập ngừng.
3. Tách **VAD** (có tiếng nói không?) khỏi **Segmenter** (cắt ở đâu để STT có đủ ngữ cảnh?).
4. Duy trì pre-roll, post-roll và overlap audio tại ranh giới; có cơ chế loại bỏ text trùng khi ghép transcript.
5. Cắt ưu tiên tại khoảng lặng tự nhiên; có max segment để giữ latency nhưng không cắt cứng giữa âm tiết nếu có thể tránh.
6. Chuyển segment sang **transcription queue** độc lập để VAD không phải chờ Whisper; bảo đảm thứ tự kết quả, backpressure và xử lý khi kết thúc phiên.

## 5. Không nên nhầm lẫn nguyên nhân

| Hiện tượng | Nghi vấn chính | Cách xác minh |
|---|---|---|
| File audio gốc nghe rõ nhưng Whisper vẫn viết sai | Model / language / context | Chạy trực tiếp trên file, không qua VAD/WebSocket |
| File gốc đúng nhưng audio sau VAD bị cụt | VAD / segmentation | Nghe và đối chiếu các segment thực tế |
| File gốc đúng nhưng audio nhận ở server méo hoặc đứt | Capture / format / transport | So sánh audio browser và backend, sample rate, PCM, timestamps |
| Transcript đến chậm, backlog tăng | CPU throughput / blocking | Đo inference time, RTF, queue depth |
| Transcript bị lặp ở ranh giới | Overlap / ghép kết quả | Kiểm tra timestamp và deduplication |

## 6. Lộ trình cải thiện đề xuất (chưa triển khai)

### P0 — Instrumentation và baseline

- Lưu ba dạng audio của **cùng một câu thử**: browser raw, backend received, audio segment đưa vào Whisper.
- Ghi sample rate, channels, số samples, duration, mức âm lượng, clipping và timestamp.
- Đo latency VAD, inference, tổng latency, RTF, queue depth, số lần bị overflow.
- Tạo bộ câu tiếng Việt có transcript chuẩn: câu ngắn/dài, nói tự nhiên, từ thông thường, tên riêng, thuật ngữ, Việt–Anh.

**Tiêu chí hoàn thành:** Phân biệt được lỗi audio/pipeline với lỗi model bằng thử nghiệm có thể lặp lại.

### P1 — Ưu tiên C: VAD + Segmentation

- Buffer liên tục, không bỏ mẫu dư; kiểm thử bảo toàn số samples.
- Tách VAD khỏi quyết định cắt segment; thêm pre/post-roll và kiểm soát overlap.
- Thử nhiều cấu hình silence, threshold, segment duration bằng cùng bộ audio.

**Tiêu chí hoàn thành:** Segment không cắt mất từ/âm đầu-cuối và không phát sinh nhiều bản sao transcript.

### P2 — Queue phù hợp CPU

- Audio ingestion và VAD chạy độc lập với Whisper worker.
- Giới hạn số worker theo CPU; queue có giới hạn và chính sách overload rõ ràng.
- Trả transcript đúng thứ tự từng channel/meeting; xử lý nốt segment khi stop, không mất dữ liệu âm thầm.

**Tiêu chí hoàn thành:** Không bị ngắt audio do inference blocking trong kịch bản tải mục tiêu; backlog và độ trễ được đo rõ.

### P3 — Ưu tiên B: Context-aware transcription

- Language theo meeting và context history có giới hạn.
- Context từ chủ đề, transcript gần nhất và thuật ngữ đã biết; không phụ thuộc vào việc người dùng nhập tay tên.
- Thử nghiệm A/B có và không có prompt/context; kiểm tra hallucination và lặp từ.

**Tiêu chí hoàn thành:** WER/CER giảm trên bộ kiểm thử, không làm tăng lỗi chèn từ hoặc suy diễn quá mức.

### P4 — Benchmark model trên CPU

- So sánh `small` với các cấu hình hoặc model CPU khả thi khác trên **cùng audio**.
- Đo WER/CER, RTF, RAM, CPU usage, latency p50/p95.
- Chỉ cân nhắc GPU khi kết quả cho thấy model tốt hơn nhưng không đạt latency/throughput trên CPU.

## 7. Cách đánh giá kết quả

- **WER:** `(substitutions + deletions + insertions) / số từ trong transcript chuẩn`.
- **CER:** Tỷ lệ lỗi ký tự; hữu ích khi đánh giá tiếng Việt, dấu thanh và tên riêng.
- **RTF:** Thời gian inference / thời lượng audio.
- **End-to-end latency:** Từ lúc người nói kết thúc đoạn đến khi transcript hiển thị.
- **Audio integrity:** Số mẫu/timestamp bị thiếu, số đoạn bị cắt hoặc lặp.

Không đặt mục tiêu “nghe chính xác 100%” hoặc khẳng định cải thiện khi chưa có benchmark. Phải dùng **cùng bộ audio và transcript chuẩn** để so sánh trước/sau từng thay đổi.

## 8. Những điều chưa kết luận được từ source

- Chưa có file audio thực tế để khẳng định nguyên nhân chính là Whisper hay VAD.
- Chưa có benchmark trên CPU thực tế nên không thể khẳng định `medium` quá chậm hoặc `small` đủ nhanh.
- Chưa xác minh chất lượng audio capture thực tế từ browser, sample rate và mức mất chunk.
- Chưa có số liệu WER/CER hoặc tỷ lệ lỗi do từng tầng.

## 9. Quyết định cho MVP

**Giữ WebSocket + Faster-Whisper `small` CPU `int8` làm baseline.** Chưa đổi sang WebRTC, chưa yêu cầu GPU, chưa sửa code khi chưa có phép đo baseline. Ưu tiên theo thứ tự: **(1) đo audio và lỗi, (2) cải thiện VAD/segmentation, (3) tách queue để bảo vệ luồng realtime, (4) thêm context có kiểm soát, (5) benchmark model CPU khác nếu cần.**

> README này là tài liệu phân tích và roadmap, **không phải xác nhận rằng các thay đổi đã được triển khai hoặc đã cải thiện accuracy**.
