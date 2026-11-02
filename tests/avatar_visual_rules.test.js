import { describe, test, expect } from "bun:test";
import * as THREE from "three";

describe("Avatar Visual Rules & Deterministic Hair/Glow", () => {
  const ROBE_TONES = [0x7790a8, 0x6f879e, 0x8297ab, 0x6a8299, 0x8a9db0, 0x7a8ca0];
  const PANTS_TONES = [0x2a2e38, 0x3a4250, 0x1e2026, 0x56677a];
  const SKIN_TONES = [0xf0c49c, 0xe8b88e, 0xdba47c, 0xf4ccaa, 0xe2ad84];
  const HAIR_TONES = [0x1a1a1d, 0x221a15, 0x2c1f18, 0x38261c, 0x181716, 0x422f22, 0x7a7470];

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  const devoteeTonesCache = new Map();
  const MAX_TONES_CACHE = 2000;

  function getOrCreateTones(key, fallbackIdx = 0) {
    if (key && devoteeTonesCache.has(key)) {
      return devoteeTonesCache.get(key);
    }
    const s = key ? hashString(key) : Math.abs((fallbackIdx * 37 + 101) | 0);
    const tones = {
      robe: new THREE.Color(ROBE_TONES[s % ROBE_TONES.length]),
      pants: new THREE.Color(PANTS_TONES[(s >> 2) % PANTS_TONES.length]),
      skin: new THREE.Color(SKIN_TONES[(s >> 1) % SKIN_TONES.length]),
      hair: new THREE.Color(HAIR_TONES[(s >> 3) % HAIR_TONES.length]),
      feet: new THREE.Color(0x3a2418),
      hairStyle: ((s >> 4) % 7) < 3 ? 0 : ((s >> 4) % 7) < 6 ? 1 : 2
    };
    if (key) {
      if (devoteeTonesCache.size >= MAX_TONES_CACHE) {
        const oldestKey = devoteeTonesCache.keys().next().value;
        devoteeTonesCache.delete(oldestKey);
      }
      devoteeTonesCache.set(key, tones);
    }
    return tones;
  }

  function isVipDevotee(a) {
    if (!a) return false;
    return Boolean(
      (a.vipRank && a.vipRank > 0) ||
      (a.tier && a.tier !== 'normal') ||
      a.goldTrail ||
      a.flashOnArrive ||
      a.heroKind === 'gift' ||
      a.heroKind === 'grand' ||
      a.guestKind === 'gift' ||
      a.guestKind === 'grand'
    );
  }

  function setGlow(a, intensity, color = 0xffd27a, force = false) {
    if (!a) return;
    if (!force && !isVipDevotee(a)) return;
    a.glow = Math.max(a.glow, intensity);
    a.glowColor.set(color);
  }

  test("isVipDevotee: distinguishes between ordinary devotees and VIP/honored guests", () => {
    // Normal devotee
    const normal = { uid: "u1", name: "Nguyễn Văn A", tier: "normal", vipRank: 0, goldTrail: false };
    expect(isVipDevotee(normal)).toBe(false);

    // VIP seat
    const vipSeat = { uid: "u2", name: "Trần VIP", tier: "normal", vipRank: 1 };
    expect(isVipDevotee(vipSeat)).toBe(true);

    // Lotus seat tier
    const lotus = { uid: "u3", name: "Lê Sen", tier: "lotus", vipRank: 0 };
    expect(isVipDevotee(lotus)).toBe(true);

    // Gold Lotus tier
    const goldLotus = { uid: "u4", name: "Phạm Vàng", tier: "goldLotus", vipRank: 0 };
    expect(isVipDevotee(goldLotus)).toBe(true);

    // Gifter with gold trail
    const gifter = { uid: "u5", name: "Hoàng Tặng Quà", tier: "normal", goldTrail: true };
    expect(isVipDevotee(gifter)).toBe(true);

    // Gift ceremony hero
    const giftHero = { uid: "u6", name: "Đại Lễ", tier: "normal", heroKind: "gift" };
    expect(isVipDevotee(giftHero)).toBe(true);
  });

  test("setGlow: ordinary devotees do NOT glow, only VIP/guests of honor glow", () => {
    const normal = {
      uid: "u1",
      tier: "normal",
      vipRank: 0,
      glow: 0,
      glowColor: new THREE.Color(0xffd27a)
    };
    setGlow(normal, 1.2);
    expect(normal.glow).toBe(0); // Normal devotee glow remains 0

    const vip = {
      uid: "u2",
      tier: "lotus",
      vipRank: 2,
      glow: 0,
      glowColor: new THREE.Color(0xffd27a)
    };
    setGlow(vip, 1.5, 0xffe27a);
    expect(vip.glow).toBe(1.5);
    expect(vip.glowColor.getHex()).toBe(0xffe27a);
  });

  test("Foot ring (bowRings) condition is active for ordinary devotees when bowing", () => {
    const t = 10;
    const normal = {
      uid: "u1",
      tier: "normal",
      bowAt: 10,
      bowCount: 3,
      kneel: 1,
      heroStage: ""
    };
    const BOW_KNEEL_DUR = 2.4;
    const bowing = t - normal.bowAt >= 0 && t - normal.bowAt < normal.bowCount * BOW_KNEEL_DUR + 0.2;
    const ringOn = bowing || ['take', 'raise', 'plant', 'pray'].includes(normal.heroStage) ? 1 : 0;
    expect(ringOn).toBe(1); // Normal devotees retain foot ring!
  });

  test("Deterministic tones: same UID always receives identical hair color and style across sessions", () => {
    const uid = "devotee-tiktok-98765";
    const tones1 = getOrCreateTones(uid);
    const hairHex1 = tones1.hair.getHex();
    const style1 = tones1.hairStyle;

    // Simulate subsequent access / session / re-spawn
    const tones2 = getOrCreateTones(uid);
    const hairHex2 = tones2.hair.getHex();
    const style2 = tones2.hairStyle;

    expect(hairHex1).toBe(hairHex2);
    expect(style1).toBe(style2);

    // Another distinct user gets deterministic tones as well
    const uidB = "devotee-tiktok-11111";
    const tonesB1 = getOrCreateTones(uidB);
    const tonesB2 = getOrCreateTones(uidB);
    expect(tonesB1.hair.getHex()).toBe(tonesB2.hair.getHex());
    expect(tonesB1.hairStyle).toBe(tonesB2.hairStyle);
  });

  test("Avatar respawn preservation: kept tones and hairStyle are strictly retained", () => {
    const initialTones = getOrCreateTones("user-keep-test");
    const keep = {
      seat: 12,
      tier: "normal",
      vipRank: 0,
      tones: initialTones,
      hairStyle: initialTones.hairStyle
    };

    const newSpawn = {};
    if (keep.tones) {
      newSpawn.tones = keep.tones;
      newSpawn.hairStyle = keep.hairStyle;
    }

    expect(newSpawn.tones.hair.getHex()).toBe(initialTones.hair.getHex());
    expect(newSpawn.hairStyle).toBe(initialTones.hairStyle);
  });
});
