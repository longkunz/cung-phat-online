# Thư viện Assets Âm Thanh (Audio Assets)

Thư mục này quản lý toàn bộ các file âm thanh thật phục vụ cho Chùa Online (Livestream & 3D Temple).

## Cấu trúc thư mục

```
public/assets/audio/
├── sfx/                   # Hiệu ứng âm thanh pháp khí
│   ├── woodfish.mp3       # Tiếng Mõ gỗ tụng kinh (hỗ trợ .mp3 hoặc .wav)
│   ├── bell.mp3           # Tiếng Đại Hồng Chung (chuông chùa rền)
│   ├── chime.mp3          # Tiếng Chuông ngọc thanh tịnh (thắp hương, dâng lễ)
│   └── fortune.mp3        # Tiếng Lắc ống xăm tre
└── bg/                    # Nhạc nền ngoại tuyến (khi không dùng link YouTube)
    └── default.mp3        # Nhạc thiền / Niệm Phật mặc định (hỗ trợ .mp3 hoặc .wav)
```

## Hướng dẫn bổ sung / thay thế âm thanh thật

1. **Định dạng khuyến nghị:** 
   - MP3 (`.mp3`) hoặc WAV (`.wav`), sample rate 44.1kHz hoặc 48kHz, âm thanh stereo hoặc mono sạch không rè.
2. **Cách thay thế:**
   - Chỉ cần copy file âm thanh thật của bạn vào đúng thư mục và đặt tên theo danh sách trên (ví dụ: `woodfish.mp3`, `bell.mp3`, `chime.mp3`, `fortune.mp3`).
   - Hệ thống tự động ưu tiên file `.mp3`, nếu không có sẽ nạp `.wav`.
3. **Nhạc nền YouTube:**
   - Khi bạn nhập link YouTube trong trang Quản Trị (`/admin`), hệ thống sẽ tự động phát nhạc từ link YouTube đó và tạm dừng nhạc nền cục bộ.
   - Khi link YouTube để trống, hệ thống sẽ tự động chuyển sang phát file `bg/default.mp3` (hoặc `bg/default.wav`).
