import { describe, it, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

describe('Thiết kế lại chỗ ngồi Đạo Tràng (Clean Brocade Round Cushions & Grid Layout)', () => {
  const temple3dPath = path.resolve(import.meta.dir, '../public/js/temple3d.js');
  const code = fs.readFileSync(temple3dPath, 'utf-8');

  it('Bỏ hoàn toàn gai bánh răng cưa (SphereGeometry) khỏi bồ đoàn', () => {
    const cushionSection = code.match(/const cushionGeo = mergeColored\(\[[\s\S]*?\]\);/);
    expect(cushionSection).toBeTruthy();
    const cushionCode = cushionSection ? cushionSection[0] : '';

    // Tuyệt đối không còn SphereGeometry tạo gai nhọn/bánh răng
    expect(cushionCode).not.toMatch(/SphereGeometry/);
  });

  it('Bồ đoàn tròn dáng phồng êm ái bằng lathe và nẹp chỉ vàng tinh xảo', () => {
    const cushionSection = code.match(/const cushionGeo = mergeColored\(\[[\s\S]*?\]\);/);
    const cushionCode = cushionSection ? cushionSection[0] : '';

    // Thân đệm dùng lathe với biên dạng cong mềm mại
    expect(cushionCode).toMatch(/lathe\(\[/);

    // Có nẹp viền chỉ vàng (TorusGeometry) mép trên và mép dưới
    expect(cushionCode).toMatch(/TorusGeometry/);

    // Có nút tâm đệm hoa sen vàng khâu chìm
    expect(cushionCode).toMatch(/CylinderGeometry/);
  });

  it('Chất liệu gấm bồ đoàn sắc nét (256x256) dệt chìm hoa sen và chữ Vạn kim tuyến', () => {
    const brocadeSection = code.match(/TEX\.brocade = canvasTexture\(256,\s*256[\s\S]*?\n\},\s*\{\s*repeat:\s*\[\d+,\s*\d+\]\s*\}\)\.tex;/);
    expect(brocadeSection).toBeTruthy();
    const brocadeCode = brocadeSection ? brocadeSection[0] : '';

    expect(brocadeCode).toMatch(/hoa sen/i);
    expect(brocadeCode).toMatch(/chữ Vạn/i);
  });

  it('Quy hoạch hàng lối thẳng hàng (Grid), nới rộng cự ly hàng và cột chuẩn đạo tràng', () => {
    // Bước cột >= 1.40m
    const colXMatch = code.match(/const COL_X = \[(.*?)\];/);
    expect(colXMatch).toBeTruthy();
    const colX = colXMatch[1].split(',').map((s) => parseFloat(s.trim()));
    expect(colX.length).toBe(4);
    expect(colX[1] - colX[0]).toBeGreaterThanOrEqual(1.40);

    // Bước hàng >= 2.10m
    const rowZMatch = code.match(/const ROW_Z = \[(.*?)\];/);
    expect(rowZMatch).toBeTruthy();
    const rowZ = rowZMatch[1].split(',').map((s) => parseFloat(s.trim()));
    expect(rowZ.length).toBe(4);
    expect(Math.abs(rowZ[1] - rowZ[0])).toBeGreaterThanOrEqual(2.10);

    // Làn đi bộ mép thảm thông thoáng >= 1.20m
    expect(code).toMatch(/const LANE_X = 1\.25;/);
  });

  it('Căn chỉnh nhãn tên ôm sát đầu và tỷ lệ cân đối, không đè lên avatar hàng sau', () => {
    expect(code).toMatch(/const y = Math\.round\(tg\.py - 2\);/);
    expect(code).toMatch(/CLOSEUPS \? 0\.55 : 0\.72/);
  });
});
