import { describe, it, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

describe('Actor Movement & Visible Walking Legs/Feet Diagnosis (Seam: Avatar Rig & Animation)', () => {
  const temple3dPath = path.resolve(import.meta.dir, '../public/js/temple3d.js');
  const code = fs.readFileSync(temple3dPath, 'utf-8');

  it('Avatar rig must define visible leg/shin geometry or exposed stepping limb parts', () => {
    // Avatar rig must include leg segments (cẳng chân / đùi / ống quần) in partGeos and PAIRED.
    expect(code).toMatch(/leg:\s*mergeColored\(/);
    expect(code).toMatch(/PAIRED\s*=\s*\{[^}]*leg:\s*true[^}]*\}/);
  });

  it('Walking step animation must visibly protrude feet and legs with authentic stride amplitude', () => {
    // Skirt lathe radius at bottom is ~0.24m.
    // Stride amplitude must be increased (>= 0.15m) and skirt profile refined so feet step clearly.
    expect(code).toMatch(/stepZ\s*=\s*[^;]*step\s*\*\s*0\.(?:1[5-9]|[2-9]\d)/);
  });

  it('Robe hem (gấu áo tràng) must be proportioned to reveal feet and stepping motion during walk', () => {
    // The design must NOT "che hoàn toàn chân". It must allow visible stepping feet and movement.
    expect(code).not.toMatch(/che hoàn toàn chân/i);
    expect(code).toMatch(/lộ\s*(?:cẳng\s*chân|bước\s*chân|bàn\s*chân)/i);
  });

  it('Standing avatar must keep feet planted and visible rather than scaling down to zero', () => {
    // Feet must remain visible at scale 1.0 when standing still (kc = 0, w = 0).
    expect(code).not.toMatch(/Math\.min\(1,\s*w\s*\*\s*1\.4\)\s*\*\s*\(1\s*-\s*kc\)/);
  });
});
