/**
 * crowdNav.js — Hệ thống Điều hướng & Né Đám đông Tự nhiên (Natural Crowd Navigation)
 * Chùa Thiên Mụ 3D: Né nhau tự nhiên, đứng chờ khi tắc đường, và chống xuyên thấu bằng lực đàn hồi mềm.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CrowdNav = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const BODY_RADIUS = 0.28;       // Bán kính thân Phật tử chibi (~28cm)
  const MIN_SEPARATION = 0.54;    // Cự ly an toàn tối thiểu giữa 2 tâm thân (chống xuyên thấu)
  const SENSORY_RANGE = 2.0;      // Tầm quét nhận biết người phía trước
  const SENSORY_CORRIDOR = 0.70;  // Bán kính hành lang phát hiện cản lối
  const STRIDE = 0.45;            // Chiều dài bước chân chuẩn

  function lerpAngle(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function isAvatarStatic(av) {
    if (!av || av.walking) return false;
    return (av.atSeat !== undefined && av.atSeat >= 0) || (av.kneel && av.kneel > 0.3) || Boolean(av.waiting);
  }

  function isHeroAvatar(av) {
    if (!av) return false;
    return Boolean(av.heroStage || av.goldTrail || (av.vipRank && av.vipRank > 0));
  }

  /**
   * Điều hướng avatar tới target kết hợp né vật cản, nhường đường và đứng chờ khi tắc.
   * @param {Object} a - Avatar đang di chuyển
   * @param {Object} target - Điểm đích { x, z }
   * @param {number} baseSpeed - Tốc độ bước đi cơ bản
   * @param {number} dt - Bước thời gian delta
   * @param {Array} avatars - Danh sách tất cả avatar trong Chánh Điện
   * @param {boolean} keepYaw - Nếu true: giữ nguyên góc nhìn (ví dụ bước lùi sau khi cắm nhang)
   * @returns {boolean} true nếu đã tới đích, false nếu đang di chuyển
   */
  function steerAvatar(a, target, baseSpeed, dt, avatars, keepYaw = false) {
    if (!a || !a.active) return true;

    const tX = target.x;
    const tZ = target.z;
    const toTargetX = tX - a.pos.x;
    const toTargetZ = tZ - a.pos.z;
    const distTarget = Math.hypot(toTargetX, toTargetZ);

    // Đã tới đích thực tế dựa trên khoảng cách
    if (distTarget <= 0.08) {
      a.pos.x = tX;
      a.pos.z = tZ;
      a.walking = false;
      return true;
    }

    // Vector hướng tới đích chuẩn hóa
    const dirX = toTargetX / distTarget;
    const dirZ = toTargetZ / distTarget;

    // Vector vuông góc sang bên phải hướng đi
    const rightX = dirZ;
    const rightZ = -dirX;

    let avoidX = 0;
    let avoidZ = 0;
    let throttle = 1.0;
    const aIsHero = isHeroAvatar(a);

    // Quét các avatar xung quanh
    if (Array.isArray(avatars)) {
      for (let i = 0; i < avatars.length; i++) {
        const b = avatars[i];
        if (!b || b === a || !b.active || b.fade) continue;

        const relX = b.pos.x - a.pos.x;
        const relZ = b.pos.z - a.pos.z;
        const d = Math.hypot(relX, relZ);

        if (d > SENSORY_RANGE || d < 0.001) continue;

        // Chiếu lên hướng di chuyển (trước / sau)
        const forward = relX * dirX + relZ * dirZ;
        if (forward < -0.1) continue; // Ở phía sau, bỏ qua

        // Độ lệch trên trục bên phải (projRight)
        // > 0: vật cản bên phải; < 0: vật cản bên trái
        const projRight = relX * rightX + relZ * rightZ;
        if (Math.abs(projRight) > SENSORY_CORRIDOR) continue; // Nằm ngoài hành lang đi

        const prox = (SENSORY_RANGE - d) / SENSORY_RANGE;
        const bIsHero = isHeroAvatar(b);

        // Chọn hướng lách:
        // Nếu vật cản bên phải (projRight > 0.02) -> Lách sang trái (-right)
        // Nếu vật cản bên trái (projRight < -0.02) -> Lách sang phải (+right)
        // Nếu đối đầu trực diện (|projRight| <= 0.02) -> Lách sang phải theo thói quen (+right)
        let steerSide = 1;
        if (projRight > 0.02) steerSide = -1;
        else if (projRight < -0.02) steerSide = 1;
        else steerSide = a.dodgePref !== undefined ? a.dodgePref : 1;

        let avoidStrength = Math.pow(prox, 1.2) * 2.8;

        // Ưu tiên nhường đường:
        if (bIsHero && !aIsHero) {
          // b là nhân vật chính làm đại lễ -> a là người thường phải né dạt ra và nhường bước
          avoidStrength *= 2.2;
          if (forward > 0 && d < 1.4) {
            const yieldThrottle = Math.max(0.0, (d - 0.70) / 0.50);
            if (yieldThrottle < throttle) throttle = yieldThrottle;
          }
        } else if (aIsHero && !bIsHero) {
          // a là nhân vật chính làm đại lễ -> a có quyền ưu tiên, giữ vững tốc độ
          avoidStrength *= 0.6;
        }

        avoidX += rightX * steerSide * avoidStrength;
        avoidZ += rightZ * steerSide * avoidStrength;

        // Cơ chế "Đứng chờ": nếu có người chắn ngay sát trước mặt (< 0.75m) và khoảng né hẹp
        if (!aIsHero && d < 0.75 && Math.abs(projRight) < 0.22 && forward > 0) {
          const bStatic = isAvatarStatic(b);
          if (bStatic || !b.walking) {
            const decel = Math.max(0.12, (d - 0.42) / 0.33);
            if (decel < throttle) throttle = decel;
          }
        }
      }
    }

    // Tốc độ thực tế sau khi tính toán
    const speed = baseSpeed * (a.speedMult || 1.0) * throttle;

    let moveVx = dirX + avoidX;
    let moveVz = dirZ + avoidZ;
    const vLen = Math.hypot(moveVx, moveVz);

    if (vLen > 0.0001) {
      moveVx = (moveVx / vLen) * speed;
      moveVz = (moveVz / vLen) * speed;
    }

    let stepDx = moveVx * dt;
    let stepDz = moveVz * dt;
    const stepDist = Math.hypot(stepDx, stepDz);

    // Giới hạn bước không vượt quá đích nếu không có lực né
    if (avoidX === 0 && avoidZ === 0 && stepDist > distTarget) {
      stepDx = (stepDx / stepDist) * distTarget;
      stepDz = (stepDz / stepDist) * distTarget;
    }

    a.pos.x += stepDx;
    a.pos.z += stepDz;

    // Pha bước chân đồng bộ quãng đường thực
    const actualMoved = Math.hypot(stepDx, stepDz);
    a.phase = (a.phase || 0) + (actualMoved * Math.PI) / STRIDE;

    // Xoay mặt mềm mại theo hướng chuyển động thực tế (trừ khi có cờ keepYaw)
    if (actualMoved > 0.001) {
      if (!keepYaw) {
        const targetYaw = Math.atan2(-stepDx, -stepDz);
        a.yaw = lerpAngle(a.yaw || 0, targetYaw, Math.min(1, dt * 6.0));
      }
      a.walking = true;
    } else if (throttle <= 0.12) {
      a.walking = false;
    }

    return distTarget <= 0.08;
  }

  /**
   * Vòng đệm đàn hồi mềm (Soft Physical Relaxation):
   * Chạy giải thuật lặp 3 vòng (3 iterations) để giải quyết triệt để va chạm liên hoàn giữa nhiều người,
   * xử lý trường hợp trùng khít tọa độ, và ưu tiên không làm xê dịch nhân vật chính.
   */
  function relaxCollisions(avatars) {
    if (!Array.isArray(avatars) || avatars.length < 2) return;

    const count = avatars.length;
    const ITERATIONS = 3;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      for (let i = 0; i < count; i++) {
        const a = avatars[i];
        if (!a || !a.active || a.fade) continue;

        for (let j = i + 1; j < count; j++) {
          const b = avatars[j];
          if (!b || !b.active || b.fade) continue;

          const dx = a.pos.x - b.pos.x;
          const dz = a.pos.z - b.pos.z;
          const dist = Math.hypot(dx, dz);

          if (dist >= MIN_SEPARATION) continue;

          let nx, nz;
          if (dist < 0.001) {
            // Trùng khít tọa độ: tạo vector đẩy có góc phân kỳ rõ rệt
            const angle = ((a.idx || i + 1) * 1.618 + iter * 0.7) * Math.PI * 2;
            nx = Math.cos(angle);
            nz = Math.sin(angle);
          } else {
            nx = dx / dist;
            nz = dz / dist;
          }

          const overlap = MIN_SEPARATION - (dist < 0.001 ? 0 : dist);

          const aStatic = isAvatarStatic(a);
          const bStatic = isAvatarStatic(b);
          const aHero = isHeroAvatar(a);
          const bHero = isHeroAvatar(b);

          // Phân loại khối lượng và quyền ưu tiên:
          // Người ngồi tĩnh hoặc nhân vật chính làm đại lễ có "trọng lượng vô hạn", người thường phải dạt ra
          const aImmovable = aStatic || (aHero && !bHero);
          const bImmovable = bStatic || (bHero && !aHero);

          if (bImmovable && !aImmovable) {
            a.pos.x += nx * overlap;
            a.pos.z += nz * overlap;
          } else if (aImmovable && !bImmovable) {
            b.pos.x -= nx * overlap;
            b.pos.z -= nz * overlap;
          } else if (!aImmovable && !bImmovable) {
            const half = overlap * 0.5;
            a.pos.x += nx * half;
            a.pos.z += nz * half;
            b.pos.x -= nx * half;
            b.pos.z -= nz * half;
          }
        }
      }
    }
  }

  return {
    BODY_RADIUS,
    MIN_SEPARATION,
    SENSORY_RANGE,
    SENSORY_CORRIDOR,
    STRIDE,
    lerpAngle,
    isAvatarStatic,
    isHeroAvatar,
    steerAvatar,
    relaxCollisions
  };
});
