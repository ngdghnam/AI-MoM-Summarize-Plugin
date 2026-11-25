# Bộ câu tự thu để nghiệm thu baseline

## Thu và chép chuẩn

Một người nói tự nhiên, phòng yên; chỉ dùng tên/dữ liệu giả. Thu từng ca WAV riêng,
không dùng TTS thay bản thu người thật để nghiệm thu. Lưu bản gốc; chuyển đổi riêng
sang PCM16 WAV 16 kHz bằng `tools/prepare_wav.py`. Không sửa tốc độ hoặc chỉ đổi metadata.

Với mỗi ca, lưu WAV vào `sessions/corpus/<id>.wav`, reference JSON bên cạnh:
`{"left":"Lời thực sự đã nói", "right":""}` khi replay nguồn trái; đảo hai trường
khi kiểm tra nguồn phải. Chép đúng lời thực tế, cả chỗ lặp/ngập ngừng; không lấy
kịch bản làm ground truth nếu người thu nói khác. Dùng chữ viết thống nhất cho số
và chữ viết tắt; công cụ không tự đổi số thành chữ khi tính điểm.

Tạo `sessions/corpus/manifest.json` dạng:

```json
{
  "cases": [
    {
      "id": "vi-short", "language": "vi", "source": "left",
      "wav": "vi-short.wav", "reference": "vi-short.reference.json",
      "speaker": "volunteer-1", "notes": "Một người nói; kiểm tra bằng nghe lại"
    }
  ]
}
```

Manifest là danh mục để chạy từng ca bằng CLI, chưa có batch runner. Ghi ngày thu,
micro/browser, nguồn capture, sample rate gốc và noise trong notes; không ghi danh
tính thật. Kiểm tra lại bản chép bằng nghe, đánh dấu đoạn không chắc chắn và loại
khỏi accuracy baseline cho tới khi xác nhận.

## Ca cần thu

| ID | Kịch bản gợi ý | Cách đọc |
| --- | --- | --- |
| vi-short | Tôi là Nguyễn Đặng Hoài Nam. Hôm nay chúng ta kiểm tra bản ghi cuộc họp. | Một lượt tự nhiên |
| en-short | Please review the meeting notes. We have not approved the release yet. | Một lượt tự nhiên |
| mixed | Hôm nay team review API gateway và WebSocket. Chưa deploy production vì latency còn cao. | Chuyển Việt/Anh tự nhiên |
| vi-critical | Không xóa bản ghi. Mã thử nghiệm là một, hai, ba, bốn, năm, sáu, bảy, tám. Ngân sách là mười lăm triệu đồng. | Chú ý phủ định và số |
| short-pauses | Tôi muốn bổ sung một ý. Chúng ta cần kiểm tra lại âm thanh trước khi kết luận. | Nghỉ giữa các cụm 0,5–1,5 giây, ghi rõ vị trí |
| long-speech | Trình bày kế hoạch kiểm tra capture, transport, VAD và transcription, giải thích kết quả mong đợi của từng bước. | Nói liên tục hơn 25 giây; chép lại toàn bộ lời thật |
| stop-mid-sentence | Tôi đang trình bày câu cuối và phần cần giữ lại sau khi bấm dừng là... | Bấm Stop khi đang nói; có bản thu độc lập làm đối chứng |

Chạy bộ thông thường qua cả `--source left` và `--source right`; stereo thực tế
kiểm tra từng nguồn riêng rồi đồng thời để phát hiện đảo kênh/rò nguồn.
Với Stop, ghi vị trí bấm dừng; dùng `--stop-at` để tái hiện disconnect khi replay.
Không chấm câu chưa được gửi như thể server đã nhận.

Chưa có bản thu và ground truth Việt/Anh/xen kẽ trong repository. Các câu trên
là hướng dẫn thu, không phải bằng chứng audio hoặc benchmark đã hoàn thành.
