# 1. Tách TTS thành Microservice độc lập với truyền dữ liệu âm thanh trực tiếp (Direct Base64)

## Context
Ban đầu, hệ thống chạy mô hình ZeroTTS qua tiến trình con Python (`child_process.spawn`) từ Node.js với giao tiếp stdin/stdout và lưu file cache vào ổ cứng (`data/tts-cache`). Khi vận hành trên Windows và các môi trường đa nền tảng, cơ chế symlink của Hugging Face cache gây xung đột với ONNX Runtime (`External data path escapes model directory`), đồng thời việc phụ thuộc chặt chẽ giữa 2 runtime khiến server dễ bị restart dây chuyền khi AI crash.

## Decision
Chúng tôi quyết định tách thành phần TTS thành một Microservice độc lập sử dụng FastAPI và Uvicorn đặt tại `services/tts/`:
1. **Giao thức giao tiếp**: Node.js Live Gateway giao tiếp với TTS Service qua HTTP REST API (`http://localhost:8008/synthesize`).
2. **Truyền âm thanh trực tiếp (Direct Base64)**: TTS Service sinh âm thanh dạng WAV hoàn toàn trong RAM, mã hóa thành chuỗi Base64 Data URI (`data:audio/wav;base64,...`) và trả về trực tiếp qua JSON. Node.js chuyển tiếp dữ liệu này qua WebSocket tới client OBS để phát trực tiếp trong bộ nhớ, không lưu cache đĩa.
3. **Quản lý đồng thời (Concurrency Lock)**: Sử dụng `asyncio.Lock()` trong FastAPI để tuần tự hóa các yêu cầu tổng hợp giọng nói, tránh nghẽn CPU và biến dạng âm thanh khi có nhiều tương tác dồn dập.
4. **Chịu lỗi (Soft Dependency)**: Node.js coi TTS Service là thành phần mềm (không chặn); nếu TTS Service ngoại tuyến hoặc đang nạp model, các luồng tương tác và visual 3D trên Live vẫn diễn ra bình thường kèm cơ chế tự động thăm dò và kết nối lại.
5. **Đóng gói**: Hỗ trợ triển khai linh hoạt qua Docker Compose cho môi trường Production/Linux và script chạy 2 tiến trình độc lập khi phát triển cục bộ (Local Dev).
6. **Lưu trữ**: Giữ file `tts_worker.py` cũ dưới dạng sao lưu (`tts_worker.py.bak`).

## Consequences
- **Ưu điểm**: Khắc phục triệt để lỗi path traversal của ONNX Runtime trên mọi OS, loại bỏ hoàn toàn việc ghi đĩa / dọn rác ổ cứng, cô lập hoàn toàn sự cố AI không làm ảnh hưởng phiên TikTok Live.
- **Đánh đổi**: Băng thông WebSocket giữa Node.js và client OBS tăng nhẹ (do chuỗi Base64 lớn hơn file nhị phân khoảng 33%), CPU sẽ tính toán lại cho từng câu đọc thay vì dùng cache.
