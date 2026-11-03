import { describe, it, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

describe('Đơn giản hóa Tôn tượng Phật, Đài sen và Bàn tay (Buddha Simplicity & Elegance)', () => {
  const temple3dPath = path.resolve(import.meta.dir, '../public/js/temple3d.js');
  const code = fs.readFileSync(temple3dPath, 'utf-8');

  it('1. Bàn tay thiền định (Ấn Thiền Định): Loại bỏ 8-10 capsule ngón rời rạc vụn vặt, tạo hình bàn tay liền khối thanh thoát', () => {
    // Không còn mảng 8 capsule ngón tay rời rạc vụn vặt làm tay thô cứng
    expect(code).not.toMatch(/const fingersLower\s*=/);
    expect(code).not.toMatch(/const fingersUpper\s*=/);

    // Bàn tay thiền định thanh nhã, liền lạc, ngón cái chạm nhau tinh tế
    expect(code).toMatch(/ấn thiền định/i);
    expect(code).toMatch(/tam muội/i);
  });

  it('2. Đài sen: Loại bỏ tầng cánh sen úp (phục liên) nhọn hoắt gây rối mắt, chân đế 1 cấp thanh tịnh', () => {
    // Không còn tầng cánh sen chúc ngược xuống gây rối mắt
    expect(code).not.toMatch(/downIm/);
    expect(code).not.toMatch(/hạ liên đài \/ phục liên/i);

    // Chân đế 1 cấp thanh thoát, không chồng cấp rườm rà
    expect(code).toMatch(/chân đế.*?1 cấp/i);

    // Đài sen giữ lại kết cấu thanh thoát: bệ đỡ tròn uy nghiêm, tầng cánh sen ngửa trang nhã và gương sen
    expect(code).toMatch(/TÒA SEN THANH TỊNH|TÒA SEN THUẦN TÚY/i);
    expect(code).toMatch(/GOLD\.petal/);
  });

  it('3. Tôn tượng Phật duy trì sự trang nghiêm và toàn vẹn hình tướng', () => {
    // Giữ nguyên hào quang 3D và chất liệu thếp vàng sơn son
    expect(code).toMatch(/haloDiscBody/);
    expect(code).toMatch(/sơn son thếp vàng/i);
    expect(code).toMatch(/mergeStaticByMaterial\(buddha\)/);
  });
});
