import { describe, test, expect } from "bun:test";
import CrowdNav from "../public/js/crowdNav.js";

describe("Organic Crowd Navigation & Collision Avoidance (Seam: Simulation Step)", () => {
  function createAvatar(id, x, z, options = {}) {
    return {
      idx: id,
      id,
      name: options.name || `Devotee_${id}`,
      active: true,
      pos: { x, y: 0, z },
      yaw: options.yaw || 0,
      phase: 0,
      walking: Boolean(options.walking),
      kneel: options.kneel || 0,
      waiting: Boolean(options.waiting),
      atSeat: options.atSeat ?? -1,
      dodgePref: options.dodgePref || (id % 2 === 0 ? 1 : -1),
      speedMult: options.speedMult || 1.0,
      heroStage: options.heroStage || '',
      goldTrail: Boolean(options.goldTrail),
      vipRank: options.vipRank || 0,
      ...options
    };
  }

  test("Head-on Passing: Two devotees walking towards each other avoid clipping and steer around", () => {
    const a = createAvatar(1, 0, 0, { walking: true });
    const b = createAvatar(2, 0, 10, { walking: true });

    const targetA = { x: 0, z: 10 };
    const targetB = { x: 0, z: 0 };
    const avatars = [a, b];

    let minRecordedDist = 999;
    let maxLateralDeviationA = 0;
    let maxLateralDeviationB = 0;

    const dt = 1 / 30;
    const maxSteps = 300;

    for (let step = 0; step < maxSteps; step++) {
      CrowdNav.steerAvatar(a, targetA, 1.8, dt, avatars);
      CrowdNav.steerAvatar(b, targetB, 1.8, dt, avatars);
      CrowdNav.relaxCollisions(avatars);

      const dist = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
      if (dist < minRecordedDist) minRecordedDist = dist;

      maxLateralDeviationA = Math.max(maxLateralDeviationA, Math.abs(a.pos.x));
      maxLateralDeviationB = Math.max(maxLateralDeviationB, Math.abs(b.pos.x));

      const distToTargetA = Math.hypot(targetA.x - a.pos.x, targetA.z - a.pos.z);
      const distToTargetB = Math.hypot(targetB.x - b.pos.x, targetB.z - b.pos.z);
      if (distToTargetA < 0.2 && distToTargetB < 0.2) break;
    }

    expect(minRecordedDist).toBeGreaterThanOrEqual(0.50);
    expect(maxLateralDeviationA).toBeGreaterThan(0.15);
    expect(maxLateralDeviationB).toBeGreaterThan(0.15);
    expect(Math.hypot(targetA.x - a.pos.x, targetA.z - a.pos.z)).toBeLessThan(0.3);
    expect(Math.hypot(targetB.x - b.pos.x, targetB.z - b.pos.z)).toBeLessThan(0.3);
  });

  test("Stationary Obstacle Avoidance: Walker weaves around seated devotee without displacing them", () => {
    const walker = createAvatar(1, 0, 0, { walking: true });
    const seated = createAvatar(2, 0, 4, { walking: false, kneel: 1, atSeat: 5 });

    const target = { x: 0, z: 8 };
    const avatars = [walker, seated];

    let minRecordedDist = 999;
    let maxLateralOffset = 0;
    const initialSeatedPos = { ...seated.pos };

    const dt = 1 / 30;
    for (let step = 0; step < 240; step++) {
      CrowdNav.steerAvatar(walker, target, 1.8, dt, avatars);
      CrowdNav.relaxCollisions(avatars);

      const dist = Math.hypot(walker.pos.x - seated.pos.x, walker.pos.z - seated.pos.z);
      if (dist < minRecordedDist) minRecordedDist = dist;
      maxLateralOffset = Math.max(maxLateralOffset, Math.abs(walker.pos.x));

      if (Math.hypot(target.x - walker.pos.x, target.z - walker.pos.z) < 0.2) break;
    }

    expect(minRecordedDist).toBeGreaterThanOrEqual(0.50);
    expect(maxLateralOffset).toBeGreaterThan(0.25);
    expect(seated.pos.x).toBe(initialSeatedPos.x);
    expect(seated.pos.z).toBe(initialSeatedPos.z);
    expect(Math.hypot(target.x - walker.pos.x, target.z - walker.pos.z)).toBeLessThan(0.3);
  });

  test("Queueing & Following: Follower maintains respectful distance behind stopped leader", () => {
    const leader = createAvatar(1, 0, 4, { walking: false, waiting: true });
    const follower = createAvatar(2, 0, 0, { walking: true });

    const target = { x: 0, z: 8 };
    const leftBlocker = createAvatar(3, -0.45, 4, { walking: false, waiting: true });
    const rightBlocker = createAvatar(4, 0.45, 4, { walking: false, waiting: true });
    const avatars = [leader, follower, leftBlocker, rightBlocker];

    const dt = 1 / 30;
    let minRecordedDist = 999;

    for (let step = 0; step < 150; step++) {
      CrowdNav.steerAvatar(follower, target, 1.8, dt, avatars);
      CrowdNav.relaxCollisions(avatars);

      const dist = Math.hypot(follower.pos.x - leader.pos.x, follower.pos.z - leader.pos.z);
      if (dist < minRecordedDist) minRecordedDist = dist;
    }

    expect(minRecordedDist).toBeGreaterThanOrEqual(0.50);
    expect(follower.pos.z).toBeLessThanOrEqual(leader.pos.z);
  });

  test("[Finding P1 Fix] Real Spatial Arrival: Slower devotee (speedMult=0.92) only finishes upon reaching destination", () => {
    // Slower avatar: speedMult = 0.92 walking from (0, 0) to (0, 5)
    const a = createAvatar(1, 0, 0, { walking: true, speedMult: 0.92 });
    const target = { x: 0, z: 5 };
    const speed = 1.9;
    const theoreticalDur = 5.0 / speed; // ~2.63 seconds

    const dt = 1 / 30;
    let elapsed = 0;
    let arrived = false;

    // Simulate stepping with theoretical duration tracking
    while (!arrived && elapsed < 8.0) {
      elapsed += dt;
      arrived = CrowdNav.steerAvatar(a, target, speed, dt, [a]);
    }

    // Must have successfully arrived within 0.08m of target
    const finalDist = Math.hypot(target.x - a.pos.x, target.z - a.pos.z);
    expect(finalDist).toBeLessThanOrEqual(0.08);

    // It correctly took longer than theoreticalDur without terminating prematurely
    expect(elapsed).toBeGreaterThan(theoreticalDur);
  });

  test("[Finding P1 Fix] Multi-Agent Cluster Relaxation & Coincident Spawn: Strict >= 0.50m separation", () => {
    // 5 avatars clustered tightly together (initial distances ~0.2m..0.4m)
    const avatars = [
      createAvatar(1, 0.0, 0.0, { walking: true }),
      createAvatar(2, 0.15, 0.1, { walking: true }),
      createAvatar(3, -0.1, 0.2, { walking: true }),
      createAvatar(4, 0.25, -0.15, { walking: true }),
      createAvatar(5, -0.2, -0.2, { walking: true }),
    ];

    // Relax collisions
    CrowdNav.relaxCollisions(avatars);

    // Verify EVERY pair satisfies dist >= 0.50m
    for (let i = 0; i < avatars.length; i++) {
      for (let j = i + 1; j < avatars.length; j++) {
        const d = Math.hypot(avatars[i].pos.x - avatars[j].pos.x, avatars[i].pos.z - avatars[j].pos.z);
        expect(d).toBeGreaterThanOrEqual(0.50);
      }
    }

    // Coincident coordinates: two avatars spawn at EXACT same point (0, 0)
    const c1 = createAvatar(10, 0, 0, { walking: true });
    const c2 = createAvatar(11, 0, 0, { walking: true });
    CrowdNav.relaxCollisions([c1, c2]);
    const coincidentDist = Math.hypot(c1.pos.x - c2.pos.x, c1.pos.z - c2.pos.z);
    expect(coincidentDist).toBeGreaterThanOrEqual(0.50);
  });

  test("[Finding P2 Fix] keepYaw: Stepping backwards does not rotate avatar away from altar", () => {
    // Avatar is facing the altar (yaw = 0)
    const a = createAvatar(1, 0, -5, { yaw: 0, walking: true });
    // Avatar takes step backwards to (0, -3.5) after planting incense
    const stepBackTarget = { x: 0, z: -3.5 };

    const dt = 1 / 30;
    for (let i = 0; i < 30; i++) {
      CrowdNav.steerAvatar(a, stepBackTarget, 1.0, dt, [a], true /* keepYaw */);
      // Yaw must remain 0 throughout the backward motion
      expect(Math.abs(a.yaw)).toBeLessThan(0.001);
    }

    // Verify that without keepYaw, stepping in the same direction DOES rotate yaw
    const b = createAvatar(2, 0, -5, { yaw: 0, walking: true });
    for (let i = 0; i < 15; i++) {
      CrowdNav.steerAvatar(b, stepBackTarget, 1.0, dt, [b], false /* normal yaw */);
    }
    // b rotated towards movement direction (-stepDx, -stepDz)
    expect(Math.abs(b.yaw)).toBeGreaterThan(1.0);
  });

  test("[Finding P2 Fix] Hero Priority: Ordinary worshippers yield and give right-of-way to ritual hero", () => {
    // Hero avatar performing ritual ceremony (walking up the carpet to altar)
    const hero = createAvatar(1, 0, 0, { walking: true, heroStage: 'walk', goldTrail: true, vipRank: 1 });
    // Ordinary worshipper walking down towards hero
    const normal = createAvatar(2, 0, 5, { walking: true });

    const targetHero = { x: 0, z: 8 };
    const targetNormal = { x: 0, z: 0 };
    const avatars = [hero, normal];

    const dt = 1 / 30;
    let minRecordedDist = 999;
    let maxHeroLateralDev = 0;
    let maxNormalLateralDev = 0;

    for (let step = 0; step < 180; step++) {
      CrowdNav.steerAvatar(hero, targetHero, 1.8, dt, avatars);
      CrowdNav.steerAvatar(normal, targetNormal, 1.8, dt, avatars);
      CrowdNav.relaxCollisions(avatars);

      const d = Math.hypot(hero.pos.x - normal.pos.x, hero.pos.z - normal.pos.z);
      if (d < minRecordedDist) minRecordedDist = d;

      maxHeroLateralDev = Math.max(maxHeroLateralDev, Math.abs(hero.pos.x));
      maxNormalLateralDev = Math.max(maxNormalLateralDev, Math.abs(normal.pos.x));
    }

    // Minimum distance maintained
    expect(minRecordedDist).toBeGreaterThanOrEqual(0.50);

    // Normal devotee diverted significantly more to clear path for the hero
    expect(maxNormalLateralDev).toBeGreaterThan(maxHeroLateralDev);
    expect(maxNormalLateralDev).toBeGreaterThan(0.20);

    // Hero was not displaced in relaxation test against normal devotee
    const h = createAvatar(10, 0, 0, { walking: true, heroStage: 'walk' });
    const n = createAvatar(11, 0, 0.3, { walking: true }); // overlaps hero
    CrowdNav.relaxCollisions([h, n]);
    // Hero stayed at original x=0, z=0; normal was pushed away
    expect(h.pos.x).toBe(0);
    expect(h.pos.z).toBe(0);
    expect(Math.hypot(n.pos.x - h.pos.x, n.pos.z - h.pos.z)).toBeGreaterThanOrEqual(0.50);
  });

  test("[Finding P1 Fix] Hero vs Seated Devotees: Seated state takes strict precedence and maintains >= 0.50m", () => {
    // Hero attempting to walk past two seated devotees at (-0.4, 4) and (0.4, 4)
    const hero = createAvatar(1, 0, 0, { walking: true, heroStage: 'walk', goldTrail: true, vipRank: 1 });
    const seatedLeft = createAvatar(2, -0.4, 4, { walking: false, kneel: 1, atSeat: 1 });
    const seatedRight = createAvatar(3, 0.4, 4, { walking: false, kneel: 1, atSeat: 2 });
    const avatars = [hero, seatedLeft, seatedRight];

    const target = { x: 0, z: 8 };
    const dt = 1 / 30;
    let minHeroDist = 999;

    for (let step = 0; step < 240; step++) {
      CrowdNav.steerAvatar(hero, target, 1.8, dt, avatars);
      CrowdNav.relaxCollisions(avatars);

      const d1 = Math.hypot(hero.pos.x - seatedLeft.pos.x, hero.pos.z - seatedLeft.pos.z);
      const d2 = Math.hypot(hero.pos.x - seatedRight.pos.x, hero.pos.z - seatedRight.pos.z);
      minHeroDist = Math.min(minHeroDist, d1, d2);
    }

    // Seated devotees must remain firmly anchored to their prayer cushions
    expect(seatedLeft.pos.x).toBe(-0.4);
    expect(seatedLeft.pos.z).toBe(4);
    expect(seatedRight.pos.x).toBe(0.4);
    expect(seatedRight.pos.z).toBe(4);

    // Hero must maintain at least 0.50m clearance and not penetrate between them
    expect(minHeroDist).toBeGreaterThanOrEqual(0.50);

    // Direct collision relaxation check: hero overlapping seated devotee
    const hOverlap = createAvatar(10, 0, 3.8, { walking: true, heroStage: 'walk' });
    const sAnchored = createAvatar(11, 0, 4.0, { walking: false, kneel: 1, atSeat: 3 });
    CrowdNav.relaxCollisions([hOverlap, sAnchored]);
    expect(sAnchored.pos.z).toBe(4.0);
    expect(Math.hypot(hOverlap.pos.x - sAnchored.pos.x, hOverlap.pos.z - sAnchored.pos.z)).toBeGreaterThanOrEqual(0.50);
  });

  test("[Finding P1 Fix] Symmetric Bottleneck Detour: Walker smoothly weaves around symmetric obstacles and reaches destination for both preferences", () => {
    for (const pref of [1, -1]) {
      const walker = createAvatar(1, 0, 0, { walking: true, dodgePref: pref });
      const seatedLeft = createAvatar(2, -0.4, 4, { walking: false, kneel: 1, atSeat: 1 });
      const seatedRight = createAvatar(3, 0.4, 4, { walking: false, kneel: 1, atSeat: 2 });
      const avatars = [walker, seatedLeft, seatedRight];

      const target = { x: 0, z: 8 };
      const dt = 1 / 30;
      let minLeftDist = 999;
      let minRightDist = 999;
      let arrived = false;

      // Chạy mô phỏng trong tối đa 10s (300 frames)
      for (let frame = 0; frame < 300; frame++) {
        arrived = CrowdNav.steerAvatar(walker, target, 1.8, dt, avatars);
        CrowdNav.relaxCollisions(avatars);

        const dL = Math.hypot(walker.pos.x - seatedLeft.pos.x, walker.pos.z - seatedLeft.pos.z);
        const dR = Math.hypot(walker.pos.x - seatedRight.pos.x, walker.pos.z - seatedRight.pos.z);
        if (dL < minLeftDist) minLeftDist = dL;
        if (dR < minRightDist) minRightDist = dR;

        if (arrived) break;
      }

      // Phải tới đích thành công (không bị kẹt giữa 2 người ngồi)
      expect(arrived).toBe(true);
      expect(Math.hypot(target.x - walker.pos.x, target.z - walker.pos.z)).toBeLessThanOrEqual(0.08);

      // Người ngồi không bị đẩy dịch chuyển
      expect(seatedLeft.pos.x).toBe(-0.4);
      expect(seatedLeft.pos.z).toBe(4);
      expect(seatedRight.pos.x).toBe(0.4);
      expect(seatedRight.pos.z).toBe(4);

      // Duy trì khoảng đệm an toàn >= 0.50m
      expect(minLeftDist).toBeGreaterThanOrEqual(0.50);
      expect(minRightDist).toBeGreaterThanOrEqual(0.50);
    }
  });

  test("[Finding P1 Fix] Dense Multi-Agent Relaxation: 10, 20, 30 collinear walkers and 6 coincident avatars strictly satisfy >= 0.50m", () => {
    // 10 collinear walkers at (i * 0.4, 0)
    const line10 = [];
    for (let i = 0; i < 10; i++) {
      line10.push(createAvatar(i + 1, i * 0.4, 0, { walking: true }));
    }
    CrowdNav.relaxCollisions(line10);
    let minLine10 = 999;
    for (let i = 0; i < line10.length; i++) {
      for (let j = i + 1; j < line10.length; j++) {
        const d = Math.hypot(line10[i].pos.x - line10[j].pos.x, line10[i].pos.z - line10[j].pos.z);
        if (d < minLine10) minLine10 = d;
      }
    }
    expect(minLine10).toBeGreaterThanOrEqual(0.50);

    // 20 collinear walkers at (i * 0.4, 0)
    const line20 = [];
    for (let i = 0; i < 20; i++) {
      line20.push(createAvatar(i + 1, i * 0.4, 0, { walking: true }));
    }
    CrowdNav.relaxCollisions(line20);
    let minLine20 = 999;
    for (let i = 0; i < line20.length; i++) {
      for (let j = i + 1; j < line20.length; j++) {
        const d = Math.hypot(line20[i].pos.x - line20[j].pos.x, line20[i].pos.z - line20[j].pos.z);
        if (d < minLine20) minLine20 = d;
      }
    }
    expect(minLine20).toBeGreaterThanOrEqual(0.50);

    // 30 collinear walkers at (i * 0.4, 0)
    const line30 = [];
    for (let i = 0; i < 30; i++) {
      line30.push(createAvatar(i + 1, i * 0.4, 0, { walking: true }));
    }
    CrowdNav.relaxCollisions(line30);
    let minLine30 = 999;
    for (let i = 0; i < line30.length; i++) {
      for (let j = i + 1; j < line30.length; j++) {
        const d = Math.hypot(line30[i].pos.x - line30[j].pos.x, line30[i].pos.z - line30[j].pos.z);
        if (d < minLine30) minLine30 = d;
      }
    }
    expect(minLine30).toBeGreaterThanOrEqual(0.50);

    // 6 coincident avatars spawned at the exact same point (0, 0)
    const coincident6 = [
      createAvatar(21, 0, 0, { walking: true }),
      createAvatar(22, 0, 0, { walking: true }),
      createAvatar(23, 0, 0, { walking: true }),
      createAvatar(24, 0, 0, { walking: true }),
      createAvatar(25, 0, 0, { walking: true }),
      createAvatar(26, 0, 0, { walking: true }),
    ];
    CrowdNav.relaxCollisions(coincident6);
    let minCoin6 = 999;
    for (let i = 0; i < coincident6.length; i++) {
      for (let j = i + 1; j < coincident6.length; j++) {
        const d = Math.hypot(coincident6[i].pos.x - coincident6[j].pos.x, coincident6[i].pos.z - coincident6[j].pos.z);
        if (d < minCoin6) minCoin6 = d;
      }
    }
    expect(minCoin6).toBeGreaterThanOrEqual(0.50);
  });

  test("[Finding P1 Fix] Hero Right-of-Way vs Waiting Devotee: Hero is not blocked by waiting devotee when flanks are clear and reaches destination", () => {
    const hero = createAvatar(1, 0, 0, {
      walking: true,
      heroStage: 'walk',
      goldTrail: true
    });
    const waitingPerson = createAvatar(2, 0, 4, {
      walking: false,
      waiting: true
    });
    const avatars = [hero, waitingPerson];
    const target = { x: 0, z: 8 };
    const dt = 1 / 30;
    let minHeroDist = 999;
    let heroArrived = false;

    for (let f = 0; f < 300; f++) {
      heroArrived = CrowdNav.steerAvatar(hero, target, 1.8, dt, avatars);
      CrowdNav.relaxCollisions(avatars);

      const d = Math.hypot(hero.pos.x - waitingPerson.pos.x, hero.pos.z - waitingPerson.pos.z);
      if (d < minHeroDist) minHeroDist = d;

      if (heroArrived) break;
    }

    // Hero must arrive at destination and not get stuck behind waiting devotee
    expect(heroArrived).toBe(true);
    expect(Math.hypot(target.x - hero.pos.x, target.z - hero.pos.z)).toBeLessThanOrEqual(0.08);

    // Hero must maintain physical clearance >= 0.50m from waiting person
    expect(minHeroDist).toBeGreaterThanOrEqual(0.50);
  });

  test("[Finding P1 Fix] Ritual Cleanup & Recovery on Failure: Trapped avatar releases bowSpot, heroStage, props and recovers (Never Stalled)", () => {
    let onDoneCalled = false;
    let onFailCalled = false;

    // Avatar đang hành lễ (Hero có quyền ưu tiên và giữ vị trí bàn thờ)
    const hero = createAvatar(1, 0, 0, {
      walking: false,
      heroStage: 'walk',
      goldTrail: true,
      bowSpot: 2,
      sticks: 2,
      handPose: 'hold'
    });

    // Rào chắn kín 4 phía bằng người ngồi tĩnh để avatar hoàn toàn không thể lách qua
    const blockers = [];
    let bId = 10;
    for (let x = -4; x <= 4; x += 0.35) blockers.push(createAvatar(bId++, x, 2, { walking: false, kneel: 1, atSeat: bId }));
    for (let x = -4; x <= 4; x += 0.35) blockers.push(createAvatar(bId++, x, -2, { walking: false, kneel: 1, atSeat: bId }));
    for (let z = -2; z <= 2; z += 0.35) blockers.push(createAvatar(bId++, -2, z, { walking: false, kneel: 1, atSeat: bId }));
    for (let z = -2; z <= 2; z += 0.35) blockers.push(createAvatar(bId++, 2, z, { walking: false, kneel: 1, atSeat: bId }));
    const avatars = [hero, ...blockers];

    const target = { x: 0, z: 8 };
    const step = CrowdNav.createMoveStep(target, 1.8, false, avatars);

    CrowdNav.runScript(hero, [step], (av) => {
      onDoneCalled = true;
    });

    const dt = 1 / 30;
    // Step duration = 8 / 1.8 = 4.44s. Timeout = 4.44 * 4 + 4 = 21.77s.
    // Chạy mô phỏng 23s (690 frames)
    for (let f = 0; f < 690; f++) {
      CrowdNav.tickScript(hero, dt, avatars, (av) => {
        onFailCalled = true;
      });
      CrowdNav.relaxCollisions(avatars);
    }

    // Không được gọi onDone vì avatar bị kẹt
    expect(onDoneCalled).toBe(false);

    // Phải kích hoạt callback xử lý thất bại (failure recovery)
    expect(onFailCalled).toBe(true);

    // Trạng thái đại lễ phải được dọn dẹp triệt để (Never Stalled):
    expect(hero.bowSpot).toBe(-1);       // Nhả chỗ bàn thờ cho người khác
    expect(hero.heroStage).toBe('');     // Hủy quyền ưu tiên đại lễ
    expect(hero.goldTrail).toBe(false);  // Dừng vệt hoa vàng
    expect(hero.sticks).toBe(0);         // Xóa nhang trên tay
    expect(hero.handPose).toBeNull();    // Trả tư thế tay
    expect(hero.stuck).toBe(true);       // Đánh dấu bị kẹt
    expect(hero.walking).toBe(false);    // Dừng bước
    expect(hero.script).toBeNull();      // Xóa script
    expect(hero.entering).toBe(false);   // Giải phóng cờ entering để phục hồi hàng chờ
  });

  test("[Finding P1 Fix] Entrance Queue Deadlock Recovery: 6 failed entering avatars reset entering=false, unblocking queue", () => {
    const MAX_ENTERING = 6;
    const enteringAvatars = [];
    const wallOfDevotees = [];
    let idGen = 100;
    for (let x = -8; x <= 8; x += 0.35) {
      wallOfDevotees.push(createAvatar(idGen++, x, 4, { walking: false, kneel: 1, atSeat: idGen }));
    }
    for (let z = 0; z <= 4; z += 0.35) {
      wallOfDevotees.push(createAvatar(idGen++, -8, z, { walking: false, kneel: 1, atSeat: idGen }));
      wallOfDevotees.push(createAvatar(idGen++, 8, z, { walking: false, kneel: 1, atSeat: idGen }));
    }

    for (let i = 0; i < MAX_ENTERING; i++) {
      const a = createAvatar(i + 1, (i - 2.5) * 0.4, 0, { walking: false, entering: true });
      const step = CrowdNav.createMoveStep({ x: 0, z: 8 }, 1.8, false);
      CrowdNav.runScript(a, [step], (av) => {
        av.entering = false;
      });
      enteringAvatars.push(a);
    }

    const allAvatars = [...enteringAvatars, ...wallOfDevotees];
    const dt = 1 / 30;
    for (let f = 0; f < 690; f++) {
      for (const a of enteringAvatars) {
        CrowdNav.tickScript(a, dt, allAvatars, (av) => {
          av.entering = false;
        });
      }
      CrowdNav.relaxCollisions(allAvatars);
    }

    // Sau khi timeout, cả 6 avatar phải có entering = false
    const enteringCount = allAvatars.filter(x => x.active && x.entering).length;
    expect(enteringCount).toBe(0);

    // Hàng chờ phục hồi: người thứ 7 vào chùa không bị nghẽn
    const canEnter = (enteringCount < MAX_ENTERING);
    expect(canEnter).toBe(true);
  });

  test("[Finding P2 Fix] Canonical Runner Integration: temple3d methods delegate to CrowdNav and handle failure recovery", () => {
    const fs = require('fs');
    const path = require('path');
    const temple3dCode = fs.readFileSync(path.join(__dirname, '../public/js/temple3d.js'), 'utf8');

    // temple3d delegates moveStep, runScript, and tickScript to CrowdNav without duplication
    expect(temple3dCode).toContain("CrowdNav.createMoveStep(target, speed, keepYaw, avatars)");
    expect(temple3dCode).toContain("CrowdNav.runScript(a, steps, onDone)");
    expect(temple3dCode).toContain("CrowdNav.tickScript(a, dt, avatars, (av) =>");
    expect(temple3dCode).toContain("handleAvatarMoveFailure(av)");

    // Failure recovery cleans up ritual state
    const mockHero = createAvatar(99, 0, 0, {
      member: true,
      seat: 4,
      heroStage: 'plant',
      bowSpot: 1,
      goldTrail: true,
      sticks: 3,
      handPose: 'pray'
    });

    CrowdNav.cleanupAvatarRitual(mockHero);
    expect(mockHero.bowSpot).toBe(-1);
    expect(mockHero.heroStage).toBe('');
    expect(mockHero.goldTrail).toBe(false);
    expect(mockHero.sticks).toBe(0);
    expect(mockHero.handPose).toBeNull();
  });
});
