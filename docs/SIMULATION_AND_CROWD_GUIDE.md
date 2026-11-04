# 👥 Hướng Dẫn Quản Lý Nhân Vật, Đạo Tràng & Cơ Chế Giả Lập (Simulation & Crowd Guide)

Tài liệu này giải thích chi tiết cấu trúc nhân vật 3D, cơ chế mô phỏng người xem (AutoSim), luồng ra/vào đạo tràng và cách đồng bộ trạng thái giữa Live Gateway, Màn hình Live (Chánh Điện 3D) và Bảng Quản Trị Admin.

---

## 1. Phân Lớp Nhân Vật Trong Chánh Điện 3D

Chánh Điện 3D phân chia nhân vật thành **2 lớp riêng biệt** để vừa đảm bảo tính chân thực, vừa tối ưu hiệu năng đồ họa (60 FPS):

| Lớp Nhân Vật | Quy Mô & Bố Trí | Cơ Chế Hoạt Động & Hiển Thị |
| :--- | :--- | :--- |
| **Đạo Tràng Tương Tác** *(Interactive Avatars)* | • **40 Chỗ ngồi** (8 đài sen VIP hàng đầu hai bên thảm đỏ + 32 bồ đoàn gấm tròn 4 hàng × 8 cột)<br>• **16 Chỗ đứng chờ** phía sau chỗ ngồi | • Khi khởi động mới từ đầu: **0 người** (để trống 40 bồ đoàn sẵn sàng đón người xem thật từ TikTok Live hoặc người được thêm thủ công).<br>• Tự động bước lên dâng hương, thả đèn hoa đăng, xin xăm, dâng lễ vật, hiển thị nhãn tên thật / avatar TikTok. |
| **Biển Người Hộ Niệm** *(Devotee Sea)* | • Tối đa **538 nhân vật 3D** đứng phủ kín 2 bên cánh gà và toàn bộ khu vực phía sau Chánh Điện tới cửa | • Sử dụng kỹ thuật `THREE.InstancedMesh` (vẽ hàng trăm nhân vật chỉ trong 1 draw call), đung đưa, chắp tay niệm Phật và vái lạy nhịp nhàng.<br>• Số lượng hiển thị phụ thuộc vào cấu hình **"Biển người"** ở trang Admin (`always` = 538 người; `scale` / `threshold` = 0 người khi chưa có mắt xem live; `off` = tắt hoàn toàn). |

---

## 2. Cơ Chế Tự Động Giả Lập Người Xem (`autoSim`)

Chế độ giả lập phục vụ kiểm thử và tạo không khí trang nghiêm, đông đúc cho phòng live:

### 2.1. Khi BẬT (`🤖 Tự động Giả lập Người Xem: BẬT`)
Server kích hoạt tiến trình tự động lặp lại theo chu kỳ **~9.5 giây / lượt**:
1. **Người vào chùa (`hall.arrive`)**: Sinh ngẫu nhiên 1–3 người xem (ví dụ: *Minh Tuấn, Thảo Vy, Lan Anh, Tâm An...*) xuất hiện từ cửa chùa và bước vào khu vực đứng chờ phía sau.
2. **Trò chuyện & tương tác (`hall.action`)**: Sinh các bình luận ngắn hiện thành bong bóng thoại trên đầu avatar (*"A Di Đà Phật", "Lạy Phật", "Chùa đẹp quá", "Niệm Phật"...*) kèm động tác cúi mình đảnh lễ.
3. **Thực hiện nghi thức Tam Bảo**: Tự động dâng 3 nén hương thơm, thả đèn hoa đăng cầu nguyện, xin xăm/gieo quẻ, dâng hoa sen vàng hoặc thỉnh Đại Hồng Chung kèm đọc văn khấn TTS.

### 2.2. Khi TẮT (`🤖 Tự động Giả lập Người Xem: TẮT`)
- Server lập tức dừng timer (`clearInterval`), **ngừng hoàn toàn** việc tạo thêm người và ngừng gửi các nghi thức giả lập tự động.
- **Chu kỳ rời chùa tự nhiên (không biến mất đột ngột)**:
  - Các nhân vật đang có mặt trong chùa không biến mất phụt một cái để tránh cảm giác giật cục trên livestream.
  - Người giả lập đứng ở khu vực chờ (`sim_join_...`) sau **45 giây** im lặng sẽ tự động đứng dậy và **bước ra cửa chùa**.
  - Người đang ngồi trên bồ đoàn sau **2 phút** im lặng sẽ đứng dậy nhường ghế và đi ra ngoài.

### 2.3. Các Nút Điều Khiển Thủ Công
Cả trên Quick Dock của Trang Chủ và Mục 2 của Trang Admin đều trang bị 2 nút:
- **`👤 +1 Người Vào` (`live.simulateJoin`)**: Đưa ngay 1 người xem mới từ cửa bước vào khu vực chờ.
- **`🚪 1 Người Ra` (`live.simulateLeave`)**: Chọn 1 người trong hàng chờ hoặc đang ngồi bồ đoàn thường đứng dậy bước ra khỏi chùa.

---

## 3. Đồng Bộ Trạng Thái 2 Chiều Giữa Admin và Trang Chủ

- Cả **Trang Chủ** (`/`) và **Admin** (`/admin`) đều được kết nối **WebSocket (`/ws`)** theo thời gian thực tới Live Gateway.
- Khi bật/tắt giả lập, kết nối TikTok, chỉnh âm lượng hoặc gửi nghi thức ở một bên, bên còn lại sẽ lập tức nhảy trạng thái và cập nhật giao diện trong vài mili-giây (0ms độ trễ) mà không cần tải lại trang.
- Trang Admin duy trì polling dự phòng 4 giây/lần qua `/api/state` để đảm bảo dữ liệu không bao giờ bị lệch khi mạng chập chờn.

---

## 4. Giải Đáp Thắc Mắc: "Tại Sao Vừa Bật Server Đã Thấy Có Nhân Vật Sẵn?"

Nếu vừa khởi động server mà đã thấy nhân vật xuất hiện trong chùa, thường do 3 nguyên nhân:

1. **Cờ `autoSim` đã từng được lưu vào `merit-state.json`**:
   - Khi bạn bấm BẬT giả lập, server tự động lưu `autoSim: true` vào file `data/merit-state.json`.
   - Khi server khởi động lại (`bun run dev`), code khôi phục phiên sẽ tự động chạy lại giả lập ngay lập tức.
   - *Cách xử lý*: Bấm nút `Tắt Giả Lập` một lần; server sẽ lưu lại `autoSim: false` và các lần khởi động sau sẽ không bao giờ tự chạy nữa.

2. **Nhân vật VIP dâng lễ từ phiên trước vẫn đang lưu trong RAM**:
   - Các nhân vật từng dâng lễ vật lớn (ngồi 8 ghế VIP đài sen ở 2 bên thảm đỏ) theo quy tắc tâm linh sẽ được giữ chỗ danh dự suốt phiên live và không bị kick ra ngoài dù im lặng.
   - Nếu tiến trình server chưa từng tắt hoàn toàn, họ vẫn ngồi sẵn trên đài sen.
   - *Cách xử lý*: Vào trang Admin bấm **`♻️ Reset Thống Kê`** để làm sạch hoàn toàn bộ nhớ đạo tràng (`hall.clear()`), đưa toàn bộ 40 chỗ ngồi về `0 người`.

3. **Bạn đang nhìn thấy Biển người hộ niệm phía sau**:
   - Nếu trong trang Admin mục **"5. Cấu hình Biển người"** đang để chế độ **`Luôn hiển thị tối đa (always)`**, thì dù phòng có 0 người xem và không bật giả lập, 538 nhân vật nền vẫn luôn đứng niệm Phật để không gian Chánh Điện không bị trống trải.
   - *Cách xử lý*: Vào trang Admin -> Tìm mục **5. Cấu hình Biển người** -> Chọn **`Tắt (off)`** hoặc **`Tỷ lệ theo người xem (scale)`** -> Bấm **`Lưu cài đặt biển người`**.
