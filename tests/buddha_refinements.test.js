import { describe, it, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

describe('Tôn tượng Phật 3D Refinements & Pure Lotus Throne', () => {
  const temple3dPath = path.resolve(import.meta.dir, '../public/js/temple3d.js');
  const code = fs.readFileSync(temple3dPath, 'utf-8');

  it('Bỏ hoàn toàn đài bát giác, chỉ giữ lại đài sen thuần túy', () => {
    // Không còn bất kỳ khối đế bát giác (CylinderGeometry có 8 segment) trong cấu trúc tượng Phật
    const buddhaSectionMatch = code.match(/\/\/ 6\. TƯỢNG PHẬT[\s\S]*?mergeStaticByMaterial\(buddha\);/);
    expect(buddhaSectionMatch).toBeTruthy();
    const buddhaSection = buddhaSectionMatch ? buddhaSectionMatch[0] : '';

    // Đảm bảo không còn CylinderGeometry(..., 8) của đế bát giác cũ
    expect(buddhaSection).not.toMatch(/CylinderGeometry\([^,]+,[^,]+,[^,]+,\s*8\)/);

    // Có tầng cánh sen úp (phục liên) và chuỗi ngọc liên hoa tròn
    expect(buddhaSection).toMatch(/phục liên/i);
    expect(buddhaSection).toMatch(/TÒA SEN THUẦN TÚY/i);
  });

  it('Gợi ý 1: Thủ ấn Thiền Định có ngón tay búp măng thanh thoát', () => {
    expect(code).toMatch(/fingersLower/);
    expect(code).toMatch(/fingersUpper/);
    expect(code).toMatch(/búp măng/i);
    expect(code).toMatch(/Tam Muội/i);
  });

  it('Gợi ý 2: Hào quang có chiều sâu 3D (đĩa trụ dày, gờ vát cạnh trước/sau và trụ đỡ)', () => {
    expect(code).toMatch(/haloDiscBody/);
    expect(code).toMatch(/haloRimBack/);
    expect(code).toMatch(/mandorlaRimBack/);
    expect(code).toMatch(/haloMount/);
  });

  it('Gợi ý 3: Chất liệu thếp vàng quỳ cổ truyền (sơn son thếp vàng ấm áp, óng ả)', () => {
    // Metalness giảm về mức hợp lý cho sơn son thếp vàng thay vì 1.0 kim loại trần
    const goldBlockMatch = code.match(/const GOLD = \{[\s\S]*?\};/);
    expect(goldBlockMatch).toBeTruthy();
    const goldBlock = goldBlockMatch ? goldBlockMatch[0] : '';

    expect(goldBlock).toMatch(/metalness:\s*0\.78/); // skin
    expect(goldBlock).toMatch(/metalness:\s*0\.82/); // robe
    expect(goldBlock).toMatch(/sơn son thếp vàng/i);
  });
});
