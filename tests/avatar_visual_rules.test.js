import { describe, test, expect } from "bun:test";
import * as THREE from "three";
import AvatarRules from "../public/js/avatarRules.js";

const {
  ROBE_TONES,
  HAIR_TONES,
  hashString,
  getOrCreateTones,
  assignTones,
  isVipDevotee,
  setGlow,
  isBowRingActive,
  newAvatar,
  spawnAvatar
} = AvatarRules;

describe("Avatar Visual Rules & Deterministic Hair/Glow (Production AvatarRules)", () => {
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

  test("setGlow: ordinary devotees do NOT glow, only VIP/guests of honor glow, setting both glow and glowTarget", () => {
    const normal = {
      uid: "u1",
      tier: "normal",
      vipRank: 0,
      glow: 0,
      glowTarget: 0,
      glowColor: new THREE.Color(0xffd27a)
    };
    setGlow(normal, 1.2);
    expect(normal.glow).toBe(0);
    expect(normal.glowTarget).toBe(0);

    const vip = {
      uid: "u2",
      tier: "lotus",
      vipRank: 2,
      glow: 0,
      glowTarget: 0,
      glowColor: new THREE.Color(0xffd27a)
    };
    setGlow(vip, 1.5, 0xffe27a);
    expect(vip.glow).toBe(1.5);
    expect(vip.glowTarget).toBe(1.5);
    expect(vip.glowColor.getHex()).toBe(0xffe27a);

    // Force override cho phép kích hoạt khi có chỉ định đặc biệt (flashOnArrive)
    setGlow(normal, 1.8, 0xffe27a, true);
    expect(normal.glow).toBe(1.8);
    expect(normal.glowTarget).toBe(1.8);
  });

  test("Foot ring (isBowRingActive) is active for ordinary devotees when bowing and off when finished", () => {
    const normal = {
      uid: "u1",
      tier: "normal",
      bowAt: 10,
      bowCount: 3,
      kneel: 1,
      heroStage: ""
    };
    // Khi đang lạy (t = 11s): vòng sáng chân bật
    expect(isBowRingActive(normal, 11)).toBe(1);

    // Khi đã lạy xong (t = 20s): vòng sáng chân tắt
    expect(isBowRingActive(normal, 20)).toBe(0);

    // Hero trong nghi lễ
    const heroDevotee = { heroStage: "pray" };
    expect(isBowRingActive(heroDevotee, 10)).toBe(1);
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

  test("Avatar slot recycling: slot reuse for different UID derives new tones; same UID retains tones", () => {
    // 1. Initial spawn with UID 'alice'
    const slot = newAvatar(1);
    spawnAvatar(slot, {
      uid: "alice",
      name: "Alice",
      member: true,
      at: { x: 0, y: 0, z: 0, copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; } }
    });

    // 2. Slot is recycled for 'charlie', passing keep: slot (which has alice's state)
    spawnAvatar(slot, {
      uid: "charlie",
      name: "Charlie",
      member: true,
      at: { x: 0, y: 0, z: 0, copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; } },
      keep: slot
    });

    const charlieExpectedTones = getOrCreateTones("charlie");
    expect(slot.uid).toBe("charlie");
    // Charlie receives Charlie's tones, NOT Alice's tones!
    expect(slot.tones.hair.getHex()).toBe(charlieExpectedTones.hair.getHex());
    expect(slot.tones.robe.getHex()).toBe(charlieExpectedTones.robe.getHex());

    // 3. Same UID respawn retains tones
    const prevHair = slot.tones.hair.getHex();
    spawnAvatar(slot, {
      uid: "charlie",
      name: "Charlie",
      member: true,
      at: { x: 0, y: 0, z: 0, copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; } },
      keep: slot
    });
    expect(slot.tones.hair.getHex()).toBe(prevHair);
  });
});
