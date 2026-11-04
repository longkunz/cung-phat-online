import { describe, test, expect } from 'bun:test';
import CrowdNav from '../public/js/crowdNav.js';

describe('Actor Avoidance Continuous Jitter Diagnosis (Seam: steerAvatar & relaxCollisions)', () => {
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

  test('Diagnostic Scenario 1: Head-on walkers in aisle beside seated devotees must not oscillate or flap direction', () => {
    // Lane X = 1.25, seated devotees at X = 2.05 (realistic temple layout)
    const seated = [
      createAvatar(10, 2.05, 1.55, { walking: false, atSeat: 1, kneel: 1 }),
      createAvatar(11, 2.05, -0.60, { walking: false, atSeat: 2, kneel: 1 }),
      createAvatar(12, 2.05, -2.75, { walking: false, atSeat: 3, kneel: 1 })
    ];

    // Walker A entering towards altar (z: 2.5 -> -2.0), Walker B leaving towards door (z: -2.0 -> 2.5)
    const targetA = { x: 1.25, z: -2.0 };
    const targetB = { x: 1.25, z: 2.5 };
    const a = createAvatar(1, 1.25, 2.5, { walking: true, dodgePref: 1 });
    const b = createAvatar(2, 1.25, -2.0, { walking: true, dodgePref: -1 });
    const avatars = [a, b, ...seated];
    const dt = 1 / 30;

    let lateralFlipsA = 0;
    let yawFlipsA = 0;
    let prevVxA = 0;
    let prevDyawA = 0;
    let walkFlapsA = 0;
    let prevWalkA = true;

    for (let step = 0; step < 160; step++) {
      const prevX_A = a.pos.x;
      const prevYawA = a.yaw;

      const arrivedA = CrowdNav.steerAvatar(a, targetA, 1.8, dt, avatars);
      const arrivedB = CrowdNav.steerAvatar(b, targetB, 1.8, dt, avatars);
      CrowdNav.relaxCollisions(avatars);

      const vxA = (a.pos.x - prevX_A) / dt;
      if (Math.abs(vxA) > 0.04 && Math.abs(prevVxA) > 0.04 && vxA * prevVxA < 0) {
        lateralFlipsA++;
      }
      if (Math.abs(vxA) > 0.04) prevVxA = vxA;

      const dyawA = a.yaw - prevYawA;
      if (Math.abs(dyawA) > 0.035 && Math.abs(prevDyawA) > 0.035 && dyawA * prevDyawA < 0) {
        yawFlipsA++;
      }
      if (Math.abs(dyawA) > 0.035) prevDyawA = dyawA;

      if (a.walking !== prevWalkA) {
        walkFlapsA++;
        prevWalkA = a.walking;
      }

      const distA = Math.hypot(targetA.x - a.pos.x, targetA.z - a.pos.z);
      const distB = Math.hypot(targetB.x - b.pos.x, targetB.z - b.pos.z);
      if ((arrivedA && arrivedB) || (distA < 0.25 && distB < 0.25)) break;
    }

    console.log(`[Diagnostic 1] lateralFlipsA: ${lateralFlipsA}, yawFlipsA: ${yawFlipsA}, walkFlapsA: ${walkFlapsA}`);
    // Smooth passing: at most 1 directional diversion and return (no continuous fluttering/jitter)
    expect(lateralFlipsA).toBeLessThanOrEqual(1);
    expect(yawFlipsA).toBeLessThanOrEqual(1);
    expect(walkFlapsA).toBeLessThanOrEqual(1);
  });

  test('Diagnostic Scenario 2: Multi-walker aisle avoidance must avoid continuous lateral velocity reversals', () => {
    // 3 walkers on the carpet: A and B walking forward, C walking opposite
    const a = createAvatar(1, -0.15, 0.0, { walking: true });
    const b = createAvatar(2, 0.15, 0.5, { walking: true });
    const c = createAvatar(3, 0.0, 7.0, { walking: true });
    const avatars = [a, b, c];
    const dt = 1 / 30;

    let totalFlips = 0;
    let prevVx = [0, 0, 0];

    for (let step = 0; step < 160; step++) {
      const prevX = [a.pos.x, b.pos.x, c.pos.x];
      CrowdNav.steerAvatar(a, { x: 0, z: 7 }, 1.8, dt, avatars);
      CrowdNav.steerAvatar(b, { x: 0, z: 7 }, 1.8, dt, avatars);
      CrowdNav.steerAvatar(c, { x: 0, z: 0 }, 1.8, dt, avatars);
      CrowdNav.relaxCollisions(avatars);

      [a, b, c].forEach((av, idx) => {
        const vx = (av.pos.x - prevX[idx]) / dt;
        if (Math.abs(vx) > 0.05 && Math.abs(prevVx[idx]) > 0.05 && vx * prevVx[idx] < 0) {
          totalFlips++;
        }
        if (Math.abs(vx) > 0.05) prevVx[idx] = vx;
      });
    }

    console.log(`[Diagnostic 2] totalFlips: ${totalFlips}`);
    // JITTER BUG FIX: Total lateral velocity reversals should not exceed 3 across all avatars (dropped from 7+)
    expect(totalFlips).toBeLessThanOrEqual(3);
  });

  test('Diagnostic Scenario 3: Physical relaxation with over-relaxation factor 1.45 must not induce position chatter', () => {
    // 2 closely spaced walkers undergoing soft physical relaxation
    const a = createAvatar(1, 0.0, 0.0, { walking: true });
    const b = createAvatar(2, 0.46, 0.0, { walking: true }); // Distance 0.46m < 0.50m (overlap 0.04m)
    const avatars = [a, b];

    let chatterCount = 0;
    let prevDx = 0;
    const dt = 1 / 30;

    for (let s = 0; s < 40; s++) {
      const x0 = a.pos.x;
      // Step towards each other slightly to simulate continuous crowd pressure
      CrowdNav.steerAvatar(a, { x: 0.25, z: 0.0 }, 1.0, dt, avatars);
      CrowdNav.steerAvatar(b, { x: 0.25, z: 0.0 }, 1.0, dt, avatars);
      CrowdNav.relaxCollisions(avatars);

      const dx = a.pos.x - x0;
      if (Math.abs(dx) > 0.005 && Math.abs(prevDx) > 0.005 && dx * prevDx < 0) {
        chatterCount++;
      }
      if (Math.abs(dx) > 0.005) prevDx = dx;
    }

    console.log(`[Diagnostic 3] relaxation chatterCount: ${chatterCount}`);
    expect(chatterCount).toBeLessThanOrEqual(2);
  });
});
