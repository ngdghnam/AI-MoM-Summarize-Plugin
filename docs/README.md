# Tài liệu dự án

## Hướng dẫn agent

- [Hướng dẫn gốc](../AGENTS.md): tổng quan, lệnh khởi đầu, quy tắc toàn cục và routing.
- [Quy trình agent](agent-guides/workflow.md): đọc khi bắt đầu mọi task.
- [Phiên và task tracking](agent-guides/session-and-tasks.md): đọc khi làm việc giữa nhiều phiên hoặc tạo/cập nhật task.
- [Kiến trúc và ranh giới](agent-guides/architecture.md): đọc khi task chạm architecture hoặc ranh giới dịch vụ.
- [Audio/transcription](agent-guides/audio-transcription.md): đọc khi task chạm capture, audio pipeline hoặc STT.
- [Context/speaker](agent-guides/context-speakers.md): đọc khi task chạm glossary, participant hoặc attribution.
- [Tài liệu và quyết định](agent-guides/documentation-decisions.md): đọc khi đổi behavior, interface, deployment hoặc quyết định.
- [Kiểm thử](agent-guides/testing.md): đọc khi chọn hoặc báo cáo lệnh kiểm tra.

- [Tiến độ dự án](../PROGRESS.md): trạng thái, kiểm chứng, vấn đề và bước tiếp theo.
- [Các quyết định thiết kế](../DECISION.md): lựa chọn quan trọng, lý do và trạng thái.

## Hiện trạng và công cụ

- [Contract audio và telemetry](audio-contract.md): giao thức đang chạy, giới hạn truy nguồn, giao thức kế tiếp **đề xuất**.
- [Baseline STT](stt-baseline.md): lệnh replay, debug, kết quả đã đo và phần chưa nghiệm thu.
- [Kịch bản tự thu](stt-recording-kit.md): audio Việt/Anh/xen kẽ và bản chép chuẩn.
- [Vận hành extension](../apps/extension/README.md): vòng đời lỗi UI, reload bản sửa và kiểm tra manifest.

## Phân tích và thiết kế tham khảo

- [Giới hạn CPU STT](README_CPU_STT_LIMITATIONS.md).
- [Pipeline và transcription queue](stt_pipeline_transcription_queue.md).
- [Context-aware architecture](context-aware-transcription-architecture.md).
- [AI correction proposal](transcript_ai_correction_proposal.md).

Các tài liệu phân tích không chứng minh thiết kế đã được triển khai. Các thư mục
`architecture/`, `development/` và `decisions/` được AGENTS.md dẫn tới hiện chưa tồn tại.
