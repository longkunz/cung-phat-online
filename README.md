# 🪷 Chùa Thiên Mụ Online — TikTok Live RPC (9:16 Interactive Buddhist Sanctuary)

Hệ thống phát trực tiếp tương tác (**Interactive TikTok Live Stream & JSON-RPC 2.0**) chuẩn khung dọc **9:16 (`1080×1920`)** dành cho **OBS Studio / TikTok Live Studio**, chạy siêu nhẹ trên **Bun.js** và tích hợp giọng đọc AI tiếng Việt **ZeroTTS (`zeroweight-ai/ZeroTTS`)**.

Người xem trên TikTok Live tương tác trực tiếp qua **Bình luận (Comment)**, **Thả tim (Like)**, **Chia sẻ / Follow** và **Tặng quà (Gift)** để thực hiện các nghi thức tâm linh trên màn hình Chánh Điện **Đức Phật A Di Đà**:
- 🔥 **Thắp hương & Đảnh lễ Tam Bái (8-Frame Walking & Prostration)**: Nhân vật Phật tử mặc áo lam bước đi từng bước dọc thảm đỏ hoa sen lên trước Lư Hương Đỉnh Đồng, hạ gối quỳ và thực hiện 3 lạy Ngũ thể đầu địa hướng về Đức Phật A Di Đà.
- 🏮 **Thả Đèn Hoa Đăng / Sớ Cầu Nguyện**: Bình luận lời khấn sẽ bay lên thành Đèn Hoa Đăng kèm giọng đọc AI đọc lời cầu nguyện.
- 🎋 **Xin Xăm / Gieo Quẻ Đầu Năm (Đồng bộ Giọng đọc & Tờ Giải Quẻ)**: Tự động lắc ống xăm và mở tờ Giải Quẻ (Thượng Thượng Cát, Đại Cát, Thượng Cát...) đúng thời điểm giọng đọc bắt đầu vang lên.
- 🪵 **Gõ Mõ & 🔔 Thỉnh Đại Hồng Chung**: Thả tim gõ mõ tích điểm Công Đức, chia sẻ/follow thỉnh chuông đồng lan tỏa sóng âm vàng và kích hoạt làn sóng vái lạy của 40+ Phật tử trong Đạo Tràng.
- 📜 **Bảng Vàng Công Đức (`TẤM LÒNG THÀNH` & 6 Đệm Quỳ VIP)**: Vinh danh trực tiếp người xem thật có điểm Công Đức cao nhất trên 6 đệm quỳ gấm đỏ trước bàn thờ Phật.

---

## 📸 Hình Ảnh Demo Giao Diện

### 1. Màn hình Chánh Điện 9:16 & Bảng Điều Khiển Nhanh (`http://localhost:3000`)
![Màn hình Chánh Điện và Điều Khiển Nhanh](docs/demo/demo-main-stage.png)

### 2. Chế độ OBS Browser Source 9:16 Sạch (`http://localhost:3000/?obs=1`) & Gieo Quẻ Linh Xăm
| Màn hình OBS 9:16 (`?obs=1`) | Tờ Giải Quẻ Linh Xăm (Đồng bộ Giọng Đọc) |
| :---: | :---: |
| ![OBS 9:16 Mode](docs/demo/demo-obs-9x16.png) | ![Fortune Oracle Modal](docs/demo/demo-fortune-oracle.png) |

### 3. Bảng Điều Khiển JSON-RPC 2.0 & Admin (`http://localhost:3000/admin`)
![Admin JSON-RPC Panel](docs/demo/demo-admin-panel.png)

---

## ⚡ Kiến Trúc & Tối Ưu Hóa Hiệu Suất (Siêu Nhẹ CPU/GPU)

- **Runtime**: Chạy trực tiếp trên **Bun.js** (`~0.1% CPU` khi chờ).
- **Canvas Particle Engine (`public/js/particles.js`)**:
  - Khóa tốc độ vẽ ở **30 FPS** ổn định, tự động tạm dừng khi ẩn tab (`document.hidden`).
  - Pre-render toàn bộ Khói hương, Hạt vàng và Cánh hoa sen ra Offscreen Canvas 1 lần duy nhất lúc khởi tạo (`drawImage`), không gọi `createRadialGradient` hay `shadowBlur` trong vòng lặp frame.
- **Zero-Flicker 8-Frame Sprite Stack (`public/js/live.js` & `public/css/live.css`)**:
  - Nạp sẵn cả 8 khung hình chuyển động (`walk1`, `walk2`, `kneelDown`, `kneel`, `forehead`, `bowMid`, `prostrate`, `prostrateDeep`) vào GPU với bóng đổ (drop-shadow) đã bake sẵn trong PNG, loại bỏ hoàn toàn hiện tượng nháy/mất hình khi chuyển tư thế.
- **ZeroTTS Microservice (`services/tts/main.py`):
  - Dịch vụ FastAPI độc lập đóng gói model `zeroweight-ai/ZeroTTS` (`intra_op_num_threads=3`, `OMP_WAIT_POLICY=PASSIVE` → **`0.0% CPU` khi chờ**).
  - Tổng hợp nguyên câu trong bộ nhớ thành chuỗi Base64 Data URI (`data:audio/wav;base64,...`) truyền thẳng qua WebSocket đến OBS phát trực tiếp trong RAM, hoàn toàn không ghi file tạm ra ổ đĩa.
  - Khóa đồng thời bất đồng bộ (`asyncio.Lock`) tuần tự hóa các yêu cầu đọc, bảo vệ CPU khỏi nghẽn luồng.
  - Cơ chế **Soft Dependency**: Live Gateway tự động thăm dò sức khỏe (`/health`); khi TTS đang nạp model hoặc ngoại tuyến, nghi thức và visual 3D vẫn hoạt động mượt mà và tự kết nối lại khi TTS sẵn sàng.
- **Bộ Lọc Chặn Ký Tự Lạ & Spam (`services/tts/main.py`):
  - Chặn tự động các ký tự Cuneiform (`𒐫`), chữ Ả Rập gây lag, Braille, Zalgo, bình luận chỉ toàn dấu chấm (`...`) hoặc từ ngữ phản cảm.
  - Tự động chuẩn hóa Unicode (`NFKC` → `NFC`) chuyển tên kiểu chữ toán học về tiếng Việt sạch trước khi đọc TTS.

### 🛕 Chùa Thiên Mụ 3D — Đại Hùng Bảo Điện & Đạo Tràng Phật tử áo lam (`/temple3d.html`)
- Mở `http://localhost:3000/temple3d.html` (OBS: `http://localhost:3000/temple3d.html?obs=1`, khung 1080×1920). Mã nguồn: `public/temple3d.html`, `public/js/temple3d.js`, `public/css/temple3d.css`.
- Chỉ dựng **trong chánh điện** bằng code Three.js (không file model): điện sơn son thếp vàng, sàn gỗ bóng, thảm hồi văn hoa sen, tượng Phật A Di Đà kiết già ôm hoa sen trên tòa sen + hào quang chạm lửa, lư hương, bàn nhang + nến, chuông, mõ; ngoài cửa chính chỉ là vùng sáng. Vật liệu PBR + môi trường phản chiếu (RoomEnvironment), 1 đèn đổ bóng cho vùng đạo tràng.
- **Phật tử chibi**: đầu tròn to (mặt vẽ: mắt khép, má hồng, miệng cười), áo tràng lam hình chuông che chân, tay tròn; kiểu tóc ngắn / búi / cạo đầu. Chuyển động làm mượt bằng lò xo: đi lạch bạch, quỳ xuống có nảy nhẹ, chắp tay (nháy sáng vàng), lạy 3 lạy (tay lên trán → rạp người, tay úp sàn → lên), thở nhẹ khi ngồi yên.
- **Cảnh chính "thắp nhang"**: người vào từ cửa chính → theo thảm đỏ tới bàn nhang → lấy 3 nén → châm ở ngọn nến → nâng nhang lên trán, vái 3 vái trước lư → cắm nhang vào lư (khói, +Công Đức) → chắp tay vái → về chỗ quỳ, chắp tay (nghi lễ / lệnh lạy thì lạy thêm 3 lạy). Camera bám theo trên thảm → góc thấp chéo thấy người lạy và tượng Phật phía sau → lùi về toàn cảnh. Mỗi lúc chỉ quay 1 người (hàng đợi, quà tặng được chen ngang, cách nhau ≥ 8 giây).
- **Chỗ ngồi** (`hall.roster`): ghế 0..7 = hàng đầu giữ chỗ cho top 8 người tặng quà (đài sen vàng; trống thì hiện "🎁 Giữ chỗ dâng lễ"), ghế 8..39 = chỗ thường (ghế 8 gần camera nhất). `tier`: đệm gấm / đài sen hồng (đã tặng quà) / đài sen vàng (≥ 100 xu). Hết chỗ: người chờ (`waiting`) đứng dọc tường phía cửa + biển "+N Phật tử đang chờ vào". Khách hành hương (`hallStatus: 'guest'`) vào thắp nhang rồi ra về; người vừa vào live (`hall.arrive`) bước vào cửa vái rồi ra.
- **Góc máy**: mặc định toàn cảnh trên cao nhìn xuống (~36°) thấy từ cửa chính tới tượng Phật và cả 40 chỗ, trôi/xoay chậm; khi có người thắp nhang chỉ đẩy nhẹ về phía bàn thờ rồi lùi lại; người đang vái/lạy có vòng sáng vàng dưới chân. Cận cảnh (`hall`, `altar`, `side`, `buddha`, quay theo từng nhịp thắp nhang) chỉ bật khi thêm `?closeups=1`. `?cam=<tên>` khóa góc máy, `?director=0` tắt tự đổi.
- Lệnh bình luận (`hall.action`): “lạy”, “chào”, “niệm Phật”, bình luận thường → bong bóng (không chồng nhau, tối đa 6). Đại Lễ → mưa cánh sen + hào quang; xin xăm → tờ quẻ đúng lúc giọng đọc bắt đầu; chuông, mõ.
- **Bảng Dâng Lễ** (`giftFeed`) + băng-rôn quà lần lượt từng món ở 1/3 dưới khung; lời cảm tạ quà tặng được chen lên đọc ngay sau câu đang đọc (`ttsJump`).
- Âm thanh + giọng đọc dùng chung `public/js/audio.js` (bấm vào trang 1 lần để mở khóa âm thanh trên trình duyệt).
- Hiệu năng: giới hạn 30 FPS, dừng khi tab ẩn, pixel ratio 1. Tham số: `?q=0.75` giảm độ phân giải render (q < 1 tự tắt đổ bóng), `?shadows=0`, `?aa=0`. Kiểm thử: `?dtmax=` (bước thời gian tối đa / khung), `?manual=1` + `Temple3D.step(giây)` (mô phỏng từng bước cố định). OBS: bật *Use hardware acceleration in Browser Sources*.

---

## 🚀 Hướng Dẫn Cài Đặt & Điều Phối Đa Môi Trường

Hệ thống hỗ trợ điều phối toàn diện cho cả **Môi trường Phát triển Cục bộ (Local Dev)** trên Windows/macOS/Linux và **Môi trường Đóng gói Container (Docker Compose)** trên Production VPS Linux.

---

### 1. Yêu cầu hệ thống
- **Runtime**: [Node.js](https://nodejs.org/) (`>= 18.0`) hoặc [Bun.js](https://bun.sh/) (`>= 1.1`)
- **Python**: `3.10+` kèm [`uv`](https://github.com/astral-sh/uv) hoặc `pip`
- **Container (Tùy chọn)**: [Docker](https://docs.docker.com/engine/) & [Docker Compose v2+](https://docs.docker.com/compose/)

---

### 2. Cài đặt thư viện cục bộ (Local Development)

```bash
# Bước 1: Cài đặt dependencies Node.js / Bun
npm install
# hoặc nếu dùng Bun:
bun install

# Bước 2: Tạo môi trường ảo Python và cài đặt TTS Microservice
# Trên Linux / macOS:
uv venv .venv
uv pip install --python .venv/bin/python -r services/tts/requirements.txt
# (Hoặc dùng python3 -m venv .venv && source .venv/bin/activate && pip install -r services/tts/requirements.txt)
```

Trên **Windows (PowerShell)**:
```powershell
uv venv .venv
uv pip install --python .venv/Scripts/python.exe -r services/tts/requirements.txt
# (Hoặc dùng python -m venv .venv && .\.venv\Scripts\Activate.ps1 && pip install -r services/tts/requirements.txt)
```

---

### 3. Khởi chạy Hệ thống

#### 🟢 Cách 1: Một lệnh duy nhất khởi chạy đồng thời (Khuyên dùng cho Local Dev)

Không cần Docker, script điều phối sẽ tự động phát hiện Python ảo (`.venv`), tự chọn runtime (`bun` hoặc `node`), chạy song song cả **TTS Service (cổng 8008)** và **Live Gateway (cổng 3000)** với log màu riêng biệt (`[Gateway]` xanh lam, `[TTS]` tím hoa sen), đệm dòng chống xé chữ, và tự dọn dẹp sạch tiến trình con khi nhấn `Ctrl+C`:

```bash
# Chế độ Live Dev (tự động reload khi sửa code server hoặc Python):
npm run dev
# (hoặc: bun run dev)

# Chế độ Production Process:
npm start
# (hoặc: bun start)
```

#### 🐳 Cách 2: Điều phối Docker Compose (Production / VPS Linux)

Chạy toàn bộ cụm dịch vụ khép kín qua Docker Compose với mạng cầu nối nội bộ (`chua-online-network`), bộ đệm model weights độc lập (`chua-online-zerotts-cache`) không bị lỗi liên kết tệp (cross-directory symlink), và kiểm tra sức khỏe phụ thuộc (`condition: service_healthy`):

```bash
# 1. Khởi tạo và chạy nền:
docker compose up -d --build

# 2. Theo dõi nhật ký gộp hai dịch vụ:
docker compose logs -f

# 3. Kiểm tra trạng thái sức khỏe hai container:
docker compose ps

# 4. Dừng hệ thống:
docker compose down
```

**Đặc điểm Docker Compose:**
- **Mạng nội bộ (`temple-network`)**: Live Gateway kết nối TTS Service qua DNS nội bộ `http://tts-service:8008`, an toàn và cô lập với bên ngoài.
- **Weights Cache Volume (`zerotts-cache`)**: Mount vào `/root/.cache/zerotts-local` lưu trữ mô hình AI bền vững qua các lần cập nhật container, loại bỏ nguy cơ lỗi phân vùng symlink giữa máy chủ và container.
- **Automated Healthchecks**:
  - `tts-service`: Thăm dò định kỳ endpoint `http://localhost:8008/health` (start_period: 30s).
  - `live-gateway`: Ràng buộc `depends_on: { tts-service: { condition: service_healthy } }`, đảm bảo gateway chỉ bắt đầu định tuyến lưu lượng khi TTS đã sẵn sàng.
  - Gateway định kỳ tự kiểm tra `http://localhost:3000/health` qua wget.

#### 🔧 Cách 3: Chạy độc lập từng dịch vụ trong terminal riêng

```bash
# Terminal 1: Chạy riêng TTS Service (FastAPI)
npm run dev:tts    # hoặc: npm run start:tts

# Terminal 2: Chạy riêng Live Gateway
npm run dev:gateway # hoặc: npm run start:gateway
```

---

### 4. Endpoints Kiểm Tra Sức Khỏe & Giám Sát

| Endpoint | Giao thức | Mô tả mục đích | Mã trạng thái |
| :--- | :--- | :--- | :---: |
| `GET http://localhost:3000/health` | HTTP | **Liveness Probe**: Kiểm tra Live Gateway còn sống và xem trạng thái kết nối TTS | `200 OK` |
| `GET http://localhost:3000/ready` | HTTP | **Readiness Probe**: Chỉ trả về 200 khi TTS Service đã nạp xong mô hình và sẵn sàng xử lý | `200` / `503` |
| `GET http://localhost:8008/health` | HTTP | Kiểm tra microservice TTS độc lập (FastAPI) | `200 OK` |
| `GET http://localhost:8008/voices` | HTTP | Danh sách giọng đọc hỗ trợ (mặc định: Mai Chi) | `200 OK` |

Mặc định server hiển thị tại cổng `3000`:
- **Màn hình Live + Điều khiển nhanh**: [http://localhost:3000](http://localhost:3000)
- **Màn hình OBS Browser Source (Sạch 9:16)**: [http://localhost:3000/?obs=1](http://localhost:3000/?obs=1) *(Đặt kích thước trong OBS là `1080 × 1920`)*
- **Bảng điều khiển Admin & RPC**: [http://localhost:3000/admin](http://localhost:3000/admin)

Mặc định server chạy tại cổng `3000`:
- **Màn hình Live + Điều khiển nhanh**: [http://localhost:3000](http://localhost:3000)
- **Màn hình OBS Browser Source (Sạch 9:16)**: [http://localhost:3000/?obs=1](http://localhost:3000/?obs=1) *(Đặt kích thước Browser Source trong OBS là `1080 × 1920`)*
- **Bảng điều khiển Admin & RPC**: [http://localhost:3000/admin](http://localhost:3000/admin)

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
      "username": "@zenfacts_vn"
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
- `temple.updateSettings`: Cập nhật giọng đọc (`ttsEnabled`, `ttsVoice`, `ttsVolume`), nhạc nền (`bgMusicEnabled`, `musicVolume`, `bgPlaylist`: tối đa 3 id bài trong thư viện, phát lần lượt theo thứ tự), hiệu ứng âm thanh (`sfxEnabled`, `sfxVolume`, `sfx`: `{ bell, woodfish, chime, fortune }`).
- Thư viện nhạc nền (HTTP): `GET /api/music` (danh sách), `POST /api/music?name=<tên>` (body = file nhạc, header `Content-Type: audio/*`), `DELETE /api/music/<id>`. File lưu ở `data/music/`, phục vụ tại `/music/...`.

### 🎵 Cài đặt âm thanh ở trang Admin
- **Nhạc nền**: bật/tắt, âm lượng, danh sách phát tối đa **3 bài** phát lần lượt theo thứ tự rồi quay lại bài 1 (đổi thứ tự bằng ▲▼, nghe thử ▶). Tải nhạc lên thư viện (mp3, m4a, aac, ogg, wav, webm, flac, tối đa 40MB, 30 bài). Nhạc tự hạ nhỏ khi có giọng đọc; bài lỗi được bỏ qua.
- **Hiệu ứng âm thanh**: bật/tắt chung, âm lượng chung, bật/tắt riêng Đại Hồng Chung, Mõ gỗ, Chuông ngọc, Lắc ống xăm, có nút nghe thử.
- Lưu là màn live, OBS và Chánh Điện 3D áp dụng ngay.
- `temple.resetMerit`: Đặt lại bảng thống kê Công Đức.
- `live.connect` / `live.disconnect`: Kết nối / Ngắt kết nối phòng TikTok Live.
- `live.setAutoSim`: Bật/tắt tự động giả lập đông người (`enabled`).
- `live.simulateJoin`: Giả lập 1 người xem vừa vào live (`user`, `uniqueId`, `avatar`) → đi ngang sân chùa (`hall.arrive`).

---

## 📁 Cấu Trúc Thư Mục

```text
├── server.js                  # Bun.js HTTP + WebSocket JSON-RPC 2.0 Server & TikTok Live Connector
├── tts_worker.py              # Tiến trình Python ZeroTTS thường trú (48kHz, chống rè/clipping, lọc ký tự lạ)
├── data/
│   ├── merit-state.json       # Lưu trữ bền vững Bảng Vàng Công Đức của người xem thật
│   └── tts-cache/             # Bộ đệm file âm thanh WAV đã tổng hợp
├── public/
│   ├── index.html             # Giao diện Chánh Điện 9:16 + Bảng điều khiển nhanh
│   ├── admin.html             # Trang quản trị JSON-RPC 2.0 đầy đủ
│   ├── temple3d.html          # Chánh Điện 3D low-poly + Đạo Tràng Phật tử áo lam (js/temple3d.js, css/temple3d.css)
│   ├── css/live.css           # Stylesheet tối ưu GPU Compositor
│   ├── js/
│   │   ├── live.js            # Điều phối 8-frame prostration, Đạo Tràng 40 chỗ ngồi & WebSocket RPC
│   │   ├── particles.js       # 30 FPS Offscreen-Sprite Particle Engine (Khói hương, Hoa sen, Sóng âm)
│   │   └── audio.js           # Quản lý nhạc nền auto-ducking, Pháp khí Web Audio & hàng đợi đồng bộ TTS
│   └── assets/                # Hình nền Đức Phật A Di Đà, 8 frame Phật tử áo lam & nhạc nền
└── docs/
    ├── demo/                  # Hình ảnh chụp màn hình demo thực tế
    └── superpowers/specs/     # Tài liệu thiết kế kỹ thuật (Design Spec)
```
