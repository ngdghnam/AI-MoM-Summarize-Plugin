# Tiến độ dự án

## Trạng thái hiện tại

- Cập nhật: 26/11/2026. Đây là ảnh chụp trạng thái, cập nhật lại sau mỗi thay đổi hoặc kiểm chứng đáng kể.
- Commit mới nhất: `9fa89cd` — `Update Agents.md` (18/11/2026).
- Working tree: có thay đổi chưa commit ở extension, AI service và tài liệu; trạng thái dưới đây bao gồm các thay đổi cục bộ, không chỉ nội dung HEAD.
- Trạng thái test: extension **13/13 pass**, không skip, chạy ngày 26/11/2026 bằng `node --test apps/extension/tests/recording-lifecycle.test.cjs apps/extension/tests/manifest-matches.test.cjs`. Test manifest kiểm tra artifact build có sẵn, chưa build lại trong lần cập nhật này.
- Python: **17/17 tests pass**, chạy ngày 26/11/2026 từ `apps/ai_service` bằng `../../.venv/Scripts/python.exe -m unittest discover -s tests -p "test_*.py"`. Chưa xác nhận toàn bộ test của monorepo/API trong lần cập nhật này.
- Lint: chưa chạy trong lần cập nhật này; chưa có cơ sở ghi pass.
- Typecheck: [README extension](apps/extension/README.md) ghi nhận lỗi ở `pagination.tsx` và `resizable.tsx`; chưa chạy lại trong lần cập nhật này.

## Đã hoàn thành

Các mục dưới đã có mã/tài liệu trong working tree; không đồng nghĩa đã nghiệm thu trên trình duyệt hoặc triển khai production.

- [x] Extension có luồng Start/Stop, capture mic/tab và hiển thị live captions.
- [x] Python có WebSocket `/ws/transcribe`, Silero VAD và Faster-Whisper `small` trên CPU `int8`.
- [x] Kiểm tra PCM stereo 16 kHz, telemetry/sample tracing và debug WAV tùy chọn.
- [x] Công cụ chuyển WAV, replay offline/streaming và kịch bản tự thu audio có reference.
- [x] Smoke baseline trên WAV mẫu; kết quả và giới hạn ghi trong [baseline STT](docs/stt-baseline.md).
- [x] Test vòng đời extension, lỗi UI và phạm vi content scripts trong manifest.
- [x] Khởi tạo NestJS API với endpoint mẫu; chưa phải backend quản lý cuộc họp.

## Đang thực hiện

- [ ] Nghiệm thu baseline: thiếu audio/reference người thật Việt/Anh/xen kẽ, kiểm chứng capture trong Chrome và xác nhận CPU mục tiêu; xem [task 01](todo/01-audio-contract-baseline.md).

Không gán phần trăm tiến độ khi chưa có tiêu chí đo. Task 02–06 là kế hoạch, chưa tính là đang triển khai hoặc hoàn thành.

## Vấn đề đã biết

- Stop/disconnect hiện đóng socket, chưa flush/drain và chưa có completion ACK; có thể còn audio chưa xử lý.
- `You`/`Others` là nhãn nguồn mic/tab; remote tab là audio tổng hợp, chưa xác minh danh tính từng người nói.
- Smoke audio ngắn chưa chứng minh realtime bền vững hoặc accuracy; chưa có reference được xác nhận để tính WER/CER.
- Chưa có resampler riêng; capture từ chối AudioContext có sample rate thực tế khác 16 kHz.
- Chưa có backend nghiệp vụ, persistence cuộc họp, glossary/context engine hoặc sinh biên bản hoàn chỉnh được xác nhận từ mã đã kiểm tra.
- `README.md` gốc đang rỗng; các tài liệu định tuyến trong `docs/architecture/`, `docs/development/`, `docs/decisions/` chưa tồn tại.

## Các bước tiếp theo

Đây là thứ tự dự kiến từ các task hiện có, không phải quyết định triển khai mới.

1. Hoàn tất thu audio/reference và kiểm chứng browser để nghiệm thu baseline task 01.
2. Chuẩn hóa capture theo [task 02](todo/02-audio-capture.md).
3. Cải thiện segmentation và STT queue theo [task 03](todo/03-segmentation-stt-queue.md).
4. Xử lý overlap/transcript và context theo [task 04](todo/04-overlap-transcript.md), [task 05](todo/05-context-across-segments.md).
5. Tích hợp Stop/drain và kiểm thử theo [task 06](todo/06-stop-drain-integration.md); giao thức v1 vẫn là [đề xuất](docs/audio-contract.md).

6. Bổ sung target `make test` để lệnh onboarding gốc chạy được; hiện Makefile chưa có target này.

## Cách duy trì

Cập nhật cả PROGRESS.md và DECISION.md ở đầu và cuối mỗi phiên theo [AGENTS.md](AGENTS.md).
Cập nhật commit, trạng thái working tree, lệnh/ngày/phạm vi kiểm tra và blocker sau mỗi task.
Chỉ đánh dấu hoàn thành khi có bằng chứng; quyết định và lý do lưu ở [DECISION.md](DECISION.md).
Giữ số liệu lịch sử kèm ngày, không coi chúng là kết quả vừa chạy.

## Bàn giao phiên — 26/11/2026: quy tắc đầu/cuối phiên

- Đầu phiên/nhiệm vụ: đọc lại hướng dẫn và hai file theo dõi; HEAD `9fa89cd`, working tree có thay đổi ứng dụng/tài liệu từ trước. Mục tiêu là bắt buộc cập nhật hai file ở đầu/cuối phiên.
- Kết quả: bổ sung quy tắc trong AGENTS.md, bao gồm phiên chưa hoàn tất, bàn giao, bị gián đoạn và trường hợp không có quyết định mới; đồng bộ hướng dẫn duy trì.
- Kiểm tra: rà soát nội dung và `git diff --check -- AGENTS.md PROGRESS.md DECISION.md`; không chạy lại test ứng dụng vì chỉ đổi tài liệu. Kết quả test ở trên thuộc lượt kiểm chứng trước.
- Còn lại: các blocker baseline và task 01–06 giữ nguyên; phiên tiếp theo đọc hai file theo dõi và tiếp tục bước kế tiếp đã nêu.

## Bàn giao phiên — 26/11/2026: tách AGENTS.md

- Đầu phiên: HEAD quan sát được `9fa89cd`; working tree đã có thay đổi app và tài liệu. Mục tiêu: rút gọn AGENTS.md, chuyển hướng dẫn chi tiết sang docs.
- Kết quả: tạo nhóm `docs/agent-guides/` cho workflow, phiên/task, architecture, audio/STT, context/speaker, tài liệu/decision và testing; thay root AGENTS bằng entry point có routing.
- Lệnh onboarding yêu cầu `make setup && make test`; xác minh Makefile có setup nhưng chưa có target test. Ghi rõ hạn chế và thêm vào bước tiếp theo, không tuyên bố lệnh đã chạy.
- Kiểm tra: AGENTS.md 53 dòng (trong giới hạn 50–200); 15 quy tắc toàn cục; routing có điều kiện; liên kết được rà và `git diff --check` đạt. Không chạy test ứng dụng vì chỉ đổi hướng dẫn.
- Còn lại: không còn việc trong task này. Target `make test` vẫn là hạn chế hiện hữu, đã ghi ở hướng dẫn và bước tiếp theo.

## Session handoff — 2026-11-26: clarify Progress and Decision guidance

- Start checkpoint: reviewed AGENTS.md and the session guide. The user identified that AGENTS.md did not explicitly describe how to maintain PROGRESS.md and DECISION.md.
- Result: added a direct routing row describing each file's purpose and the start/end update requirement; expanded the detailed guide with their responsibilities.
- Checks: `git diff --check` passed; routed links in AGENTS.md and the session guide resolve; AGENTS.md is 54 lines. Application tests were not run because this was a documentation-only change.
- Remaining: none for this task. Existing project blockers and `make test` limitation remain unchanged.

## Session start — 2026-11-26: commit and push

- User requested committing and pushing existing extension, STT diagnostics/tools and documentation changes. HEAD: 9fa89cd; branch: master; origin: ngdghnam/AI-MoM-Summarize-Plugin.
- Reviewing changes and running relevant tests before staging. Root README.md is empty; existing baseline/browser limitations remain open.

## Verification and commit handoff — 2026-11-26

- Reviewed existing extension recording/error lifecycle, manifest matching, STT PCM diagnostics, replay tools and documentation. No application code changed during this session.
- PASS: `node --test apps/extension/tests/recording-lifecycle.test.cjs apps/extension/tests/manifest-matches.test.cjs` (13 tests; generated manifest present).
- PASS from `apps/ai_service`: `..\..\.venv\Scripts\python.exe -m unittest discover -s tests -v` (17 tests).
- Initial Python discovery from repository root failed to import `src`; rerunning from the service directory passed.
- PASS: `git diff --check`. No fresh build, lint, typecheck or browser integration performed. Existing baseline and browser acceptance blockers remain.
- Committing the reviewed changes and pushing to origin/master as requested; remote result will be reported in the session response.
