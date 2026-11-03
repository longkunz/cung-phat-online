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
      a.detourSign = 0;
      a.smoothAvoidX = 0;
      a.smoothAvoidZ = 0;
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

    let hasLeftObstacle = false;
    let hasRightObstacle = false;
    let minForwardDist = 999;
    let queueAhead = false;

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
        const absProjRight = Math.abs(projRight);
        const bStatic = isAvatarStatic(b);
        const bIsHero = isHeroAvatar(b);

        // Nhận diện vật cản tĩnh hai bên lối đi để phát hiện nút thắt đối xứng (quét trước ngưỡng hành lang để không bị chập chờn khi né)
        if (forward > 0 && d < 1.8 && (bStatic || b.walking === false)) {
          if (projRight < -0.04) hasLeftObstacle = true;
          if (projRight > 0.04) hasRightObstacle = true;
          if (d < minForwardDist) minForwardDist = d;
        }

        if (absProjRight > SENSORY_CORRIDOR) continue; // Nằm ngoài hành lang đi

        // Giảm dần lực né mượt mà theo khoảng cách ngang tới mép hành lang cảm quan
        // Triệt tiêu dao động giật cục (limit-cycle chattering) khi avatar chạm mép 0.70m
        const corridorRatio = absProjRight / SENSORY_CORRIDOR;
        const latFalloff = 1.0 - corridorRatio * corridorRatio;

        const prox = (SENSORY_RANGE - d) / SENSORY_RANGE;

        // Nhận diện hàng người đứng chờ (Queueing):
        // Chỉ áp dụng cho người thường xếp hàng; Hero làm đại lễ không bị nghẽn sau người chờ
        if (!aIsHero && forward > 0 && Math.abs(projRight) < 0.35 && (b.waiting || (!b.walking && !bStatic))) {
          queueAhead = true;
          // Giảm tốc và dừng hẳn giữ cự ly cung kính (~0.55m - 0.60m)
          if (d < 1.4) {
            const qDecel = Math.max(0, (d - 0.55) / 0.55);
            if (qDecel < throttle) throttle = qDecel;
          }
        }

        // Chọn hướng lách:
        // Nếu vật cản bên phải (projRight > 0.04) -> Lách sang trái (-right)
        // Nếu vật cản bên trái (projRight < -0.04) -> Lách sang phải (+right)
        // Nếu đối đầu trực diện (|projRight| <= 0.04) -> Lách sang phải theo thói quen (+right)
        let steerSide = 1;
        if (projRight > 0.04) steerSide = -1;
        else if (projRight < -0.04) steerSide = 1;
        else steerSide = a.dodgePref !== undefined ? a.dodgePref : 1;

        let avoidStrength = Math.pow(prox, 1.2) * 2.8 * latFalloff;

        // Ưu tiên nhường đường và xử lý chướng ngại vật:
        if (bStatic) {
          // Người ngồi cố định trên bồ đoàn: kể cả hero cũng phải né với toàn bộ lực né
          // Giảm tốc khi gặp người ngồi ngay sát phía trước trong hành lang hẹp
          if (!a.detourSign && d < 0.75 && Math.abs(projRight) < 0.25 && forward > 0) {
            const decel = Math.max(0.12, (d - 0.45) / 0.30);
            if (decel < throttle) throttle = decel;
          }
        } else if (bIsHero && !aIsHero) {
          // b là nhân vật chính làm đại lễ -> a là người thường phải né dạt ra và nhường bước
          avoidStrength *= 2.2;
          if (forward > 0 && d < 1.4) {
            const yieldThrottle = Math.max(0.0, (d - 0.70) / 0.50);
            if (yieldThrottle < throttle) throttle = yieldThrottle;
          }
        } else if (aIsHero && !bIsHero) {
          // a là nhân vật chính làm đại lễ, b là người thường đang di chuyển -> a có quyền ưu tiên
          if (b.walking) avoidStrength *= 0.6;
        }

        if (!queueAhead) {
          avoidX += rightX * steerSide * avoidStrength;
          avoidZ += rightZ * steerSide * avoidStrength;
        }

        // Cơ chế "Đứng chờ" & nhường bước: nếu có người chắn ngay sát trước mặt (< 0.75m) trong hành lang hẹp
        if (!a.detourSign && !aIsHero && !bStatic && d < 0.75 && Math.abs(projRight) < 0.22 && forward > 0) {
          if (!b.walking || d < 0.60) {
            const decel = Math.max(0.08, (d - 0.42) / 0.33);
            if (decel < throttle) throttle = decel;
          }
        }
      }
    }

    // Cơ chế phát hiện tắc đường đối xứng & duy trì hướng đi vòng (Persistent Detour):
    if (!queueAhead && hasLeftObstacle && hasRightObstacle && minForwardDist < 1.8) {
      if (!a.detourSign) {
        a.detourSign = a.dodgePref || (a.idx % 2 === 0 ? 1 : -1) || 1;
      }
    }

    if (queueAhead) {
      a.detourSign = 0;
    } else if (a.detourSign) {
      if (!hasLeftObstacle && !hasRightObstacle) {
        a.detourSign = 0;
      } else {
        avoidX += rightX * a.detourSign * 2.8;
        avoidZ += rightZ * a.detourSign * 2.8;
      }
    }

    // Tốc độ thực tế sau khi tính toán
    const speed = baseSpeed * (a.speedMult || 1.0) * throttle;

    // Lọc mượt lực né (Exponential Moving Average) để triệt tiêu sốc gia tốc và hiện tượng giật rung giữa các khung hình
    const avoidK = Math.min(1, dt * 10.0);
    a.smoothAvoidX = (a.smoothAvoidX || 0) + (avoidX - (a.smoothAvoidX || 0)) * avoidK;
    a.smoothAvoidZ = (a.smoothAvoidZ || 0) + (avoidZ - (a.smoothAvoidZ || 0)) * avoidK;

    let moveVx = dirX + a.smoothAvoidX;
    let moveVz = dirZ + a.smoothAvoidZ;
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

    // Xoay mặt mềm mại theo hướng chuyển động thực tế (chỉ xoay khi quãng đường di chuyển đủ rõ ràng để tránh giật góc khi đứng gần như tại chỗ)
    if (actualMoved > 0.006) {
      if (!keepYaw) {
        const targetYaw = Math.atan2(-stepDx, -stepDz);
        a.yaw = lerpAngle(a.yaw || 0, targetYaw, Math.min(1, dt * 5.0));
      }
      a.walking = true;
    } else if (throttle <= 0.05) {
      a.walking = false;
    }

    return distTarget <= 0.08;
  }

  /**
   * Vòng đệm đàn hồi mềm (Soft Physical Relaxation):
   * Chạy giải thuật lặp 8 vòng (8 iterations) để giải quyết triệt để va chạm liên hoàn giữa nhiều người,
   * phân kỳ sơ bộ trường hợp trùng khít tọa độ hoàn toàn (coincident spawns),
   * và ưu tiên tuyệt đối trạng thái tĩnh của người ngồi niệm Phật trên bồ đoàn.
   */
  function relaxCollisions(avatars) {
    if (!Array.isArray(avatars) || avatars.length < 2) return;

    const count = avatars.length;
    // Số vòng lặp thích ứng theo mật độ đám đông kết hợp hệ số gia tốc SOR (Successive Over-Relaxation)
    // đảm bảo triệt tiêu xuyên thấu (>= 0.50m) kể cả khi 20-30 người dồn ứ thẳng hàng trong một pass
    const ITERATIONS = Math.max(36, Math.min(100, count * 3));

    // Phân kỳ sơ bộ các avatar trùng khít tọa độ hoàn toàn (coincident spawns)
    for (let i = 0; i < count; i++) {
      const a = avatars[i];
      if (!a || !a.active || a.fade) continue;
      for (let j = i + 1; j < count; j++) {
        const b = avatars[j];
        if (!b || !b.active || b.fade) continue;
        const dx = a.pos.x - b.pos.x;
        const dz = a.pos.z - b.pos.z;
        if (Math.hypot(dx, dz) < 0.001) {
          const angI = ((a.idx !== undefined ? a.idx : i) * 2 * Math.PI) / count;
          const angJ = ((b.idx !== undefined ? b.idx : j) * 2 * Math.PI) / count + 0.35;
          if (!isAvatarStatic(a)) {
            a.pos.x += Math.cos(angI) * 0.04;
            a.pos.z += Math.sin(angI) * 0.04;
          }
          if (!isAvatarStatic(b)) {
            b.pos.x += Math.cos(angJ) * 0.04;
            b.pos.z += Math.sin(angJ) * 0.04;
          }
        }
      }
    }

    for (let iter = 0; iter < ITERATIONS; iter++) {
      let maxOverlap = 0;
      for (let i = 0; i < count; i++) {
        const a = avatars[i];
        if (!a || !a.active || a.fade) continue;
        const aStatic = isAvatarStatic(a);

        for (let j = i + 1; j < count; j++) {
          const b = avatars[j];
          if (!b || !b.active || b.fade) continue;
          const bStatic = isAvatarStatic(b);

          // Cả 2 đều tĩnh (ngồi/quỳ/chờ): không ai di chuyển, bỏ qua sớm để tối ưu hiệu năng
          if (aStatic && bStatic) continue;

          const dx = a.pos.x - b.pos.x;
          const dz = a.pos.z - b.pos.z;
          const dist = Math.hypot(dx, dz);

          if (dist >= MIN_SEPARATION) continue;

          let nx, nz;
          if (dist < 0.001) {
            const angle = (((a.idx !== undefined ? a.idx : i) + 1) * 1.618 + (j + 1) * 2.718 + iter * 0.7) * Math.PI * 2;
            nx = Math.cos(angle);
            nz = Math.sin(angle);
          } else {
            nx = dx / dist;
            nz = dz / dist;
          }

          const overlap = MIN_SEPARATION - (dist < 0.001 ? 0 : dist);
          if (overlap > maxOverlap) maxOverlap = overlap;

          const aHero = isHeroAvatar(a);
          const bHero = isHeroAvatar(b);

          // Trạng thái tĩnh (người ngồi/quỳ trên bồ đoàn) có ưu tiên tuyệt đối cao nhất (vật cố định):
          // 1. Một bên tĩnh: bên còn lại (kể cả hero) phải dạt ra 100%
          // 2. Cả 2 đều di chuyển: xét quyền ưu tiên của hero (hero đẩy người thường)
          // 3. Cùng thứ bậc: chia đều lực đẩy (50% mỗi bên khi cả 2 đang di chuyển để không nảy lò xo)
          if (aStatic) {
            b.pos.x -= nx * overlap;
            b.pos.z -= nz * overlap;
          } else if (bStatic) {
            a.pos.x += nx * overlap;
            a.pos.z += nz * overlap;
          } else if (aHero && !bHero) {
            b.pos.x -= nx * overlap;
            b.pos.z -= nz * overlap;
          } else if (bHero && !aHero) {
            a.pos.x += nx * overlap;
            a.pos.z += nz * overlap;
          } else {
            const half = overlap * 0.5 * 1.45;
            a.pos.x += nx * half;
            a.pos.z += nz * half;
            b.pos.x -= nx * half;
            b.pos.z -= nz * half;
          }
        }
      }
      if (maxOverlap < 0.001) break;
    }
  }

  /**
   * Dọn dẹp trạng thái nghi lễ khi hoàn thành hoặc khi hủy bước/timeout (Never Stalled):
   * Giải phóng bowSpot, heroStage, goldTrail, glow và đạo cụ trên tay.
   */
  function cleanupAvatarRitual(a) {
    if (!a) return;
    a.bowSpot = -1;
    a.heroStage = '';
    a.goldTrail = false;
    a.glow = 0;
    a.glowTarget = 0;
    a.handPose = null;
    a.sticks = 0;
    a.busy = false;
    a.walking = false;
    a.entering = false;
    a.stuck = true;
    a.script = null;
    a.detourSign = 0;
    a.smoothAvoidX = 0;
    a.smoothAvoidZ = 0;
  }

  /**
   * Tạo bước di chuyển kết hợp né đám đông và failsafe timeout không báo đã tới khi kẹt.
   */
  function createMoveStep(target, speed = 1.9, keepYaw = false, avatarsRef = null) {
    let from = null;
    let dur = 1;
    let arrived = false;
    let failed = false;
    let elapsed = 0;
    return {
      start(a) {
        from = a.pos ? { x: a.pos.x, y: 0, z: a.pos.z } : { x: 0, y: 0, z: 0 };
        dur = Math.max(0.2, Math.hypot(target.x - from.x, target.z - from.z) / speed);
        a.walking = true;
        arrived = false;
        failed = false;
        elapsed = 0;
        a.smoothAvoidX = 0;
        a.smoothAvoidZ = 0;
      },
      get dur() { return dur; },
      isDone(a) { return arrived; },
      isFailed(a) { return failed; },
      update(a, k, dt, avatarsList) {
        elapsed += dt;
        const list = avatarsList || avatarsRef || [];
        arrived = steerAvatar(a, target, speed, dt, list, keepYaw);
        const timedOut = elapsed > dur * 4.0 + 4.0;
        if (arrived) {
          a.walking = false;
        } else if (timedOut) {
          // Bị mắc kẹt hoặc không thể tới đích: đánh dấu thất bại, không báo tới đích
          a.walking = false;
          a.stuck = true;
          failed = true;
        }
      }
    };
  }

  function runScript(a, steps, onDone) {
    a.script = { steps: steps.slice(), i: -1, t: 0, onDone };
    a.busy = true;
    nextScriptStep(a);
  }

  function nextScriptStep(a) {
    const s = a.script;
    if (!s) return;
    for (;;) {
      s.i += 1;
      s.t = 0;
      if (s.i >= s.steps.length) {
        a.script = null;
        a.busy = false;
        a.walking = false;
        s.onDone?.(a);
        return;
      }
      const st = s.steps[s.i];
      if (st.dynamic) {
        const more = st.dynamic(a);
        if (more === 'wait') { s.i -= 1; s.waiting = true; return; }
        if (Array.isArray(more)) s.steps.splice(s.i + 1, 0, ...more);
        continue;
      }
      s.waiting = false;
      st.start?.(a);
      return;
    }
  }

  function tickScript(a, dt, avatarsList, onStepFail) {
    const s = a.script;
    if (!s) return;
    if (s.waiting) { nextScriptStep(a); return; }
    const step = s.steps[s.i];
    if (!step) return;
    s.t += dt;
    const k = step.dur > 0 ? Math.min(1, s.t / step.dur) : 1;
    step.update?.(a, k, dt, avatarsList);
    if (step.isFailed ? step.isFailed(a) : false) {
      cleanupAvatarRitual(a);
      a.stuck = true;
      if (typeof onStepFail === 'function') onStepFail(a);
      return;
    }
    const done = step.isDone ? step.isDone(a) : (k >= 1);
    if (done) nextScriptStep(a);
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
    relaxCollisions,
    cleanupAvatarRitual,
    createMoveStep,
    runScript,
    tickScript
  };
});
