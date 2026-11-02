# Chùa Online TikTok Live

Nền tảng tương tác tâm linh trực tiếp trên TikTok Live, kết hợp sân khấu Chánh Điện 3D, xử lý tương tác qua JSON-RPC và tổng hợp giọng nói AI (ZeroTTS).

## Language

**Live Gateway**:
Dịch vụ trung tâm Node.js kết nối TikTok Live, điều phối trạng thái Chánh Điện 3D, tiếp nhận RPC và broadcast sự kiện đến client OBS.
_Avoid_: Backend server, web server

**TTS Service**:
Microservice độc lập viết bằng Python (FastAPI) đóng gói mô hình ZeroTTS để tổng hợp giọng nói tiếng Việt thành dữ liệu âm thanh trực tiếp trong bộ nhớ.
_Avoid_: Python worker, TTS daemon

**Ritual Orchestrator**:
Hệ thống con phụ trách quy tắc và luồng diễn ra của các nghi thức tâm linh (thỉnh chuông, thắp nhang, phóng sinh, thả đèn, bốc quẻ).
_Avoid_: Event handler, action manager
