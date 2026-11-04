# 🪷 Chùa Thiên Mụ — TikTok Live RPC (9:16 Interactive Buddhist Sanctuary)

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

Hệ thống **Chùa Thiên Mụ** gồm hai dịch vụ phối hợp nhịp nhàng:
- **Live Gateway** (Bun.js, cổng `3000`): Điều phối Chánh Điện 3D, tiếp nhận JSON-RPC 2.0, kết nối TikTok Live và broadcast sự kiện qua WebSocket.
- **TTS Service** (Python FastAPI ZeroTTS, cổng `8008`): Tổng hợp giọng đọc tâm linh tiếng Việt hoàn toàn trong bộ nhớ (in-memory Base64 Data URI).

Tùy theo nhu cầu, bạn có thể chọn:
- **Cách 1 (Khuyên dùng cho máy cá nhân / Local Dev)**: Chạy trực tiếp qua Bun.js + uv Python.
- **Cách 2 (Khuyên dùng cho Production / VPS Linux)**: Đóng gói khép kín qua Docker Compose.
- **Cách 3 (Khuyên dùng khi Public Internet & OBS từ xa)**: Kết hợp Docker, Cloudflare Tunnel và Nginx Proxy Guard bảo vệ đa lớp.

---

### 🟢 Cách 1: Khởi chạy Cục bộ (Local Dev — Khuyên dùng)

Chạy trực tiếp trên Bun.js (Windows, macOS hoặc Linux) không cần Docker. Script điều phối sẽ tự động phát hiện môi trường Python ảo (`.venv`), chạy song song cả Live Gateway và TTS Service với log gộp có mã màu riêng biệt (`[Gateway]` xanh lam, `[TTS]` tím hoa sen), đệm dòng chống xé chữ, và tự dọn dẹp sạch tiến trình con khi nhấn `Ctrl+C`.

#### Bước 1: Yêu cầu chuẩn bị
- **[Bun.js](https://bun.sh/)** (`>= 1.1`)
- **Python** `3.10+` kèm công cụ **[`uv`](https://github.com/astral-sh/uv)**

#### Bước 2: Cài đặt thư viện (Chỉ thực hiện lần đầu)

**1. Cài đặt dependencies cho Live Gateway:**
```bash
bun install
```

**2. Tạo môi trường ảo và cài đặt TTS Service:**
- Trên **macOS / Linux**:
  ```bash
  uv venv .venv
  uv pip install --python .venv/bin/python -r services/tts/requirements.txt
  ```

- Trên **Windows (PowerShell)**:
  ```powershell
  uv venv .venv
  uv pip install --python .venv/Scripts/python.exe -r services/tts/requirements.txt
  ```

#### Bước 3: Một lệnh khởi chạy đồng thời cả hai dịch vụ

```bash
# Chế độ Live Dev (tự động reload khi sửa mã nguồn Live Gateway hoặc TTS Service):
bun run dev

# Chế độ Production Process:
bun start
```

> **Mẹo chạy riêng lẻ từng dịch vụ (nếu cần gỡ lỗi):**
> - Chỉ chạy Live Gateway: `bun run dev:gateway` (hoặc `bun run start:gateway`)
> - Chỉ chạy TTS Service: `bun run dev:tts` (hoặc `bun run start:tts`)

---

### 🐳 Cách 2: Khởi chạy bằng Docker Compose (Production / VPS Linux)

Phù hợp khi triển khai trên máy chủ đám mây (VPS Linux). Toàn bộ Live Gateway và TTS Service được đóng gói trong container khép kín, liên kết bằng mạng cầu nối nội bộ (`chua-online-network`), cache mô hình AI bền vững không lo lỗi liên kết tệp (`chua-online-zerotts-cache`), và tự động phục hồi khi TTS Service sẵn sàng.

#### Bước 1: Yêu cầu
- Đã cài đặt [Docker Engine](https://docs.docker.com/engine/install/) và [Docker Compose v2+](https://docs.docker.com/compose/).

#### Bước 2: Khởi chạy

```bash
# 1. Tải image, build và chạy ngầm toàn bộ dịch vụ:
docker compose up -d --build

# 2. Xem luồng log gộp của cả hai container theo thời gian thực:
docker compose logs -f

# 3. Kiểm tra trạng thái sức khỏe của các container:
docker compose ps

# 4. Khi cần dừng toàn bộ hệ thống:
docker compose down
```

**Cơ chế hoạt động của Docker Compose:**
- **Mạng cầu nối nội bộ (`temple-network` / `chua-online-network`)**: Live Gateway giao tiếp trực tiếp với TTS Service qua DNS nội bộ `http://tts-service:8008`.
- **Bộ đệm Model Weights (`zerotts-cache`)**: Mount vào thư mục `/root/.cache/zerotts-local` trong container, giúp lưu vĩnh viễn trọng số ZeroTTS sau lần tải đầu tiên, không phải tải lại khi rebuild container.
- **Tự động chờ & Phục hồi (`service_healthy` + `restart: true`)**:
  - `tts-service` có `start_period: 180s` và `start_interval: 5s`, dành đủ thời gian cho lần tải trọng số đầu tiên từ Hugging Face mà không bị báo lỗi sớm.
  - `live-gateway` cấu hình `depends_on: { tts-service: { condition: service_healthy, restart: true } }`, đảm bảo chỉ nhận lưu lượng khi TTS Service đã hoàn tất nạp mô hình (`/ready` trả về HTTP 200). Nếu TTS khởi động lại, Gateway sẽ tự động liên kết lại.

---

### 🛡️ Cách 3: Khởi chạy Docker + Cloudflare Tunnel (Public Internet & OBS từ xa)

Phù hợp nhất khi triển khai trên VPS / Server đám mây để phát trực tiếp hoặc chia sẻ cho streamer từ xa. Hệ thống kết hợp **Docker Compose**, **Cloudflare Tunnel (`cloudflared`)** và **Nginx Proxy Guard** tạo nên cơ chế bảo vệ đa lớp (Defense in Depth):
- 🔒 **Zero Inbound Port**: Không cần mở port 80/443 trên Router/VPS, tránh bị scan port IP gốc.
- 🛡️ **Nginx Proxy Guard**: Khôi phục `CF-Connecting-IP`, giới hạn tần suất gọi RPC (`/rpc`: 10 req/s, burst 20) chống spam/DDoS, khóa trang `/admin` bằng HTTP Basic Auth.
- 🌐 **Cloudflare Edge (WAF & Zero Trust)**: Tận dụng DDoS protection miễn phí của Cloudflare và có thể kích hoạt Cloudflare Access (Email OTP/Google SSO) bảo vệ `/admin`.
- 📺 **OBS Studio linh hoạt**:
  - **OBS trên máy tính từ xa**: Thêm Browser Source link `https://chua.yourdomain.com/?obs=1` (1080×1920) để live từ bất kỳ đâu.
  - **OBS trên cùng máy chủ Docker**: Dùng link `http://localhost:3000/?obs=1` (độ trễ 0ms).

#### Bước 1: Chuẩn bị file môi trường
```bash
cp .env.tunnel.example .env
```
Cập nhật thông tin trong `.env`:
- `TUNNEL_TOKEN`: Token lấy từ [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/) (Networks ➔ Tunnels).
- `ADMIN_USER` & `ADMIN_PASSWORD`: Tài khoản đăng nhập trang quản trị `/admin`.

#### Bước 2: Khởi chạy
```bash
# 1. Khởi chạy toàn bộ 4 container (TTS, Gateway, Nginx Guard, Cloudflared):
docker compose -f docker-compose.tunnel.yml up -d --build

# 2. Xem log kết nối tunnel và trạng thái hoạt động:
docker compose -f docker-compose.tunnel.yml logs -f cloudflared

# 3. Khi cần dừng hệ thống:
docker compose -f docker-compose.tunnel.yml down
```

#### Bước 3: Cấu hình Public Hostname trên Cloudflare Dashboard
1. Vào **Cloudflare Zero Trust** ➔ **Networks** ➔ **Tunnels** ➔ chọn tunnel của bạn ➔ **Configure**.
2. Thêm **Public Hostname** (ví dụ: `chua.yourdomain.com`):
   - **Type**: `HTTP`
   - **URL**: `proxy-guard:80` *(Lưu ý: trỏ qua container proxy-guard để đi qua Nginx bảo vệ)*.
3. *(Khuyên dùng)* Bật thêm **Cloudflare Access** cho path `admin*` để yêu cầu xác thực OTP email trước khi truy cập.

> Xem hướng dẫn chi tiết từng bước tại [**`deploy/cloudflare/README.md`**](deploy/cloudflare/README.md).

---

### 🌐 Bảng Địa Chỉ Truy Cập & Giám Sát

Sau khi hệ thống khởi động thành công, bạn có thể truy cập các đường dẫn sau:

| Mục đích sử dụng | Địa chỉ URL | Ghi chú |
| :--- | :--- | :--- |
| **Chánh Điện 3D & Điều Khiển Nhanh** | [http://localhost:3000](http://localhost:3000) | Giao diện Chánh Điện 3D Three.js chuẩn 9:16 kèm Bảng Điều Khiển Nhanh (Quick Dock) |
| **OBS Browser Source Cục bộ** | [http://localhost:3000/?obs=1](http://localhost:3000/?obs=1) | OBS Studio chạy trên cùng máy chủ Docker (độ trễ 0ms) |
| **OBS Browser Source từ xa** | `https://chua.yourdomain.com/?obs=1` | OBS Studio chạy từ bất kỳ máy tính nào qua Internet |
| **Chánh Điện 3D URL Dự phòng** | [http://localhost:3000/temple3d.html](http://localhost:3000/temple3d.html) | Tự động chuyển hướng (HTTP 301) về `/` |
| **Bảng Quản Trị JSON-RPC & Âm Thanh** | [http://localhost:3000/admin](http://localhost:3000/admin) | Cài đặt nhạc nền, âm lượng, danh sách phát, gieo quẻ, kết nối live |
| **Liveness Probe (Live Gateway)** | `GET http://localhost:3000/health` | Kiểm tra Live Gateway còn hoạt động (`HTTP 200`) |
| **Readiness Probe (Toàn hệ thống)** | `GET http://localhost:3000/ready` | Trả về `200` khi TTS Service sẵn sàng, `503` khi đang tải |
| **TTS Service Health** | `GET http://localhost:8008/health` | Kiểm tra trực tiếp microservice giọng đọc FastAPI |
| **Danh sách Giọng đọc TTS** | `GET http://localhost:8008/voices` | Xem danh sách các giọng đọc được hỗ trợ |

> [!TIP]
> **Lưu ý về Âm thanh trên Trình duyệt:** Khi mở màn hình hiển thị trên trình duyệt (Chrome, Edge...), bạn cần bấm chuột vào trang một lần để cấp quyền phát âm thanh (Web Audio Autoplay Policy).

---

## 🎮 Bảng Quy Tắc Tương Tác TikTok Live

| Sự kiện TikTok Live | Điều kiện / Từ khóa | Nghi thức trên Chánh Điện | Điểm Công Đức |
| :--- | :--- | :--- | :---: |
| **Thả tim (Like)** | Mỗi đợt thả tim | Gõ mõ gỗ tụng kinh + Làn sóng Phật tử vái lạy | `+1` / tim |
| **Follow / Share** | Theo dõi hoặc chia sẻ | Thỉnh Đại Hồng Chung ngân vang + Sóng âm vàng | `+10` |
| **Bình luận Thắp hương** | `thắp hương`, `dâng hương`, `bái phật`, `lạy phật` | Phật tử bước dọc thảm đỏ lên trước Lư Hương, quỳ đảnh lễ 3 lạy + Đọc tên khấn | `+15` |
| **Bình luận Cầu nguyện** | `cầu ...`, `nguyện ...`, `nam mô`, `a di đà phật`, `bình an`, `chúc ...` | Bước lên đảnh lễ + Thả Đèn Hoa Đăng mang lời khấn bay lên trời + Đọc lời cầu nguyện | `+10` |
| **Bình luận Xin xăm** | `xin xăm`, `gieo quẻ`, `rút quẻ`, `quẻ` | Lắc ống xăm + Mở tờ Giải Quẻ đồng bộ đúng lúc giọng đọc bắt đầu vang lên | `+10` |
| **Tặng quà Nhỏ (1–4 xu)** | Hoa hồng (Rose), Heart Me... | Bước lên dâng Đài Hoa Sen Vàng + Thắp 3 nén hương + Đọc lời cảm tạ | `+20` / xu |
| **Tặng quà Vừa (5–99 xu)** | Đèn lưu ly, Mâm ngũ quả... | Dâng Đèn Lưu Ly / Mâm Ngũ Quả + Thỉnh Chuông + Đọc lời chúc phúc | `+30` / xu |
| **Tặng quà Lớn (≥ 100 xu)** | Quà ≥ 100 xu | **Đại Lễ Kim Long Chầu Phật**: Mưa hoa sen vàng, Hào quang vạn trượng, Chuông đồng ngân vang | `+50` / xu |

---

## 👥 Quản Lý Nhân Vật, Đạo Tràng & Cơ Chế Giả Lập (Simulation & Crowd)

### 1. Phân Lớp Nhân Vật Trong Chánh Điện 3D
Hệ thống hiển thị nhân vật trong Chánh Điện theo 2 lớp riêng biệt:

| Lớp Nhân Vật | Số Lượng & Vị Trí | Cơ Chế Hoạt Động & Hiển Thị |
| :--- | :--- | :--- |
| **Đạo Tràng Tương Tác** *(Interactive Avatars)* | • **40 Chỗ ngồi** (8 đài sen VIP hai bên thảm đỏ + 32 bồ đoàn gấm tròn)<br>• **16 Chỗ đứng chờ** phía sau chỗ ngồi | • Khi khởi động mới từ đầu: **0 người** (để trống 40 bồ đoàn sẵn sàng đón người thật hoặc người giả lập).<br>• Tự động bước lên dâng hương, thả đèn, gieo quẻ, hiện tên người thật / avatar TikTok. |
| **Biển Người Hộ Niệm** *(Devotee Sea)* | • Tối đa **538 nhân vật 3D** đứng phủ kín 2 cánh gà và khu vực sau Chánh Điện tới cửa | • Dùng kỹ thuật `InstancedMesh` tối ưu hiệu năng đồ họa, đung đưa, chắp tay niệm Phật nhịp nhàng.<br>• Số lượng hiển thị phụ thuộc vào cài đặt **"Cấu hình Biển người"** ở Admin (`always` = 538 người; `scale` / `threshold` = 0 người khi chưa có mắt xem live; `off` = 0 người). |

---

### 2. Chế Độ Tự Động Giả Lập Người Xem (`autoSim`)
Hỗ trợ kiểm thử và tạo không khí trang nghiêm đông đúc cho phòng live khi chưa có nhiều người xem thật:

- **Khi BẬT (`🤖 Tự động Giả lập Người Xem: BẬT`)**:
  - Server kích hoạt tiến trình tự động chu kỳ **~9.5 giây / lượt**.
  - **Vào chùa liên tục (`hall.arrive`)**: Sinh 1–3 người xem bước vào khu vực đứng chờ phía sau.
  - **Mô phỏng trò chuyện (`hall.action`)**: Hiện bong bóng chat trên đầu (*"A Di Đà Phật", "Lạy Phật", "Chùa đẹp quá"...*) kèm động tác đảnh lễ.
  - **Tự động làm lễ**: Ngẫu nhiên dâng 3 nén hương, thả hoa đăng, xin xăm, dâng hoa sen vàng hoặc thỉnh chuông đồng kèm đọc văn khấn TTS.
- **Khi TẮT (`🤖 Tự động Giả lập Người Xem: TẮT`)**:
  - Server lập tức hủy bỏ timer, dừng tạo thêm người và dừng gửi nghi thức tự động.
  - Các Phật tử đang có mặt không biến mất đột ngột mà tuân theo chu kỳ nhàn rỗi tự nhiên: người đứng ở khu vực chờ rời chùa sau **45 giây** im lặng; người ngồi bồ đoàn rời chùa sau **2 phút** im lặng.
- **Các nút điều khiển thủ công (trên Quick Dock và Admin)**:
  - `👤 +1 Người Vào` (`live.simulateJoin`): Thêm ngay 1 người vào chùa.
  - `🚪 1 Người Ra` (`live.simulateLeave`): Mời 1 người trong chùa bước ra cửa về.

---

### 3. Đồng Bộ Trạng Thái 2 Chiều Giữa Admin và Trang Chủ
- Cả **Trang Chủ** (`/`) và **Admin** (`/admin`) đều được kết nối **WebSocket (`/ws`)** theo thời gian thực tới Live Gateway.
- Khi bật/tắt giả lập, kết nối TikTok, chỉnh âm lượng hoặc gửi nghi thức ở một bên, bên còn lại sẽ lập tức nhảy trạng thái và cập nhật giao diện trong vài mili-giây (0ms độ trễ) mà không cần tải lại trang.

---

### 4. Giải Đáp Thắc Mắc: "Tại Sao Vừa Bật Server Đã Thấy Có Nhân Vật Sẵn?"
Nếu vừa khởi động server mà đã thấy nhân vật xuất hiện trong chùa, thường do 3 nguyên nhân:
1. **Cờ `autoSim` đã được ghi nhớ trong cấu hình**: Nếu trước đó bạn từng bật giả lập, server đã lưu `autoSim: true` vào `data/merit-state.json`. Khi khởi động lại, server tự động khôi phục chế độ này. *(Khắc phục: Bấm nút `Tắt Giả Lập` một lần để server ghi nhớ trạng thái tắt)*.
2. **Nhân vật VIP dâng lễ từ phiên trước vẫn đang ở trong RAM**: Các nhân vật từng dâng quà lớn (ngồi 8 ghế VIP đài sen) theo quy tắc tâm linh sẽ được giữ chỗ suốt buổi live và không bị kick ra ngoài dù im lặng. *(Khắc phục: Vào Admin bấm **`♻️ Reset Thống Kê`** để dọn sạch toàn bộ 40 chỗ ngồi về 0 người)*.
3. **Đang nhìn thấy Biển người hộ niệm phía sau**: Nếu cài đặt biển người đang để chế độ `Luôn hiển thị (always)`, 538 nhân vật nền sẽ luôn đứng niệm Phật dù phòng live có 0 mắt xem. *(Khắc phục: Vào Admin -> Mục 5 "Biển người" -> Chọn `Tỷ lệ theo người xem (scale)` hoặc `Tắt (off)` và bấm Lưu)*.

---

## 🔌 Giao Thức JSON-RPC 2.0 (`POST /rpc` & `ws://localhost:3000/ws`)

Bạn có thể gọi trực tiếp từ **TikFinity**, **Streamer.bot**, webhook hoặc `curl`:

```bash
# 1. Thắp hương cầu an
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "temple.burnIncense",
    "params": {
      "user": "Thí Chủ Minh Tâm",
      "count": 3,
      "wish": "Cầu gia đình bình an, vạn sự cát tường như ý"
    }
  }'

# 2. Xin xăm / Gieo quẻ đầu năm
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "temple.drawFortune",
    "params": {
      "user": "Thí Chủ Minh Tâm",
      "topic": "Cầu tài lộc và gia đạo bình an"
    }
  }'

# 3. Kết nối tới phòng TikTok Live (@username hoặc link vt.tiktok.com)
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "live.connect",
    "params": {
      "username": "@longkunz"
    }
  }'
```

### Danh sách JSON-RPC Methods hỗ trợ:
- `temple.getState`: Lấy toàn bộ trạng thái Chánh Điện và Bảng Vàng Công Đức.
- `temple.burnIncense`: Thắp nhang & bước lên đảnh lễ (`user`, `avatar`, `count`, `wish`).
- `temple.sendPrayer`: Thả đèn hoa đăng cầu nguyện (`user`, `avatar`, `wish`).
- `temple.drawFortune`: Lắc ống xăm & gieo quẻ (`user`, `avatar`, `topic`).
- `temple.strikeWoodenFish`: Gõ mõ tích công đức (`user`, `count`).
- `temple.ringBell`: Thỉnh Đại Hồng Chung (`user`, `count`, `wish`).
- `temple.offerGift`: Dâng lễ vật (`user`, `giftType`: `lotus` | `fruit` | `lamp` | `dragon`, `coins`, `giftName`).
- `temple.grandCeremony`: Kích hoạt Đại Lễ Kim Long Chầu Phật (`user`, `coins`, `giftName`).
- `temple.updateSettings`: Cập nhật giọng đọc (`ttsEnabled`, `ttsVoice`, `ttsVolume`), nhạc nền (`bgMusicEnabled`, `musicVolume`, `youtubeUrl`), hiệu ứng âm thanh (`sfxEnabled`, `sfxVolume`, `sfx`: `{ bell, woodfish, chime, fortune }`).
- `temple.resetMerit`: Đặt lại bảng thống kê Công Đức.
- `live.connect` / `live.disconnect`: Kết nối / Ngắt kết nối phòng TikTok Live.
- `live.setAutoSim`: Bật/tắt tự động giả lập đông người (`enabled`).
- `live.simulateJoin`: Giả lập 1 người xem vừa vào live (`user`, `uniqueId`, `avatar`) → đi ngang sân chùa (`hall.arrive`).
