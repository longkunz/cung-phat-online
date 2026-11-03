import { describe, test, expect } from "bun:test";
import CrowdNav from "../public/js/crowdNav.js";

describe("Crowd Navigation Smoothness & Anti-Jitter Avoidance", () => {
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

  test("Obstruction Avoidance: Two devotees encountering each other in a constrained passage must avoid smoothly without jitter", () => {
    // Narrow passage with seated devotees on flanks
    const obs = [
      createAvatar(10, -0.45, 2.5, { walking: false, atSeat: 1 }),
      createAvatar(11, 0.45, 2.5, { walking: false, atSeat: 2 })
    ];
    const a = createAvatar(1, 0, 0, { walking: true, dodgePref: 1 });
    const b = createAvatar(2, 0, 5, { walking: true, dodgePref: -1 });
    const avatars = [a, b, ...obs];

    let flipsA = 0, flipsB = 0;
    let prevDxA = 0, prevDxB = 0;
    let prevYawA = 0, prevYawB = 0;
    let yawFlipsA = 0, yawFlipsB = 0;

    const dt = 1 / 30;
    const maxSteps = 120;

    for (let s = 0; s < maxSteps; s++) {
      const pA = a.pos.x, pB = b.pos.x;
      const yA = a.yaw, yB = b.yaw;

      CrowdNav.steerAvatar(a, { x: 0, z: 5 }, 1.8, dt, avatars);
      CrowdNav.steerAvatar(b, { x: 0, z: 0 }, 1.8, dt, avatars);
      CrowdNav.relaxCollisions(avatars);

      const dxA = a.pos.x - pA, dxB = b.pos.x - pB;
      const dyA = a.yaw - yA, dyB = b.yaw - yB;

      if (Math.abs(dxA) > 0.002 && Math.abs(prevDxA) > 0.002 && (dxA * prevDxA < 0)) flipsA++;
      if (Math.abs(dxB) > 0.002 && Math.abs(prevDxB) > 0.002 && (dxB * prevDxB < 0)) flipsB++;
      if (Math.abs(dyA) > 0.03 && Math.abs(prevYawA) > 0.03 && (dyA * prevYawA < 0)) yawFlipsA++;
      if (Math.abs(dyB) > 0.03 && Math.abs(prevYawB) > 0.03 && (dyB * prevYawB < 0)) yawFlipsB++;

      if (Math.abs(dxA) > 0.002) prevDxA = dxA;
      if (Math.abs(dxB) > 0.002) prevDxB = dxB;
      if (Math.abs(dyA) > 0.03) prevYawA = dyA;
      if (Math.abs(dyB) > 0.03) prevYawB = dyB;
    }

    // Natural avoidance should steer aside smoothly, not jitter/oscillate back and forth (> 4 reversals is jitter)
    expect(flipsA).toBeLessThanOrEqual(4);
    expect(flipsB).toBeLessThanOrEqual(4);
    expect(yawFlipsA).toBeLessThanOrEqual(4);
    expect(yawFlipsB).toBeLessThanOrEqual(4);
  });

  test("Converging Paths: Two devotees heading towards the same target must not oscillate lateral velocity", () => {
    const a = createAvatar(1, -1.0, 0, { walking: true, dodgePref: 1 });
    const b = createAvatar(2, 1.0, 0, { walking: true, dodgePref: -1 });
    const avatars = [a, b];

    let flipsA = 0, flipsB = 0;
    let prevDxA = 0, prevDxB = 0;
    const dt = 1 / 30;

    for (let s = 0; s < 100; s++) {
      const pA = a.pos.x, pB = b.pos.x;
      CrowdNav.steerAvatar(a, { x: 0, z: 6 }, 1.8, dt, avatars);
      CrowdNav.steerAvatar(b, { x: 0, z: 6 }, 1.8, dt, avatars);
      CrowdNav.relaxCollisions(avatars);

      const dxA = a.pos.x - pA, dxB = b.pos.x - pB;
      if (Math.abs(dxA) > 0.002 && Math.abs(prevDxA) > 0.002 && (dxA * prevDxA < 0)) flipsA++;
      if (Math.abs(dxB) > 0.002 && Math.abs(prevDxB) > 0.002 && (dxB * prevDxB < 0)) flipsB++;
      if (Math.abs(dxA) > 0.002) prevDxA = dxA;
      if (Math.abs(dxB) > 0.002) prevDxB = dxB;
    }

    expect(flipsA).toBeLessThanOrEqual(4);
    expect(flipsB).toBeLessThanOrEqual(4);
  });
});
