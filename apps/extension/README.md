# Browser extension

## Thông báo lỗi ghi âm

Popup/sidebar mở mới bắt đầu với thông báo lỗi rỗng; không nạp lại `recordingError`
cũ từ local storage. Hook lắng nghe thay đổi mới để popup/sidebar đang mở cùng
hiển thị lỗi của lần kết nối hiện tại. Khi mount, UI gửi `RECORDING_STATUS` với
`clearError: true` để background xóa lỗi cũ trong shared storage qua command queue.
Status thông thường không có cờ này giữ nguyên lỗi hiện tại.

Start mới xóa lỗi trước khi kết nối. Lỗi Start/mất kết nối mới vẫn được báo; Stop
chủ động xóa lỗi. Mở popup không dừng phiên đang ghi hoặc reset thời điểm bắt đầu.
Thông báo là trạng thái UI tạm thời, không phải lịch sử lỗi cuộc họp.

`STT disconnected (1006)` là socket kết thúc bất thường. Bản sửa vòng đời thông
báo không xác định nguyên nhân mạng/backend: nếu thông báo xuất hiện lại sau Start
mới, kiểm tra service STT và cấu hình `PLASMO_PUBLIC_WS_URL` đang sử dụng.

Sau khi đổi code, nạp lại extension ở `chrome://extensions` và reload tab cuộc họp
để content script/sidebar cũ được thay. Production build nằm ở `build/chrome-mv3-prod`;
dev build nằm ở `build/chrome-mv3-dev` khi chạy `pnpm dev`.

## Phạm vi content scripts và kiểm chứng

Sửa URL tại `constants/meeting-url-matches.ts`. Lệnh dev/build chạy script sync,
materialize danh sách thành literal trong các content entry vì Plasmo không đọc
được `matches` qua import. Các literal có comment generated, không sửa riêng từng
entry. Manifest phải giữ đúng Meet/Zoom/Teams đã cấu hình, không fallback `<all_urls>`.

```powershell
pnpm build
node --test tests/*.test.cjs
```

Ngày 26/11/2026: production build thành công, 13 tests pass kiểm tra lỗi cũ/mới,
retry, status, phiên đang ghi và manifest đúng URL cuộc họp. Typecheck toàn extension còn lỗi ngoài thay đổi này tại
`components/ui/pagination.tsx` và `components/ui/resizable.tsx`. Chưa kiểm chứng
trực tiếp trong Chrome của người dùng.

## Plasmo

This is a [Plasmo extension](https://docs.plasmo.com/) project bootstrapped with [`plasmo init`](https://www.npmjs.com/package/plasmo).

## Getting Started

First, run the development server:

```bash
pnpm dev
# or
npm run dev
```

Open your browser and load the appropriate development build. For example, if you are developing for the chrome browser, using manifest v3, use: `build/chrome-mv3-dev`.

You can start editing the popup by modifying `popup.tsx`. It should auto-update as you make changes. To add an options page, simply add a `options.tsx` file to the root of the project, with a react component default exported. Likewise to add a content page, add a `content.ts` file to the root of the project, importing some module and do some logic, then reload the extension on your browser.

For further guidance, [visit our Documentation](https://docs.plasmo.com/)

## Making production build

Run the following:

```bash
pnpm build
# or
npm run build
```

This should create a production bundle for your extension, ready to be zipped and published to the stores.

## Submit to the webstores

The easiest way to deploy your Plasmo extension is to use the built-in [bpp](https://bpp.browser.market) GitHub action. Prior to using this action however, make sure to build your extension and upload the first version to the store to establish the basic credentials. Then, simply follow [this setup instruction](https://docs.plasmo.com/framework/workflows/submit) and you should be on your way for automated submission!
