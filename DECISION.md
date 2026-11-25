# Các quyết định thiết kế

Ghi ngắn gọn quyết định, lý do và thời điểm. Với lựa chọn có sẵn nhưng không tìm thấy
ngày phê duyệt, ngày tiêu đề là **ngày ghi nhận**, không phải ngày quyết định ban đầu.
Trạng thái “hiện có” mô tả mã/tài liệu, không thay cho phê duyệt kiến trúc.
Đề xuất chỉ chuyển sang “được chấp thuận” sau khi người dùng phê duyệt.
Quyết định lớn cần ADR riêng theo AGENTS.md; `docs/decisions/` hiện chưa tồn tại.

## 2026-11-26: Tách trạng thái dự án và nhật ký quyết định

- Trạng thái: được người dùng yêu cầu trong nhiệm vụ này.
- Quyết định: dùng `PROGRESS.md` cho tiến độ/test/blocker/bước tiếp theo; `DECISION.md` cho lựa chọn quan trọng và lý do.
- Lý do: giữ thông tin bàn giao ngắn gọn, dễ cập nhật và truy lại căn cứ.
- Phương án bị loại: chưa có phương án thay thế được thảo luận hoặc phê duyệt.
- Ràng buộc: không thay tài liệu contract/ADR bằng mô tả trùng lặp; không ghi đề xuất như tính năng đã triển khai.

## 2026-11-26: Faster-Whisper đa ngôn ngữ trên CPU

- Trạng thái: hiện có; ngày quyết định ban đầu chưa xác định.
- Quyết định: `small`, CPU `int8`, beam 5, tự nhận diện ngôn ngữ từng segment, không initial prompt.
- Lý do: phù hợp định hướng MVP chạy CPU và giữ ngôn ngữ lời nói; hiệu năng cần đánh giá bằng baseline.
- Phương án bị loại: chưa có bằng chứng về quyết định loại GPU/model khác; không coi chúng là đã bị loại.
- Ràng buộc: smoke hiện có không chứng minh realtime hoặc accuracy trên audio cuộc họp.
- Nguồn: [config](apps/ai_service/src/config/config.py), [inference](apps/ai_service/src/utils/model_inference.py), [baseline](docs/stt-baseline.md).

## 2026-11-26: Phân biệt nguồn audio với danh tính người nói

- Trạng thái: hiện có và là nguyên tắc trong AGENTS.md; ngày quyết định ban đầu chưa xác định.
- Quyết định: kênh trái là `local_mic`/`You`, kênh phải là `remote_tab`/`Others`; không suy ra danh tính từng người từ remote mix.
- Lý do: audio tab tổng hợp không cung cấp bằng chứng để ánh xạ từng giọng nói sang tài khoản hoặc người tham dự.
- Phương án bị loại: gán danh tính từ nhãn kênh hoặc tài khoản đăng nhập khi thiếu bằng chứng.
- Ràng buộc: diarization và xác minh danh tính là các bước riêng; phải giữ trạng thái chưa biết khi thiếu bằng chứng.
- Nguồn: [audio contract](docs/audio-contract.md), [hướng dẫn dự án](AGENTS.md).

## 2026-11-26: Debug audio theo cơ chế bật chủ động và có quota

- Trạng thái: hiện có trong working tree; ngày quyết định ban đầu chưa xác định.
- Quyết định: mặc định tắt ghi WAV debug; bật bằng `STT_DEBUG_AUDIO=1`, giới hạn byte/thời lượng mỗi session; log thông thường không chứa transcript.
- Lý do: cần truy vết capture/VAD/STT nhưng hạn chế lưu nội dung cuộc họp và tăng dung lượng ngoài ý muốn.
- Phương án bị loại: ghi audio/transcript mặc định, trái nguyên tắc tối thiểu hóa dữ liệu; chưa có biên bản đánh giá phương án trước đây.
- Ràng buộc: chưa có retention tự động hoặc quota tổng; operator phải quản lý quyền truy cập và xóa artifact.
- Nguồn: [audio contract](docs/audio-contract.md), [audio diagnostics](apps/ai_service/src/utils/audio_diagnostics.py).

## 2026-11-26: Giao thức v1 có sequence và Stop/drain rõ ràng

- Trạng thái: **đề xuất, chưa triển khai/chưa ghi nhận phê duyệt**; ngày đề xuất ban đầu chưa xác định.
- Quyết định đề xuất: opt-in bằng `stt.pcm.v1`, có session/sequence/sample offsets, `stop` và `transcription_complete`; giữ client legacy trong giai đoạn chuyển tiếp.
- Lý do: phát hiện audio không liên tục và phân biệt hoàn tất xử lý với việc socket đã đóng.
- Phương án không chọn trong đề xuất: tự đoán protocol từ bytes hoặc coi disconnect là complete, vì không bảo đảm tính toàn vẹn audio.
- Ràng buộc: không tự fallback, không hứa resume; triển khai sau khi được duyệt. Contract chi tiết nằm trong tài liệu nguồn.
- Nguồn: [đề xuất v1](docs/audio-contract.md), [task Stop/drain](todo/06-stop-drain-integration.md).

## Cách duy trì

Đọc và cập nhật file này cùng PROGRESS.md ở đầu và cuối mỗi phiên theo [AGENTS.md](AGENTS.md).
Nếu không có quyết định mới, ghi checkpoint ngắn thay vì tạo quyết định giả.

Thêm mục theo ngày khi có lựa chọn quan trọng. Ghi rõ trạng thái, quyết định, lý do,
phương án thay thế thực sự được cân nhắc và ràng buộc. Nếu thiếu bằng chứng, ghi rõ
chưa xác định. Khi thay thế quyết định cũ, giữ lịch sử và liên kết mục thay thế.

## 2026-11-26: Bắt buộc cập nhật tài liệu ở đầu và cuối phiên

- Trạng thái: được người dùng yêu cầu và chấp thuận trong nhiệm vụ này.
- Quyết định: mỗi phiên phải đọc/cập nhật PROGRESS.md và DECISION.md khi bắt đầu và trước khi kết thúc hoặc bàn giao, kể cả công việc chưa hoàn tất.
- Lý do: bảo đảm phiên tiếp theo có trạng thái và căn cứ quyết định cập nhật để tiếp tục công việc.
- Phương án thay thế: chỉ cập nhật sau mỗi task như hướng dẫn trước đây không đáp ứng yêu cầu mới về hai mốc của phiên.
- Ràng buộc: ghi rõ kiểm tra chưa chạy, giữ công việc chưa xong, không bịa quyết định; nếu không có quyết định mới thì ghi checkpoint. Phiên gián đoạn được đối chiếu bổ sung ở phiên tiếp theo.
- Checkpoint đầu phiên/nhiệm vụ: xác nhận yêu cầu trên; không thay đổi các quyết định kiến trúc đã ghi.
- Checkpoint kết thúc: đã đưa quy tắc vào AGENTS.md và đồng bộ hai file; không có quyết định bổ sung.

## 2026-11-26: Tách hướng dẫn agent theo chủ đề trong docs

- Trạng thái: được người dùng yêu cầu trong nhiệm vụ này.
- Quyết định: giữ AGENTS.md làm entry point ngắn với tổng quan, onboarding, tối đa 15 quy tắc toàn cục và routing có điều kiện; chuyển chi tiết vào `docs/agent-guides/`.
- Lý do: giúp agent đọc đúng hướng dẫn liên quan mà không phải nạp toàn bộ chỉ dẫn dài cho mọi task.
- Phương án thay thế: giữ toàn bộ hướng dẫn trong một file; không phù hợp yêu cầu dung lượng/định tuyến.
- Ràng buộc: target `make test` hiện chưa có trong Makefile; hướng dẫn phải nói rõ thay vì ngầm coi lệnh onboarding chạy được. Nội dung chuyển chỗ phải giữ nguyên các yêu cầu về checkpoint phiên, task, kiến trúc và dữ liệu cuộc họp.
- Checkpoint đầu phiên: rà AGENTS.md, Makefile và tài liệu tracking; không có quyết định mới ngoài yêu cầu chia nhỏ này.
- Checkpoint kết thúc: đã tách tài liệu; không có quyết định bổ sung. Kiểm tra cuối sẽ ghi trong PROGRESS.md.

## 2026-11-26: Make Progress and Decision guidance discoverable from AGENTS.md

- Status: requested by the user in this session.
- Decision: add a dedicated AGENTS.md routing entry that states the purpose and required start/end updates for PROGRESS.md and DECISION.md; keep detailed procedures in the session guide.
- Rationale: agents should find the tracking requirement from the root entry point without searching a separate guide first.
- Alternative considered: relying on the generic session/task routing row; the user observed this was not explicit enough.
- Constraint: English documentation; do not invent new decision records where no decision changed.
- Start checkpoint: no new project design decision beyond improving instruction discoverability.
- End checkpoint: documentation update made; no additional project decision.

## 2026-11-26: commit and push checkpoint

- Start: user authorized committing and pushing existing changes to the current branch. No new architecture or behavior decision; existing proposal statuses remain unchanged.


- End checkpoint: no additional architecture or behavior decisions. Existing changes verified with 13 extension and 17 Python tests; user-requested commit and push proceeds on master.
