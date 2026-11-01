#!/usr/bin/env python3
"""
Sinh bản đồ độ sâu (depth map) thủ công cho ảnh nền Chánh Điện (public/assets/amitabha_stage.png)
phục vụ hiệu ứng 2.5D parallax (public/js/stage25d.js).

Quy ước: trắng (255) = gần camera, đen (0) = xa camera.
Các vùng được dựng bằng hình học đơn giản theo bố cục ảnh rồi làm mờ để chuyển tiếp mượt,
tránh hiện tượng "rách" ảnh ở mép vật thể khi camera dịch chuyển.

Chạy lại sau khi thay ảnh nền:  python3 scripts/gen_depth_map.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "amitabha_stage_depth.png"

W, H = 470, 836  # 1/2 độ phân giải ảnh gốc 941x1672 là đủ cho depth map đã làm mờ


def px(u, v):
    return int(u * W), int(v * H)


def box(d, u0, v0, u1, v1, depth):
    d.rectangle([px(u0, v0), px(u1, v1)], fill=int(depth * 255))


def ellipse(d, cu, cv, ru, rv, depth):
    d.ellipse([px(cu - ru, cv - rv), px(cu + ru, cv + rv)], fill=int(depth * 255))


def main():
    img = Image.new("L", (W, H), int(0.04 * 255))  # Tường gỗ chạm khắc phía sau
    d = ImageDraw.Draw(img)

    # Vầng hào quang (mandorla) sau lưng tượng Phật
    ellipse(d, 0.50, 0.24, 0.26, 0.24, 0.12)
    # Thân tượng Phật A Di Đà
    ellipse(d, 0.50, 0.26, 0.10, 0.09, 0.20)   # đầu
    box(d, 0.31, 0.19, 0.69, 0.36, 0.21)       # thân
    ellipse(d, 0.50, 0.335, 0.20, 0.05, 0.23)  # hai tay & đùi kiết già
    # Đài sen
    ellipse(d, 0.50, 0.40, 0.29, 0.06, 0.27)
    # Hai bình hoa sen lớn hai bên
    ellipse(d, 0.15, 0.36, 0.13, 0.08, 0.26)
    ellipse(d, 0.85, 0.36, 0.13, 0.08, 0.26)
    # Bàn thờ: lư hương, rồng, đèn (mặt trên) và mặt trước bàn thờ
    box(d, 0.03, 0.44, 0.97, 0.53, 0.33)
    box(d, 0.06, 0.53, 0.94, 0.60, 0.37)
    # Bục gỗ + 6 đệm quỳ VIP
    box(d, 0.00, 0.58, 1.00, 0.65, 0.44)
    # Cột gỗ hai bên (gần camera hơn tường)
    box(d, 0.00, 0.00, 0.09, 0.62, 0.40)
    box(d, 0.91, 0.00, 1.00, 0.62, 0.40)
    # Đèn lồng treo 4 góc trên (gần camera nhất trong nửa trên)
    ellipse(d, 0.04, 0.09, 0.07, 0.07, 0.55)
    ellipse(d, 0.96, 0.09, 0.07, 0.07, 0.55)

    # Sàn + thảm đỏ: phối cảnh tuyến tính, từ đường chân bục (xa) tới mép dưới (gần)
    v0 = 0.65
    for y in range(int(v0 * H), H):
        t = max(0.0, (y / H - v0) / (1 - v0))
        depth = 0.46 + 0.54 * (t ** 0.85)
        d.line([(0, y), (W, y)], fill=int(depth * 255))

    img = img.filter(ImageFilter.GaussianBlur(radius=7))
    img.save(OUT, optimize=True)
    print(f"Đã ghi {OUT.relative_to(ROOT)} ({W}x{H})")


if __name__ == "__main__":
    main()
