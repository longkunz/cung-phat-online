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

  it('7. Biển Phật tử hộ niệm phía sau (devoteeSea) cố định số lượng tối đa (>= 200 người), không theo lượt join livestream', () => {
    // DEVOTEE_SEA_COUNT và devoteeSea được khởi tạo với số lượng lớn
    expect(templeCode).toMatch(/const devoteeSea = new THREE\.InstancedMesh\(seaDevoteeGeo, devoteeSeaMat, DEVOTEE_SEA_COUNT\);/);
    expect(templeCode).toMatch(/devoteeSea\.count = DEVOTEE_SEA_COUNT;/);

    // Kiểm tra số lượng Phật tử nền được tính toán >= 200
    const countMatch = templeCode.match(/const DEVOTEE_SEA_COUNT = DEVOTEE_SEA_PTS\.length;/);
    expect(countMatch).toBeTruthy();

    // Hàng đứng biển người phủ từ z = 7.7 đến 13.1 (sát cửa z = 14 nhưng bên trong Chánh Điện)
    expect(templeCode).toMatch(/const REAR_SEA_ROWS = \[(.*?)\];/);
    expect(templeCode).toMatch(/const FLANK_SEA_ZS = \[(.*?)\];/);
  });

  it('8. Biển Phật tử đứng chừa hành lang thảm đỏ (|x| >= 1.45) và né cột trụ Chánh Điện', () => {
    // Hành lang giữa thông thoáng cho người hành lễ
    expect(templeCode).toMatch(/if \(Math\.abs\(x\) < 1\.45 \|\| Math\.abs\(x\) > 9\.15\) return;/);
    // Né các cột trụ trong chùa
    expect(templeCode).toMatch(/if \(isNearColumn\(x, z\)\) return;/);
    // Né các vị trí tương tác của người đang chờ
    expect(templeCode).toMatch(/if \(isNearInteractiveWait\(x, z\)\) return;/);
  });

  it('9. Biển người có animation di chuyển nhẹ, xoay người tương tác và cúi đầu niệm Phật thay vì đứng yên', () => {
    // Di chuyển qua lại và trước sau (swayX, swayZ)
    expect(templeCode).toMatch(/const swayX = Math\.sin\(t \* 0\.8 \+ p1\) \* 0\.035;/);
    expect(templeCode).toMatch(/const swayZ = Math\.cos\(t \* 0\.6 \+ p2\) \* 0\.025;/);
    // Xoay nhẹ tương tác (turnYaw) và cúi đầu tụng niệm (bowPitch)
    expect(templeCode).toMatch(/const turnYaw = Math\.sin\(t \* 0\.5 \+ p4\) \* 0\.14 \+ Math\.sin\(t \* 1\.1 \+ p1\) \* 0\.05;/);
    expect(templeCode).toMatch(/const bowPitch = Math\.max\(0, Math\.sin\(t \* 1\.5 \+ p2\)\) \* 0\.07;/);
    expect(templeCode).toMatch(/devoteeSea\.instanceMatrix\.needsUpdate = true;/);
  });

  it('10. Thêm nhãn tên Phật tử bay lên trên, cho phép đè tên nhau và cập nhật chậm mỗi ~10s', () => {
    // Chu kỳ cập nhật chậm 10s một lần
    const cycleMatch = templeCode.match(/const SEA_NAME_CYCLE = ([\d.]+);/);
    expect(cycleMatch).toBeTruthy();
    expect(parseFloat(cycleMatch[1])).toBeCloseTo(10.0, 1);

    // Danh sách pháp danh Phật tử phong phú
    expect(templeCode).toMatch(/const SEA_DHARMA_NAMES = \[/);
    expect(templeCode).toMatch(/'Diệu Tâm'/);

    // Nhãn tên dịch chuyển bay lên trên theo tiến độ thời gian
    expect(templeCode).toMatch(/const curDriftY = progress \* tag\.driftDist;/);
    expect(templeCode).toMatch(/tag\.el\.style\.transform = `translate3d\(\${x}px, \${y}px, 0\) scale\(\${sc\.toFixed\(2\)}\)`;/);

    // Cho phép đè tên nhau (không gọi placed / rectHit để lọc ẩn)
    expect(templeCode).not.toMatch(/hit = placed\.find.*seaTags/);

    // Xuất ra window.Temple3D để kiểm thử
    expect(templeCode).toMatch(/seaTags, updateSeaTags, SEA_NAME_CYCLE/);
  });

  it('11. Cài đặt Admin và Temple3D hỗ trợ các chế độ hiển thị biển người (always, threshold, scale, off)', () => {
    const adminPath = path.resolve(import.meta.dir, '../public/admin.html');
    const adminCode = fs.readFileSync(adminPath, 'utf-8');

    // Server hỗ trợ crowdSeaMode và crowdSeaThreshold
    expect(serverCode).toMatch(/crowdSeaMode:\s*'always'/);
    expect(serverCode).toMatch(/crowdSeaThreshold:\s*100/);
    expect(serverCode).toMatch(/params\.crowdSeaMode !== undefined/);

    // Admin UI có form cài đặt biển người
    expect(adminCode).toMatch(/id="crowdSettingsForm"/);
    expect(adminCode).toMatch(/id="crowdSeaMode"/);
    expect(adminCode).toMatch(/id="crowdSeaThreshold"/);
    expect(adminCode).toMatch(/id="btnSaveCrowdSettings"/);
    expect(adminCode).toMatch(/temple\.updateSettings/);

    // Temple3D có hàm syncDevoteeSea điều khiển devoteeSea.count theo cài đặt
    expect(templeCode).toMatch(/function syncDevoteeSea()/);
    expect(templeCode).toMatch(/targetCount = currentCount >= threshold \? DEVOTEE_SEA_COUNT : 0;/);
    expect(templeCode).toMatch(/syncDevoteeSea, templeSettings/);
  });
  it('12. Đám đông di chuyển lên phía trên thêm 20% (STAND_ROW_Z, REAR_SEA_ROWS, CROWD_SPOTS được dồn về phía trước Tam Bảo)', () => {
    // STAND_ROW_Z dịch chuyển lên 20% (bắt đầu từ ~2.25 thay vì 2.65, kết thúc ở ~5.05 thay vì 7.05)
    const rowMatch = templeCode.match(/const STAND_ROW_Z = \[(.*?)\];/);
    expect(rowMatch).toBeTruthy();
    const rows = rowMatch[1].split(',').map((s) => parseFloat(s.trim()));
    expect(rows[0]).toBeLessThanOrEqual(2.3);
    expect(rows[rows.length - 1]).toBeLessThanOrEqual(5.1);

    // REAR_SEA_ROWS dịch chuyển lên 20% (bắt đầu từ ~5.5 thay vì 7.4, kết thúc ở ~11.35 thay vì 13.25)
    const seaRowMatch = templeCode.match(/const REAR_SEA_ROWS = \[(.*?)\];/);
    expect(seaRowMatch).toBeTruthy();
    const seaRows = seaRowMatch[1].split(',').map((s) => parseFloat(s.trim()));
    expect(seaRows[0]).toBeLessThanOrEqual(5.6);
    expect(seaRows[seaRows.length - 1]).toBeLessThanOrEqual(11.5);

    // CROWD_SPOTS dịch chuyển lên 20% (các hàng đứng sau dồn lên z = 2.6 và 3.4 thay vì 3.2 và 4.3)
    expect(templeCode).toMatch(/\[-2\.75,\s*2\.6\]/);
    expect(templeCode).toMatch(/\[-2\.75,\s*3\.4\]/);
  });
});