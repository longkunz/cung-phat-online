import { describe, it, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

describe('Tôn tượng Phật 3D Refinements & Pure Lotus Throne', () => {
  const temple3dPath = path.resolve(import.meta.dir, '../public/js/temple3d.js');
  const code = fs.readFileSync(temple3dPath, 'utf-8');

  it('Bỏ hoàn toàn đài bát giác, chỉ giữ lại đài sen thuần túy thanh tịnh', () => {
    // Không còn bất kỳ khối đế bát giác (CylinderGeometry có 8 segment) trong cấu trúc tượng Phật
    const buddhaSectionMatch = code.match(/\/\/ 6\. TƯỢNG PHẬT[\s\S]*?mergeStaticByMaterial\(buddha\);/);
    expect(buddhaSectionMatch).toBeTruthy();
    const buddhaSection = buddhaSectionMatch ? buddhaSectionMatch[0] : '';

    // Đảm bảo không còn CylinderGeometry(..., 8) của đế bát giác cũ
    expect(buddhaSection).not.toMatch(/CylinderGeometry\([^,]+,[^,]+,[^,]+,\s*8\)/);

    // Tòa sen thuần túy, thanh tịnh
    expect(buddhaSection).toMatch(/TÒA SEN THANH TỊNH|TÒA SEN THUẦN TÚY/i);
  });

  it('Thủ ấn Thiền Định thanh thoát, liền khối (Tam Muội ấn)', () => {
    // Không dùng mảng capsule ngón vụn vặt, giữ ấn thiền định liền lạc uy nghiêm
    expect(code).not.toMatch(/fingersLower/);
    expect(code).not.toMatch(/fingersUpper/);
    expect(code).toMatch(/ấn thiền định/i);
    expect(code).toMatch(/Tam Muội/i);
  });

  it('Hào quang có chiều sâu 3D (đĩa trụ dày, gờ vát cạnh trước/sau và trụ đỡ)', () => {
    expect(code).toMatch(/haloDiscBody/);
    expect(code).toMatch(/haloRimBack/);
    expect(code).toMatch(/mandorlaRimBack/);
    expect(code).toMatch(/haloMount/);
  });

  it('Chất liệu thếp vàng quỳ cổ truyền (sơn son thếp vàng ấm áp, óng ả)', () => {
    // Metalness giảm về mức hợp lý cho sơn son thếp vàng thay vì 1.0 kim loại trần
    const goldBlockMatch = code.match(/const GOLD = \{[\s\S]*?\};/);
    expect(goldBlockMatch).toBeTruthy();
    const goldBlock = goldBlockMatch ? goldBlockMatch[0] : '';

    expect(goldBlock).toMatch(/metalness:\s*0\.78/); // skin
    expect(goldBlock).toMatch(/metalness:\s*0\.82/); // robe
    expect(goldBlock).toMatch(/sơn son thếp vàng/i);
  });
});
