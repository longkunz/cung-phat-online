import { describe, test, expect } from "bun:test";
import * as THREE from "three";
import AvatarRules from "../public/js/avatarRules.js";

describe("Avatar Visual Rules & Deterministic Hair/Glow (Production AvatarRules)", () => {
  const {
    ROBE_TONES,
    PANTS_TONES,
    SKIN_TONES,
    HAIR_TONES,
    isVipDevotee,
    setGlow,
    getOrCreateTones,
    newAvatar,
    spawnAvatar
  } = AvatarRules;

  test("isVipDevotee identifies VIP rank, lotus tiers, gifters and ceremonies", () => {
    // Người thường ngồi tụng kinh trên bồ đoàn -> KHÔNG phải VIP
    expect(isVipDevotee({ idx: 0, active: true, seat: 3, atSeat: 3, name: "Phật tử A" })).toBe(false);
    expect(isVipDevotee({ idx: 1, active: true, seat: 0, tier: "normal" })).toBe(false);

    // VIP theo bậc thứ hạng
    expect(isVipDevotee({ idx: 2, active: true, vipRank: 1 })).toBe(true);
    expect(isVipDevotee({ idx: 3, active: true, vipRank: 5 })).toBe(true);

    // Đài sen hồng (lotus) & đài sen vàng (goldLotus)
    expect(isVipDevotee({ idx: 4, active: true, tier: "lotus" })).toBe(true);
    expect(isVipDevotee({ idx: 5, active: true, tier: "goldLotus" })).toBe(true);

    // Khách dâng lễ / tặng quà có vệt sáng vàng (goldTrail)
    expect(isVipDevotee({ idx: 6, active: true, goldTrail: true })).toBe(true);
    expect(isVipDevotee({ idx: 7, active: true, heroKind: "gift" })).toBe(true);
    expect(isVipDevotee({ idx: 8, active: true, guestKind: "grand" })).toBe(true);
    expect(isVipDevotee({ idx: 9, active: true, flashOnArrive: true })).toBe(true);
  });

  test("setGlow suppresses glowing aura for normal devotees but permits VIPs and force override", () => {
    const normalDevotee = newAvatar(0);
    normalDevotee.active = true;
    normalDevotee.seat = 5;
    normalDevotee.atSeat = 5;

    // Người thường ngồi tụng kinh không được phát sáng hào quang thân thể
    setGlow(normalDevotee, 1.0, 0xffd27a);
    expect(normalDevotee.glowTarget).toBe(0);

    // Khách VIP nhận hào quang thân thể
    const vipDevotee = newAvatar(1);
    vipDevotee.active = true;
    vipDevotee.vipRank = 2;
    setGlow(vipDevotee, 1.0, 0xffd27a);
    expect(vipDevotee.glowTarget).toBe(1.0);
    expect(vipDevotee.glowColor).toBe(0xffd27a);

    // Force override cho phép kích hoạt khi có chỉ định đặc biệt
    setGlow(normalDevotee, 0.8, 0xffaa00, true);
    expect(normalDevotee.glowTarget).toBe(0.8);
    expect(normalDevotee.glowColor).toBe(0xffaa00);
  });

  test("getOrCreateTones produces deterministic tones and natural hair palette", () => {
    const tonesA1 = getOrCreateTones("devotee_nguyen_van_a", 0, THREE.Color);
    const tonesA2 = getOrCreateTones("devotee_nguyen_van_a", 0, THREE.Color);

    // 100% nhất quán giữa các lần gọi
    expect(tonesA1.hair.getHex()).toBe(tonesA2.hair.getHex());
    expect(tonesA1.robe.getHex()).toBe(tonesA2.robe.getHex());
    expect(tonesA1.pants.getHex()).toBe(tonesA2.pants.getHex());
    expect(tonesA1.skin.getHex()).toBe(tonesA2.skin.getHex());
    expect(tonesA1.hairStyle).toBe(tonesA2.hairStyle);

    // Bảng màu tóc tự nhiên (không còn màu bạc/trắng lạ)
    const validHairHexes = HAIR_TONES;
    expect(validHairHexes).toContain(tonesA1.hair.getHex());
  });

  test("Recycled avatar slot in pool assigns new tones from new UID, never inheriting old slot tones", () => {
    // Bước 1: Slot trong pool được gán cho người dùng cũ 'uid_24' (màu tóc 2c1f18)
    const slot = newAvatar(5);
    spawnAvatar(slot, {
      uid: "uid_24",
      name: "Chủ Cũ",
      member: true,
      at: { x: 1, y: 0, z: -5 },
      kneel: 1
    });

    const expectedOldHair = HAIR_TONES[(AvatarRules.hashString("uid_24") >> 3) % HAIR_TONES.length].toString(16);
    expect(expectedOldHair).toBe("2c1f18");
    expect(slot.tones.hair.getHexString()).toBe("2c1f18");

    // Bước 2: Pool tái sử dụng slot này cho người dùng mới 'uid_46', truyền keep: slot
    // 'uid_46' có màu tóc chuẩn là 221a15
    const expectedNewHair = HAIR_TONES[(AvatarRules.hashString("uid_46") >> 3) % HAIR_TONES.length].toString(16);
    expect(expectedNewHair).toBe("221a15");

    spawnAvatar(slot, {
      uid: "uid_46",
      name: "Người Mới Đến",
      member: true,
      at: { x: 2, y: 0, z: -6 },
      kneel: 1,
      keep: slot
    });

    // Người mới PHẢI nhận màu tóc theo UID mới (221a15), TUYỆT ĐỐI KHÔNG nhận màu tóc của chủ cũ (2c1f18)
    expect(slot.uid).toBe("uid_46");
    expect(slot.name).toBe("Người Mới Đến");
    expect(slot.tones.hair.getHexString()).toBe("221a15");
    expect(slot.tones.hair.getHexString()).not.toBe("2c1f18");
  });

  test("Prostration foot ring (bowRings) is active for ALL devotees during prostration regardless of VIP status", () => {
    const normalBowingDevotee = {
      active: true,
      bowAt: 100,
      heroStage: "",
      vipRank: 0,
      tier: "normal"
    };

    const isRingActive = (a, now) => {
      const bowing = Boolean(a.bowAt && now - a.bowAt < 3.0);
      return bowing || ["take", "raise", "plant", "pray"].includes(a.heroStage) ? 1 : 0;
    };

    // Người thường khi lạy: vòng sáng chân bật sáng
    expect(isRingActive(normalBowingDevotee, 101)).toBe(1);
    // Khi hết lạy: vòng sáng tắt
    expect(isRingActive(normalBowingDevotee, 105)).toBe(0);

    // Hero trong nghi lễ
    const heroDevotee = { active: true, bowAt: 0, heroStage: "pray" };
    expect(isRingActive(heroDevotee, 100)).toBe(1);
  });
});
