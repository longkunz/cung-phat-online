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
});
