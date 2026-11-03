# 🪷 Chùa Thiên Mụ — TikTok Live RPC (9:16 Interactive Buddhist Sanctuary)

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

Hệ thống **Chùa Thiên Mụ** gồm hai dịch vụ phối hợp nhịp nhàng:
- **Live Gateway** (Bun.js, cổng `3000`): Điều phối Chánh Điện 3D, tiếp nhận JSON-RPC 2.0, kết nối TikTok Live và broadcast sự kiện qua WebSocket.
- **TTS Service** (Python FastAPI ZeroTTS, cổng `8008`): Tổng hợp giọng đọc tâm linh tiếng Việt hoàn toàn trong bộ nhớ (in-memory Base64 Data URI).

Tùy theo nhu cầu, bạn có thể chọn **Cách 1 (Khuyên dùng cho máy cá nhân / Local Dev)** hoặc **Cách 2 (Khuyên dùng cho Production / VPS Linux qua Docker Compose)**.

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

### 🌐 Bảng Địa Chỉ Truy Cập & Giám Sát

Sau khi hệ thống khởi động thành công, bạn có thể truy cập các đường dẫn sau:

| Mục đích sử dụng | Địa chỉ URL | Ghi chú |
| :--- | :--- | :--- |
| **Chánh Điện 3D & Điều Khiển Nhanh** | [http://localhost:3000](http://localhost:3000) | Giao diện Chánh Điện 3D Three.js chuẩn 9:16 kèm Bảng Điều Khiển Nhanh (Quick Dock) |
| **OBS Browser Source 3D (Khung 9:16 Sạch)** | [http://localhost:3000/?obs=1](http://localhost:3000/?obs=1) | Chế độ sạch cho OBS Studio / TikTok Live Studio (kích thước `1080 × 1920`) |
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
