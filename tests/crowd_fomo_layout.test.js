import { describe, it, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

describe('Đạo Tràng Đông Đúc & FOMO (Standing Crowd Behind Cushions)', () => {
  const temple3dPath = path.resolve(import.meta.dir, '../public/js/temple3d.js');
  const serverPath = path.resolve(import.meta.dir, '../server.js');
  const templeCode = fs.readFileSync(temple3dPath, 'utf-8');
  const serverCode = fs.readFileSync(serverPath, 'utf-8');

  it('1. WAIT_SPOTS bố trí sát phía sau hàng ghế cuối (z >= 2.5) với sức chứa lớn (>= 40 người)', () => {
    // Trích xuất STAND_ROW_Z và STAND_COL_X
    const rowMatch = templeCode.match(/const STAND_ROW_Z = \[(.*?)\];/);
    const colMatch = templeCode.match(/const STAND_COL_X = \[(.*?)\];/);
    expect(rowMatch).toBeTruthy();
    expect(colMatch).toBeTruthy();

    const rows = rowMatch[1].split(',').map((s) => parseFloat(s.trim()));
    const cols = colMatch[1].split(',').map((s) => parseFloat(s.trim()));

    // Hàng đứng đầu tiên bắt đầu sát ngay sau ghế cuối (ghế cuối z = 1.55, hàng đứng z ~ 2.65)
    expect(rows[0]).toBeGreaterThan(1.55);
    expect(rows[0]).toBeLessThan(3.0);

    // Không có hàng đứng nào bị đẩy lùi về sát cửa (cửa ở z = 14)
    for (const r of rows) {
      expect(r).toBeLessThan(8.0);
    }

    // Các cột đứng bảo toàn hành lang thảm đỏ ở giữa (LANE_X = 1.25)
    for (const c of cols) {
      expect(c).toBeGreaterThanOrEqual(1.8);
    }

    // Tổng số chỗ đứng >= 40 để tạo không khí đông đúc, FOMO
    const totalSpots = rows.length * cols.length * 2;
    expect(totalSpots).toBeGreaterThanOrEqual(40);
  });

  it('2. courtGuest di chuyển vào đứng trong khu vực sau chỗ ngồi, tuyệt đối không đứng ngay cửa', () => {
    // Không còn dùng COURT_IN ở sát cửa chính (HALL_FRONT - 2.6 = 11.4)
    expect(templeCode).not.toMatch(/COURT_IN\.z/);

    // courtGuest chọn vị trí z trong khoảng phía sau chỗ ngồi (2.5 đến 5.5)
    const guestZMatch = templeCode.match(/const spotZ = ([\d.]+)/);
    expect(guestZMatch).toBeTruthy();
    const guestBaseZ = parseFloat(guestZMatch[1]);
    expect(guestBaseZ).toBeGreaterThanOrEqual(2.5);
    expect(guestBaseZ).toBeLessThanOrEqual(4.0);

    // courtGuest quay mặt về Tam Bảo (turnStep(0, ...)) và chắp tay (waiting = true)
    expect(templeCode).toMatch(/turnStep\(0, 0\.4\)/);
    expect(templeCode).toMatch(/av\.waiting = true/);
  });

  it('3. Đám đông vô danh (CROWD_SPOTS) đứng sát phía sau hàng ghế và hướng mặt về Tam Bảo (yaw = 0)', () => {
    // CROWD_SPOTS không còn chứa tọa độ sát cửa (z = 7.8)
    expect(templeCode).not.toMatch(/\[-3\.8,\s*7\.8\]/);

    // Tăng trần crowdTarget lên >= 16 để tăng mật độ người xem
    const crowdTargetMatch = templeCode.match(/function crowdTarget\(n\) \{\s*return Math\.max\(0, Math\.min\((\d+), n\)\);/);
    expect(crowdTargetMatch).toBeTruthy();
    expect(parseInt(crowdTargetMatch[1], 10)).toBeGreaterThanOrEqual(16);

    // Avatar đám đông đứng chắp tay và hướng thẳng về bàn thờ
    expect(templeCode).toMatch(/a\.yaw = 0;/);
    expect(templeCode).toMatch(/a\.guestKind = 'crowd';/);
  });

  it('4. Server hỗ trợ hiển thị danh sách chờ mở rộng (HALL_WAITING_SHOWN >= 32)', () => {
    const shownMatch = serverCode.match(/const HALL_WAITING_SHOWN = (\d+);/);
    expect(shownMatch).toBeTruthy();
    expect(parseInt(shownMatch[1], 10)).toBeGreaterThanOrEqual(32);
  });

  it('5. live.simulateJoin hỗ trợ cờ force để thử nghiệm thêm nhiều người vào ngay lập tức', () => {
    expect(serverCode).toMatch(/case 'live\.simulateJoin':[\s\S]*?force: true/);
    expect(serverCode).toMatch(/function hallArrive\(uid, name, avatar, \{ force = false \} = \{\}\)/);
  });

  it('6. Khi nạp trang ban đầu (!rosterSynced), người chờ đứng sẵn tại chỗ không bị dồn cục ở cửa', () => {
    // Khi !rosterSynced: spawn ngay tại spot.clone(), yaw = 0
    expect(templeCode).toMatch(/if \(!rosterSynced\) \{[\s\S]*?spawnAvatar\(a, \{ uid: w\.uid, name: w\.name, member: false, at: spot\.clone\(\) \}\);/);
  });
});
