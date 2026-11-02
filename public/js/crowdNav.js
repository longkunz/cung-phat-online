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
  const MIN_SEPARATION = 0.52;    // Cự ly an toàn tối thiểu giữa 2 tâm thân (chống xuyên thấu)
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

  /**
   * Điều hướng avatar tới target kết hợp né vật cản, nhường đường và đứng chờ khi tắc.
   */
  function steerAvatar(a, target, baseSpeed, dt, avatars) {
    if (!a || !a.active) return true;

    const tX = target.x;
    const tZ = target.z;
    const toTargetX = tX - a.pos.x;
    const toTargetZ = tZ - a.pos.z;
    const distTarget = Math.hypot(toTargetX, toTargetZ);

    // Đã tới đích
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

        // Chọn hướng lách:
        // Nếu vật cản bên phải (projRight > 0.02) -> Lách sang trái (-right)
        // Nếu vật cản bên trái (projRight < -0.02) -> Lách sang phải (+right)
        // Nếu đối đầu trực diện (|projRight| <= 0.02) -> Lách sang phải theo thói quen (+right)
        let steerSide = 1;
        if (projRight > 0.02) steerSide = -1;
        else if (projRight < -0.02) steerSide = 1;
        else steerSide = a.dodgePref !== undefined ? a.dodgePref : 1;

        const avoidStrength = Math.pow(prox, 1.2) * 2.8;
        avoidX += rightX * steerSide * avoidStrength;
        avoidZ += rightZ * steerSide * avoidStrength;

        // Cơ chế "Đứng chờ": chỉ hãm tốc độ nếu người trước mặt chắn kín và chưa kịp lách
        if (d < 0.75 && Math.abs(projRight) < 0.22 && forward > 0) {
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

    // Xoay mặt mềm mại theo hướng chuyển động thực tế
    if (actualMoved > 0.001) {
      const targetYaw = Math.atan2(-stepDx, -stepDz);
      a.yaw = lerpAngle(a.yaw || 0, targetYaw, Math.min(1, dt * 6.0));
      a.walking = true;
    } else if (throttle <= 0.12) {
      a.walking = false;
    }

    return distTarget <= 0.12;
  }

  /**
   * Vòng đệm đàn hồi mềm (Soft Physical Relaxation):
   * Đẩy nhẹ các avatar cọ sát nhau ra ngoài mép, bảo đảm không bao giờ lọt thỏm vào nhau.
   */
  function relaxCollisions(avatars) {
    if (!Array.isArray(avatars) || avatars.length < 2) return;

    const count = avatars.length;
    for (let i = 0; i < count; i++) {
      const a = avatars[i];
      if (!a || !a.active || a.fade) continue;

      for (let j = i + 1; j < count; j++) {
        const b = avatars[j];
        if (!b || !b.active || b.fade) continue;

        const dx = a.pos.x - b.pos.x;
        const dz = a.pos.z - b.pos.z;
        const dist = Math.hypot(dx, dz);

        if (dist >= MIN_SEPARATION || dist < 0.0001) continue;

        const overlap = MIN_SEPARATION - dist;
        const nx = dx / dist;
        const nz = dz / dist;

        const aStatic = isAvatarStatic(a);
        const bStatic = isAvatarStatic(b);

        if (bStatic && !aStatic) {
          // Người B ngồi yên -> Người A di chuyển chịu 100% độ đẩy dạt sang bên
          a.pos.x += nx * overlap;
          a.pos.z += nz * overlap;
        } else if (aStatic && !bStatic) {
          // Người A ngồi yên -> Người B di chuyển chịu 100% độ đẩy dạt sang bên
          b.pos.x -= nx * overlap;
          b.pos.z -= nz * overlap;
        } else if (!aStatic && !bStatic) {
          // Cả hai cùng di chuyển -> Mỗi người dạt 50%
          const half = overlap * 0.5;
          a.pos.x += nx * half;
          a.pos.z += nz * half;
          b.pos.x -= nx * half;
          b.pos.z -= nz * half;
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
    steerAvatar,
    relaxCollisions
  };
});
