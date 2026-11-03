/**
 * avatarRules.js — Quy chuẩn hiển thị Phật tử Chùa Thiên Mụ 3D
 * - Quản lý màu diện mạo cố định theo danh tính (Deterministic Tones & Hair)
 * - Giới hạn hiệu ứng hào quang phát sáng (Aura Glow) cho khách VIP / nghi lễ
 * - Bảo tồn vòng hào quang dưới chân (Foot Bow Ring) cho mọi Phật tử khi đảnh lễ
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AvatarRules = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const ROBE_TONES = [0x7790a8, 0x6f879e, 0x8297ab, 0x6a8299, 0x8a9db0, 0x7a8ca0];
  const PANTS_TONES = [0x2a2e38, 0x3a4250, 0x1e2026, 0x56677a];
  const SKIN_TONES = [0xf0c49c, 0xe8b88e, 0xdba47c, 0xf4ccaa, 0xe2ad84];
  const HAIR_TONES = [0x1a1a1d, 0x221a15, 0x2c1f18, 0x38261c, 0x181716, 0x422f22, 0x7a7470];

  const BOW_KNEEL_DUR = 1.45;
  const BOW_STAND_DUR = 0.95;

  const HAND_POSES = {
    rest: [0.12, 0.45, 0.05],
    pray: [0.08, 0.62, 0.22]
  };

  class SimpleVec3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    copy(v) {
      if (!v) return this;
      this.x = v.x || 0;
      this.y = v.y || 0;
      this.z = v.z || 0;
      return this;
    }
    clone() {
      return new SimpleVec3(this.x, this.y, this.z);
    }
  }

  class SimpleColor {
    constructor(hex = 0xffffff) {
      this.hex = hex;
    }
    set(hex) {
      this.hex = hex;
      return this;
    }
    setHex(hex) {
      this.hex = hex;
      return this;
    }
    getHex() {
      return this.hex;
    }
    getHexString() {
      return this.hex.toString(16).padStart(6, '0');
    }
    clone() {
      return new SimpleColor(this.hex);
    }
    copy(c) {
      if (c && c.hex !== undefined) {
        this.hex = c.hex;
      } else if (c && typeof c.getHex === 'function') {
        this.hex = c.getHex();
      }
      return this;
    }
  }

  function getVec3Class() {
    if (typeof THREE !== 'undefined' && THREE.Vector3) {
      return THREE.Vector3;
    }
    return SimpleVec3;
  }

  function getColorClass() {
    if (typeof THREE !== 'undefined' && THREE.Color) {
      return THREE.Color;
    }
    return SimpleColor;
  }

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  const devoteeTonesCache = new Map();
  const MAX_TONES_CACHE = 2000;

  function clearTonesCache() {
    devoteeTonesCache.clear();
  }

  function getOrCreateTones(key, fallbackIdx = 0, ColorClass = getColorClass()) {
    if (key && devoteeTonesCache.has(key)) {
      return devoteeTonesCache.get(key);
    }
    const s = key ? hashString(key) : Math.abs((fallbackIdx * 37 + 101) | 0);
    const tones = {
      robe: new ColorClass(ROBE_TONES[s % ROBE_TONES.length]),
      pants: new ColorClass(PANTS_TONES[(s >> 2) % PANTS_TONES.length]),
      skin: new ColorClass(SKIN_TONES[(s >> 1) % SKIN_TONES.length]),
      hair: new ColorClass(HAIR_TONES[(s >> 3) % HAIR_TONES.length]),
      feet: new ColorClass(0x3a2418),
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

  function assignTones(a, ColorClass = getColorClass()) {
    if (!a) return;
    const key = a.uid || (a.name && a.name !== 'Thí Chủ' ? a.name : '');
    const toneData = getOrCreateTones(key, a.idx !== undefined ? a.idx : 0, ColorClass);
    a.tones = {
      robe: toneData.robe.clone ? toneData.robe.clone() : new ColorClass(toneData.robe.getHex ? toneData.robe.getHex() : toneData.robe.hex),
      pants: toneData.pants.clone ? toneData.pants.clone() : new ColorClass(toneData.pants.getHex ? toneData.pants.getHex() : toneData.pants.hex),
      skin: toneData.skin.clone ? toneData.skin.clone() : new ColorClass(toneData.skin.getHex ? toneData.skin.getHex() : toneData.skin.hex),
      hair: toneData.hair.clone ? toneData.hair.clone() : new ColorClass(toneData.hair.getHex ? toneData.hair.getHex() : toneData.hair.hex),
      feet: toneData.feet.clone ? toneData.feet.clone() : new ColorClass(toneData.feet.getHex ? toneData.feet.getHex() : toneData.feet.hex)
    };
    a.hairStyle = toneData.hairStyle;
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
    a.glow = Math.max(a.glow || 0, intensity);
    a.glowTarget = intensity;
    if (a.glowColor) {
      if (typeof a.glowColor.set === 'function') a.glowColor.set(color);
      else if (typeof a.glowColor.setHex === 'function') a.glowColor.setHex(color);
      else a.glowColor = color;
    } else {
      a.glowColor = color;
    }
  }

  function isBowRingActive(a, t = 0) {
    if (!a) return 0;
    const count = a.bowCount || 1;
    const durPerBow = a.kneel > 0.9 ? BOW_KNEEL_DUR : BOW_STAND_DUR;
    const bowing = a.bowAt !== undefined && a.bowAt >= 0 && (t - a.bowAt >= 0) && (t - a.bowAt < count * durPerBow + 0.2);
    const heroRing = a.heroStage && ['take', 'raise', 'plant', 'pray'].includes(a.heroStage);
    return (bowing || heroRing) ? 1 : 0;
  }

  function newAvatar(i) {
    const Vec3 = getVec3Class();
    const ColorClass = getColorClass();

    return {
      idx: i,
      active: false,
      uid: '',
      name: '',
      seat: -1,
      member: false,
      pos: new Vec3(),
      yaw: 0,
      scale: 0,
      scaleTarget: 1,
      fade: false,
      kneel: 0,
      walk: 0,
      walking: false,
      phase: 0,
      pray: 0,
      bowAt: -10,
      bowCount: 0,
      nodAt: -10,
      chantUntil: -10,
      glow: 0,
      glowTarget: 0,
      glowColor: new ColorClass(0xffd27a),
      script: null,
      busy: false,
      leaving: false,
      tag: null,
      lastActive: 0,
      bobY: 0,
      tones: null,
      head: new Vec3(),
      tier: 'normal',
      vipRank: 0,
      waiting: false,
      waitSpot: -1,
      atSeat: -1,
      bowSpot: -1,
      flashOnArrive: false,
      entering: false,
      guestKind: '',
      heroStage: '',
      heroKind: '',
      heroSide: 1,
      hairStyle: 0,
      handPose: null,
      lastPose: null,
      hands: [new Vec3(-0.27, 0.04, 0), new Vec3(0.27, 0.04, 0)],
      torsoS: 0,
      headS: 0,
      swayS: 0,
      sticks: 0,
      stickFlare: 0,
      goldTrail: false,
      ringS: 0,
      anon: false
    };
  }

  function spawnAvatar(a, { uid, name, member, at, yaw = 0, kneel = 0, pop = false, keep = null, anon = false }, helpers = {}) {
    const isSameDevotee = Boolean(keep && keep.uid === uid);
    const kept = keep ? {
      tones: isSameDevotee ? keep.tones : undefined,
      hairStyle: isSameDevotee ? keep.hairStyle : undefined,
      seat: keep.seat,
      tier: keep.tier,
      vipRank: keep.vipRank,
      flashOnArrive: keep.flashOnArrive
    } : {};
    Object.assign(a, newAvatar(a.idx), { tag: a.tag }, kept);
    a.active = true;
    a.uid = uid;
    a.name = name || 'Thí Chủ';
    a.member = member;
    if (at) {
      if (a.pos && typeof a.pos.copy === 'function') a.pos.copy(at);
      else a.pos = { x: at.x || 0, y: at.y || 0, z: at.z || 0, copy(p) { this.x = p.x; this.y = p.y; this.z = p.z; return this; } };
    }
    a.yaw = yaw;
    a.kneel = kneel;
    if (kneel > 0.5 && a.hands) {
      a.hands[0].set(-HAND_POSES.pray[0], HAND_POSES.pray[1], HAND_POSES.pray[2]);
      a.hands[1].set(HAND_POSES.pray[0], HAND_POSES.pray[1], HAND_POSES.pray[2]);
    }
    a.scale = pop ? 0.01 : 1;
    a.popAt = pop ? (helpers.elapsed !== undefined ? helpers.elapsed : (typeof clock !== 'undefined' ? clock.elapsed : 0)) : -10;
    a.dodgePref = (a.idx % 2 === 0 ? 1 : -1) * (Math.random() < 0.25 ? -1 : 1);
    a.speedMult = helpers.speedMult !== undefined ? helpers.speedMult : (typeof rand === 'function' ? rand(0.92, 1.08) : 1.0);

    // Luôn tính và gán màu diện mạo theo danh tính UID mới nếu không phải cùng 1 người
    if (kept.tones) {
      a.tones = kept.tones;
      a.hairStyle = kept.hairStyle ?? a.hairStyle ?? 0;
    } else {
      assignTones(a);
    }

    a.anon = anon;
    if (anon) {
      if (a.tag) { a.tag.el.style.display = 'none'; a.tag.shown = false; }
    } else if (helpers.ensureTag) {
      helpers.ensureTag(a);
    } else if (typeof ensureTag === 'function') {
      ensureTag(a);
    }
    if (helpers.touch) helpers.touch(a);
    else if (typeof touch === 'function') touch(a);
    return a;
  }

  return {
    ROBE_TONES,
    PANTS_TONES,
    SKIN_TONES,
    HAIR_TONES,
    BOW_KNEEL_DUR,
    BOW_STAND_DUR,
    HAND_POSES,
    SimpleVec3,
    SimpleColor,
    hashString,
    devoteeTonesCache,
    clearTonesCache,
    getOrCreateTones,
    assignTones,
    isVipDevotee,
    setGlow,
    isBowRingActive,
    newAvatar,
    spawnAvatar
  };
});
