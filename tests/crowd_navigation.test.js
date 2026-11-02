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
      ...options
    };
  }

  test("Head-on Passing: Two devotees walking towards each other avoid clipping and steer around", () => {
    // Avatar A walks from z=0 to z=10 along center line x=0
    const a = createAvatar(1, 0, 0, { walking: true });
    // Avatar B walks from z=10 to z=0 along center line x=0
    const b = createAvatar(2, 0, 10, { walking: true });

    const targetA = { x: 0, z: 10 };
    const targetB = { x: 0, z: 0 };
    const avatars = [a, b];

    let minRecordedDist = 999;
    let maxLateralDeviationA = 0;
    let maxLateralDeviationB = 0;

    const dt = 1 / 30; // 30 FPS step
    const maxSteps = 300; // 10 seconds max

    for (let step = 0; step < maxSteps; step++) {
      CrowdNav.steerAvatar(a, targetA, 1.8, dt, avatars);
      CrowdNav.steerAvatar(b, targetB, 1.8, dt, avatars);
      CrowdNav.relaxCollisions(avatars);

      const dist = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
      if (dist < minRecordedDist) minRecordedDist = dist;

      maxLateralDeviationA = Math.max(maxLateralDeviationA, Math.abs(a.pos.x));
      maxLateralDeviationB = Math.max(maxLateralDeviationB, Math.abs(b.pos.x));

      // Stop once both reached their destinations (dist to target < 0.2m)
      const distToTargetA = Math.hypot(targetA.x - a.pos.x, targetA.z - a.pos.z);
      const distToTargetB = Math.hypot(targetB.x - b.pos.x, targetB.z - b.pos.z);
      if (distToTargetA < 0.2 && distToTargetB < 0.2) break;
    }

    // 1. Separation guarantee: Minimum center-to-center distance must never violate safe body buffer
    expect(minRecordedDist).toBeGreaterThanOrEqual(0.48);

    // 2. Dynamic sidestepping: Both avatars must exhibit noticeable lateral evasion rather than walking straight
    expect(maxLateralDeviationA).toBeGreaterThan(0.15);
    expect(maxLateralDeviationB).toBeGreaterThan(0.15);

    // 3. Goal arrival: Both avatars successfully reach their target destinations
    expect(Math.hypot(targetA.x - a.pos.x, targetA.z - a.pos.z)).toBeLessThan(0.3);
    expect(Math.hypot(targetB.x - b.pos.x, targetB.z - b.pos.z)).toBeLessThan(0.3);
  });

  test("Stationary Obstacle Avoidance: Walker weaves around seated devotee without displacing them", () => {
    // Walker starts at (0, 0) moving to (0, 8)
    const walker = createAvatar(1, 0, 0, { walking: true });
    // Seated devotee on cushion at (0, 4) - directly blocking straight-line path
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

    // 1. Minimum distance maintained away from seated person
    expect(minRecordedDist).toBeGreaterThanOrEqual(0.48);

    // 2. Walker effectively diverted sideways to weave around
    expect(maxLateralOffset).toBeGreaterThan(0.25);

    // 3. Static seated worshipper remained firmly rooted on their cushion
    expect(seated.pos.x).toBe(initialSeatedPos.x);
    expect(seated.pos.z).toBe(initialSeatedPos.z);

    // 4. Walker completed their journey to the destination
    expect(Math.hypot(target.x - walker.pos.x, target.z - walker.pos.z)).toBeLessThan(0.3);
  });

  test("Queueing & Following: Follower maintains respectful distance behind stopped leader", () => {
    // Leader stops at z=4
    const leader = createAvatar(1, 0, 4, { walking: false, waiting: true });
    // Follower walks from z=0 towards z=8
    const follower = createAvatar(2, 0, 0, { walking: true });

    const target = { x: 0, z: 8 };
    // Flanks are blocked by walls or fellow worshippers at x = -0.5 and x = +0.5
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

    // Follower queued up behind leader and stopped without penetrating their back
    expect(minRecordedDist).toBeGreaterThanOrEqual(0.48);
    // Follower stayed behind leader (z <= leader.z)
    expect(follower.pos.z).toBeLessThanOrEqual(leader.pos.z);
  });
});
