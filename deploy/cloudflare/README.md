# 🛡️ Triển Khai Docker + Cloudflare Tunnel Kèm Cơ Chế Bảo Vệ Đa Lớp

Tài liệu này hướng dẫn chi tiết cách public hệ thống **Chùa Thiên Mụ 3D** ra Internet thông qua **Cloudflare Tunnel (`cloudflared`)** kết hợp **Reverse Proxy Guard (Nginx)** và các lớp bảo vệ bảo mật (Zero Trust, WAF, Rate Limiting, HTTP Basic Auth).

---

## 🏛️ 1. Kiến Trúc Bảo Vệ Đa Lớp (Defense in Depth)

```
[ Người xem Internet / Khách vãng lai ]
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│ 🌐 LỚP 1: CLOUDFLARE EDGE (TẬN DÙNG MIỄN PHÍ)          │
│ • Unmetered DDoS Protection (Chống tấn công từ chối DV)│
│ • Cloudflare WAF & Bot Fight Mode (Chặn bot độc hại)   │
│ • Cloudflare Access (Zero Trust): Đăng nhập OTP/Google │
│   chỉ cho phép Email Quản Trị trước khi chạm tới /admin│
└────────────────────────┬───────────────────────────────┘
                         │ (Encrypted Outbound Tunnel)
                         ▼
┌────────────────────────────────────────────────────────┐
│ 🔒 LỚP 2: DOCKER NETWORK ISOLATION (ZERO INBOUND PORT) │
│ • Không cần mở bất kỳ port nào trên Router / VPS!      │
│ • container: chua-online-cloudflared tạo kết nối ra ngoài│
└────────────────────────┬───────────────────────────────┘
                         │ (chua-online-network)
                         ▼
┌────────────────────────────────────────────────────────┐
│ 🛡️ LỚP 3: NGINX PROXY GUARD (chua-online-guard)        │
│ • Khôi phục IP thật của người dùng từ CF-Connecting-IP │
│ • Chặn /admin bằng HTTP Basic Auth (ADMIN_USER/PASS)   │
│ • Giới hạn tần suất gọi RPC (/rpc: 10 req/s, burst 20) │
│ • Chuyển tiếp WebSocket (/ws) giữ kết nối 24h không rớt│
│ • Thêm Security Headers: nosniff, xss-protection,...   │
└────────────────────────┬───────────────────────────────┘
                         │ (chua-online-network)
                         ▼
┌────────────────────────────────────────────────────────┐
│ 🛕 LỚP 4: LIVE GATEWAY (chua-online-gateway:3000)      │
│ • Cổng 3000 chỉ bind vào 127.0.0.1 (chỉ máy chủ và OBS │
│   cục bộ mới truy cập được trực tiếp)                  │
│ • Microservice TTS (8008) hoàn toàn đóng kín nội bộ    │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 2. Các Bước Cài Đặt Nhanh

### Bước 1: Sao chép file cấu hình môi trường
```bash
cp .env.tunnel.example .env
```
Mở file `.env` và cập nhật thông tin:
- `TUNNEL_TOKEN`: Token lấy từ Cloudflare Zero Trust (xem mục 3 bên dưới).
*(Tùy chọn)* Đổi mật khẩu đăng nhập `/admin` (mặc định là `admin` / `admin123`):
```bash
bun run gen:htpasswd <ten_admin> <mat_khau_moi>
# hoặc: node scripts/gen-htpasswd.js <ten_admin> <mat_khau_moi>
```

### Bước 2: Khởi chạy toàn bộ hệ thống
```bash
# Khởi chạy tất cả 4 container: tts, gateway, proxy-guard, cloudflared
docker compose -f docker-compose.tunnel.yml up -d --build
```

### Bước 3: Kiểm tra trạng thái sức khỏe
```bash
# Kiểm tra danh sách container đang chạy và trạng thái healthy
docker compose -f docker-compose.tunnel.yml ps

# Xem log kết nối Cloudflare Tunnel:
docker compose -f docker-compose.tunnel.yml logs -f cloudflared

# Xem log Nginx Proxy Guard:
docker compose -f docker-compose.tunnel.yml logs -f proxy-guard
```

---

## 🌐 3. Hướng Dẫn Thiết Lập Cloudflare Tunnel (Miễn Phí)

1. Đăng nhập vào [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2. Điều hướng tới **Networks** ➔ **Tunnels** ➔ Chọn **Add a tunnel**.
3. Chọn loại **Cloudflare (cloudflared)** ➔ Đặt tên tunnel (ví dụ: `chua-thien-mu-live`) ➔ Nhấn **Save tunnel**.
4. Tại bước **Install and run a connector**, chọn môi trường **Docker**:
   - Bạn sẽ thấy chuỗi lệnh chứa `--token eyJhIj...`.
   - Sao chép toàn bộ chuỗi token dài này và dán vào biến `TUNNEL_TOKEN` trong file `.env`.
5. Chuyển sang tab **Public Hostnames** (hoặc nhấn Next):
   - Nhấn **Add a public hostname**.
   - **Subdomain**: ví dụ `chua` (Domain: `yourdomain.com`).
   - **Path**: để trống (áp dụng cho toàn bộ domain).
   - **Service**:
     - Type: `HTTP`
     - URL: `proxy-guard:80` *(Lưu ý: trỏ vào proxy-guard, không trỏ trực tiếp gateway)*.
   - Nhấn **Save hostname**.

---

## 🔐 4. Kích Hoạt Bảo Vệ Zero Trust Cho Trang Admin (`/admin`)

Để tăng cường bảo mật cấp độ cao nhất cho trang Quản trị, bạn nên tạo Cloudflare Access Application:

1. Trong **Cloudflare Zero Trust Dashboard**, vào **Access** ➔ **Applications** ➔ Chọn **Add an application**.
2. Chọn loại **Self-hosted**.
3. Cấu hình ứng dụng:
   - **Application name**: `Chùa Thiên Mụ Admin`
   - **Session Duration**: `24 hours`
   - **Application domain**: `chua.yourdomain.com`
   - **Path**: `admin*` *(Chỉ bảo vệ các đường dẫn bắt đầu bằng /admin)*
4. Thêm chính sách (Policy):
   - **Policy name**: `Admin Only`
   - **Action**: `Allow`
   - **Configure rules**: Thêm rule `Emails` chứa địa chỉ email của bạn (ví dụ: `admin@yourdomain.com`).
5. Nhấn **Save**.

👉 **Kết quả**: Khi bất kỳ ai vào `https://chua.yourdomain.com/admin`, Cloudflare Edge sẽ lập tức hiển thị màn hình đăng nhập mã PIN qua Email. Kẻ lạ không thể tiếp cận server dù có dò quét URL.

---

## 🛑 5. Các Lệnh Quản Trị Hữu Ích

```bash
# Dừng toàn bộ hệ thống
docker compose -f docker-compose.tunnel.yml down

# Khởi động lại riêng Cloudflare Tunnel connector
docker compose -f docker-compose.tunnel.yml restart cloudflared

# Cập nhật mật khẩu Admin mới (sau khi sửa trong file .env)
docker compose -f docker-compose.tunnel.yml restart proxy-guard
```
