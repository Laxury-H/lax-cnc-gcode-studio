# LAX CNC G-code Studio

Ứng dụng cá nhân để đọc, phân tích và mô phỏng G-code CNC trực tiếp trên trình
duyệt. Giao diện được thiết kế theo kiểu CNC workstation, tập trung vào vùng
backplot lớn, theo dõi tọa độ dao và kiểm tra chương trình trước khi chạy máy.

> Đây là công cụ mô phỏng và rà soát chương trình, không phải bộ điều khiển máy.
> Luôn dry-run và xác minh bằng quy trình an toàn của máy CNC thực tế.

## Tính năng chính

- Import hoặc kéo thả `.nc`, `.txt`, `.tap`, `.gcode`, `.cnc`; kiểm tra định
  dạng, giới hạn 8 MB/250.000 dòng, file rỗng và lỗi đọc trước khi thay chương
  trình hiện tại. Phân tích file nặng chạy trong Web Worker, có trạng thái và hủy
- Trình phân tích modal cho G-code ISO/Fanuc cơ bản và profile router tùy chỉnh
- Mô phỏng chuyển động nhanh, cắt thẳng, cung tròn và chu trình khoan
- Hai góc nhìn chính: mặt phẳng phay 2D và mô phỏng bóc vật liệu 3D Solid
- Heightmap bóc vật liệu lũy tiến hiển thị rõ cả rãnh khắc nông, ramp, cung tròn
  và cắt xuyên; mặt cắt, vết dao và mạt cắt thay đổi theo dao phẳng/dao cầu/dao V
- Mô hình động học `3D Machine` được giữ ở `Thiết lập > Tính năng thử nghiệm`,
  mặc định ẩn và dùng chung phôi đã bóc vật liệu với `3D Solid`; tính năng này
  chỉ minh họa chuyển động, chưa xác nhận va chạm, giới hạn hành trình hoặc đồ gá
- Camera 3D orbit, pan, zoom, orientation cube và đặt lại góc nhìn
- Đo 3D CNC với bắt góc/đầu mút/trung điểm/tâm, khóa hướng X/Y/Z/XY,
  gốc hệ tọa độ làm việc, góc phương vị/độ dốc, mm/inch và lịch sử gần nhất
- Có thể đặt rõ `Mặt trên = Z0` hoặc `Đáy phôi = Z0` trong cấu hình phôi;
  chế độ tự nhận diện xét chuyển động cắt và bỏ qua rapid hệ máy `G53`
- Bảng bù hệ tọa độ `G54`–`G59` được lưu theo workstation; khung xem dùng
  `G54` làm mốc và đặt các hệ còn lại theo đúng chênh lệch tọa độ máy
- Kích thước nhanh của phôi/chi tiết là tiện ích tùy chọn, đóng mặc định để
  không làm rối luồng đo hai điểm
- Bật/tắt phôi, dao, khung bao, lưới và đường chạy nhanh
- Playback theo block, step, scrub timeline và thay đổi tốc độ
- Telemetry X/Y/Z, feed, spindle, thời gian, tiến độ và trạng thái chương trình
- Phát hiện cảnh báo cơ bản như feed thiếu, spindle tắt, rapid thấp, đường chạy
  ngoài phôi, khoảng cách chi tiết và lệnh chưa hỗ trợ
- Tự nhận biết hướng phôi dọc/ngang theo giới hạn tọa độ chương trình
- Chế độ toàn màn hình dành riêng cho mô phỏng
- So sánh hai file, sửa G-code trong ứng dụng và MiniCAM có kiểm tra dữ liệu đầu
  vào/giới hạn số lượt chạy trước khi tạo chương trình
- Xuất CAM NcStudio/Syntec với khởi động an toàn, đúng G17/G18/G19, tâm cung
  I/J/K theo mặt phẳng và dwell `G04 P` theo mili-giây

## UI/UX và responsive

Giao diện dùng một hệ thống responsive thống nhất thay vì thu nhỏ nguyên màn
hình desktop:

| Kích thước | Hành vi chính |
| --- | --- |
| Trên `1320px` | Workstation đầy đủ với code, mô phỏng, telemetry và thanh trạng thái |
| `901px`–`1320px` | Thu gọn thông tin phụ, cho phép cuộn ngang các nhóm điều khiển và chỉ số |
| Tối đa `900px` | Chỉ hiển thị một vùng làm việc tại một thời điểm; thanh dưới chuyển nhanh giữa Mô phỏng, G-code, Phân tích và Thiết lập |
| Tối đa `560px` | Điều khiển chạm tối thiểu khoảng 44 px, modal/thiết lập một cột, telemetry và toolbar được rút gọn |
| Tối đa `480px` | Tối giản nhãn phụ nhưng vẫn giữ các nút chức năng chính |

Các quy tắc riêng xử lý màn hình thấp, điện thoại nằm ngang, thiết bị cảm ứng,
safe-area và tùy chọn hệ thống `prefers-reduced-motion`. Ở 2D có thể pan/zoom
bằng hai ngón; các bảng chỉ số và nhóm nút rộng sẽ cuộn thay vì tràn hoặc đè lên
vùng mô phỏng.

Các hộp thoại Hướng dẫn, So sánh file, MiniCAM, Thiết lập và Trình sửa code dùng
chung lớp responsive dialog: có `role="dialog"`, tên mô tả cho trình đọc màn
hình, khóa focus bằng `Tab`, đóng bằng `Esc`/backdrop, khóa cuộn nền và trả focus
về nút đã mở. Drawer Phân tích và danh sách G-code cũng hỗ trợ điều hướng bàn
phím, trạng thái chọn và thông báo `aria-live`.

## Thiết lập và lưu trạng thái

Nhóm cấu hình mô phỏng/phôi được chỉnh trên bản nháp. `Hủy` hoặc đóng modal
không làm thay đổi nhóm này; `Áp dụng` chỉ ghi nhận sau khi toàn bộ giá trị
phôi, dao và tùy chọn hợp lệ. Các giá trị sau được kiểm tra schema rồi lưu cục
bộ trong trình duyệt:

- Profile máy, kích thước/gốc/Z0 phôi, bảng bù G54–G59 và thư viện dao
- Tốc độ playback, chất lượng mô phỏng và hiển thị đường chạy nhanh
- Âm thanh máy và âm báo hoàn tất

Dữ liệu lưu lỗi thời hoặc không hợp lệ sẽ bị bỏ qua an toàn. Riêng công tắc thử
nghiệm `3D Machine` có hiệu lực ngay, được lưu riêng và mặc định vẫn tắt.

## G-code được xử lý

| Nhóm | Lệnh tiêu biểu |
| --- | --- |
| Chuyển động | `G0`, `G1`, `G2`, `G3` |
| Đơn vị | `G20`, `G21` |
| Tọa độ | `G53`, `G54`–`G59`, `G90`, `G91`, `G90.1`, `G91.1`, `G92`–`G92.3` |
| Mặt phẳng | `G17`, `G18`, `G19` |
| Chu trình khoan | `G73`, `G80`–`G89` |
| Máy/spindle | `M3`, `M4`, `M5`, `M30` và một số mã router tùy chỉnh |

Cung tròn được nội suy đầy đủ trên cả ba mặt phẳng XY/XZ/YZ. Các lệnh ngoài phạm
vi hỗ trợ vẫn được giữ trong chương trình và hiển thị dưới dạng cảnh báo thay vì
âm thầm bỏ qua. Riêng G84–G89 đang được mô phỏng gần đúng và có diagnostic chỉ
rõ mức hỗ trợ.

## Điều khiển mô phỏng

| Thao tác | Chức năng |
| --- | --- |
| `1` / `2` | Chuyển 2D / 3D Solid |
| `3` | Mở 3D Machine khi đã bật tính năng thử nghiệm trong Thiết lập |
| Chuột trái + kéo | Pan ở 2D, orbit ở 3D |
| `Shift` + kéo hoặc chuột phải + kéo | Pan camera 3D |
| Con lăn | Zoom |
| Nhấp đúp vùng vẽ | Vừa khung và đặt lại góc nhìn |
| Nút thước | Mở Đo thông minh và tự chuyển sang 3D Solid |
| Chọn hai điểm | Đo khoảng cách 3D, XY, delta X/Y/Z, góc XY và độ dốc |
| `X` / `Y` / `Z` | Khi đã chọn A: đo dọc trục tương ứng; nhấn lại để về tự do |
| `P` / `F` | Khóa phép đo trên mặt XY / trở về đo 3D tự do |
| `O` | Dùng gốc hệ tọa độ làm việc đang hoạt động làm điểm A |
| `Ctrl/Cmd + O` | Mở bộ chọn file G-code |
| `Ctrl/Cmd + ,` | Mở Thiết lập |
| `F1` | Mở Hướng dẫn |
| `M` | Bật/tắt Đo thông minh 3D |
| `G` | Mở vùng G-code, kể cả trên bố cục di động |
| `Space` / `F5` | Play / Pause; chạy lại từ đầu nếu chương trình đã kết thúc |
| `F10` | Chạy từng bước |
| `F8` | Đặt lại playback |
| `Esc` | Đóng lớp giao diện trên cùng, hoàn tác phép đo hoặc thoát toàn màn hình |

Phím tắt toàn cục không kích hoạt khi đang nhập trong input, textarea, select
hoặc khi một dialog/drawer đang chặn vùng làm việc.

## Hiệu năng mô phỏng và triển khai

Server chỉ phát HTML, JavaScript và asset tĩnh. G-code không được gửi lên server
để mô phỏng: parser chạy trong Web Worker, còn canvas 2D và mô phỏng 3D WebGL sử
dụng CPU/GPU/RAM của chính máy người dùng. WebGL yêu cầu trình duyệt bật tăng tốc
phần cứng; tùy chọn chất lượng đặt giới hạn tối đa, sau đó độ phân giải 3D tiếp
tục tự giảm hoặc tăng theo FPS thực tế của thiết bị.

Để playback không khóa giao diện, nhịp di chuyển dao được tách khỏi nhịp cập
nhật heightmap bóc phôi. Texture chỉ cập nhật theo ngân sách của từng mức chất
lượng, contact shadow được bake một lần, còn shadow map, DPR và độ mịn dao được
giới hạn theo profile `low` / `medium` / `high`. Chế độ `medium` là mặc định phù
hợp cho đa số laptop; file lớn hoặc GPU tích hợp nên dùng `low`. Chunk 3D Solid
được tải trước khi trình duyệt rảnh để lần mở đầu tiên nhanh hơn, nhưng tự bỏ qua
trên kết nối đã bật chế độ tiết kiệm dữ liệu.

Khi triển khai, nên bật Brotli/Gzip và HTTP/2 hoặc HTTP/3, đặt cache dài hạn
`immutable` cho `/assets/*`, và đặt CDN gần người dùng. Các thiết lập này chỉ
giảm thời gian tải ban đầu; FPS sau khi tải phụ thuộc chủ yếu vào thiết bị người
dùng, không phụ thuộc cấu hình CPU của server.

## Chạy cục bộ

Yêu cầu Node.js `>=22.13.0`.

```bash
npm ci
npm run dev
```

Các lệnh kiểm tra:

```bash
npm run lint       # ESLint toàn bộ source
npm run typecheck  # TypeScript noEmit
npm run build      # Build production + kiểm tra artifact
npm test           # Build rồi chạy toàn bộ tests/*.test.mjs
```

Chạy toàn bộ cổng chất lượng bằng:

```bash
npm run check
```

Regression test hiện bao phủ parser, round-trip post-processor, ngân sách hiệu
năng 25.000 đoạn, giới hạn import, phép đo, trạng thái thử nghiệm 3D Machine,
responsive layout/dialog, security header, HTML render và lưu thiết lập. Các test
source/layout này không thay thế bước kiểm tra trực quan thủ công trên viewport
và thiết bị thật trước khi phát hành.

## Cấu trúc chính

- `app/page.tsx`: điều phối workstation, playback và giao diện
- `app/globals.css`: hệ thống giao diện CNC workstation và responsive
- `core/gcode/`: parser/interpreter modal và hình học G-code
- `core/simulation/post-processor.ts`: xuất CAM an toàn cho NcStudio/Syntec
- `core/workers/program-analysis.worker.ts`: phân tích/orient file ngoài UI thread
- `core/ui/use-program-analysis.ts`: vòng đời worker, hủy và giữ kết quả ổn định
- `core/components/ui/ResponsiveDialog.tsx`: dialog dùng chung, focus trap và
  hành vi đóng/mở có trợ năng
- `core/ui/workspace-preferences.ts`: schema, kiểm tra và serialize thiết lập
- `tests/gcode-parser.test.mjs`: kiểm thử parser, cung tròn, phôi và profile
- `tests/measurement-utils.test.mjs`: kiểm thử bắt điểm và phép đo CNC
- `tests/coordinate-system.test.mjs`: semantic G53–G59, G90/G91 và G92
- `tests/coordinate-system-matrix.test.mjs`: ma trận số từ hệ máy đến khung G54
- `tests/stock-removal-coordinates.test.mjs`: ánh xạ Z0, dao và heightmap bóc phôi
- `tests/responsive-layout.test.mjs`: kiểm tra breakpoint và điều hướng di động
- `tests/responsive-dialog.test.mjs`: kiểm tra dialog dùng chung và trợ năng
- `tests/workspace-preferences.test.mjs`: kiểm tra lưu/đọc thiết lập an toàn
- `tests/rendered-html.test.mjs`: kiểm tra các góc nhìn và điều khiển UI

## Công nghệ

React 19, TypeScript, Vinext/Vite và Canvas 2D. Ứng dụng xử lý chương trình ngay
trong trình duyệt; không tải G-code của người dùng lên một dịch vụ phân tích
riêng.
