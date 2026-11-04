import { describe, it, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import CrowdNav from '../public/js/crowdNav.js';

describe('Avatar Incense Departure Diagnosis: Persons Leaving Hall Must Never Hold Incense (Seam: walkOut & Ritual Lifecycle)', () => {
  const temple3dPath = path.resolve(import.meta.dir, '../public/js/temple3d.js');
  const code = fs.readFileSync(temple3dPath, 'utf-8');

  it('Scenario 1: walkOut(a) must immediately clear incense sticks, handPose, and ritual state when evicted while holding incense', () => {
    // Extract walkOut logic from temple3d.js
    const walkOutMatch = code.match(/function walkOut\(a\)\s*\{([\s\S]*?)\n\}/);
    expect(walkOutMatch).not.toBeNull();

    // Prepare an avatar currently in the middle of incense ritual holding 2 burning sticks
    const mockAvatar = {
      idx: 1,
      name: 'Thí Chủ Test',
      active: true,
      leaving: false,
      member: true,
      seat: 5,
      atSeat: -1,
      kneel: 0,
      pos: { x: 0, y: 0, z: -8.85 },
      sticks: 2,
      stickFlare: 1.2,
      heroStage: 'raise',
      bowSpot: 1,
      handPose: 'forehead',
      goldTrail: true
    };

    let scriptExecuted = null;
    const runScriptMock = (av, steps) => { scriptExecuted = steps; };
    const exitStepsMock = (spd) => [{ type: 'exit' }];
    const kneelStepMock = () => ({ type: 'kneel' });
    const moveStepMock = () => ({ type: 'move' });
    const LANE_X = 1.35;
    const WALK_SPEED = 1.9;
    const DOOR_IN = { z: 4.8 };
    const HALL_FRONT = 6.0;

    // Create a sandboxed execution of walkOut from temple3d.js
    const walkOutFn = new Function(
      'a',
      'runScript',
      'exitSteps',
      'kneelStep',
      'moveStep',
      'turnStep',
      'pathFromSeat',
      'ensureTag',
      'LANE_X',
      'WALK_SPEED',
      'DOOR_IN',
      'HALL_FRONT',
      'THREE',
      'CrowdNav',
      walkOutMatch[1]
    );

    walkOutFn(
      mockAvatar,
      runScriptMock,
      exitStepsMock,
      kneelStepMock,
      moveStepMock,
      () => ({ type: 'turn' }),
      () => [{ type: 'pathFromSeat' }],
      () => {},
      LANE_X,
      WALK_SPEED,
      DOOR_IN,
      HALL_FRONT,
      { Vector3: class { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } } },
      CrowdNav
    );

    expect(mockAvatar.leaving).toBe(true);
    // BUG ASSERTION: An avatar walking out must NEVER continue holding incense
    expect(mockAvatar.sticks).toBe(0);
    expect(mockAvatar.handPose).toBeNull();
    expect(mockAvatar.bowSpot).toBe(-1);
    expect(mockAvatar.heroStage).toBe('');
  });

  it('Scenario 2: exitSteps / departure must ensure sticks are dropped and ritual state cleaned before walking towards exit', () => {
    // exitSteps or afterGuestRitual in temple3d.js must guarantee sticks = 0
    expect(code).toMatch(/walkOut[\s\S]*?(?:cleanupAvatarRitual|sticks\s*=\s*0)/);
    expect(code).toMatch(/exitSteps[\s\S]*?(?:sticks\s*=\s*0|cleanupAvatarRitual|handPose\s*=\s*null)/);
  });

  it('Scenario 3: updateAvatars rendering loop must guard heldIncense against avatars who are leaving or walking back', () => {
    // In updateAvatars: heldIncense must not render for avatars that are leaving (a.leaving) or turning back (a.heroStage === 'back')
    expect(code).toMatch(/if\s*\(\s*a\.sticks\s*>\s*0\s*&&[^)]*!a\.leaving/);
  });
});
