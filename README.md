# LAX CNC G-code Studio

Ứng dụng cá nhân để đọc, phân tích và mô phỏng G-code CNC trực tiếp trên trình
duyệt. Giao diện được thiết kế theo kiểu CNC workstation, tập trung vào vùng
backplot lớn, theo dõi tọa độ dao và kiểm tra chương trình trước khi chạy máy.

> Đây là công cụ mô phỏng và rà soát chương trình, không phải bộ điều khiển máy.
> Luôn dry-run và xác minh bằng quy trình an toàn của máy CNC thực tế.

## Tính năng chính

- Import hoặc kéo thả `.nc`, `.txt`, `.tap`, `.gcode`, `.cnc`
- Trình phân tích modal cho G-code ISO/Fanuc cơ bản và profile router tùy chỉnh
- Mô phỏng chuyển động nhanh, cắt thẳng, cung tròn và chu trình khoan
- Ba góc nhìn: mặt phẳng phay 2D, mô phỏng bóc vật liệu 3D Solid và mô hình động học máy 3D
- Camera 3D orbit, pan, zoom, orientation cube và đặt lại góc nhìn
- Đo thông minh 3D với bắt góc/đầu mút/trung điểm/tâm và đo tự động kích thước phôi, chi tiết
- Bật/tắt phôi, dao, khung bao, lưới và đường chạy nhanh
- Playback theo block, step, scrub timeline và thay đổi tốc độ
- Telemetry X/Y/Z, feed, spindle, thời gian, tiến độ và trạng thái chương trình
- Phát hiện cảnh báo cơ bản như feed thiếu, spindle tắt, rapid thấp, đường chạy
  ngoài phôi, khoảng cách chi tiết và lệnh chưa hỗ trợ
- Tự nhận biết hướng phôi dọc/ngang theo giới hạn tọa độ chương trình
- Chế độ toàn màn hình dành riêng cho mô phỏng

## G-code được xử lý

| Nhóm | Lệnh tiêu biểu |
| --- | --- |
| Chuyển động | `G0`, `G1`, `G2`, `G3` |
| Đơn vị | `G20`, `G21` |
| Tọa độ | `G90`, `G91`, `G90.1`, `G91.1` |
| Mặt phẳng | `G17`, nhận diện `G18`, `G19` |
| Chu trình khoan | `G73`, `G80`–`G89` |
| Máy/spindle | `M3`, `M4`, `M5`, `M30` và một số mã router tùy chỉnh |

Cung tròn hiện được nội suy đầy đủ trên mặt phẳng `G17` (XY). Các lệnh ngoài
phạm vi hỗ trợ vẫn được giữ trong chương trình và hiển thị dưới dạng cảnh báo
thay vì âm thầm bỏ qua.

## Điều khiển mô phỏng

| Thao tác | Chức năng |
| --- | --- |
| `1` / `2` / `3` | Chuyển 2D / 3D Solid / 3D Machine |
| Chuột trái + kéo | Pan ở 2D, orbit ở 3D |
| `Shift` + kéo hoặc chuột phải + kéo | Pan camera 3D |
| Con lăn | Zoom |
| Nhấp đúp vùng vẽ | Vừa khung và đặt lại góc nhìn |
| Nút thước | Mở Đo thông minh và tự chuyển sang 3D Solid |
| Chọn hai điểm | Đo khoảng cách 3D, khoảng cách ngang và delta X/Y/Z có dấu |
| `Space` | Play / Pause |
| `Esc` | Hoàn tác phép đo, đóng công cụ đo hoặc thoát toàn màn hình |

## Chạy cục bộ

Yêu cầu Node.js `>=22.13.0`.

```bash
npm ci
npm run dev
```

Các lệnh kiểm tra:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Chạy toàn bộ cổng chất lượng bằng `npm run check`.

## Cấu trúc chính

- `app/page.tsx`: parser, mô phỏng, canvas renderer và giao diện
- `app/globals.css`: hệ thống giao diện CNC workstation và responsive
- `tests/gcode-parser.test.mjs`: kiểm thử parser, cung tròn, phôi và profile
- `tests/rendered-html.test.mjs`: kiểm tra các góc nhìn và điều khiển UI

## Công nghệ

React 19, TypeScript, Vinext/Vite và Canvas 2D. Ứng dụng xử lý chương trình ngay
trong trình duyệt; không tải G-code của người dùng lên một dịch vụ phân tích
riêng.
