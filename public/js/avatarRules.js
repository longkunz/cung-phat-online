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

  const HAND_POSES = {
    rest: [0.12, 0.45, 0.05],
    pray: [0.08, 0.62, 0.22]
  };

  class SimpleColor {
    constructor(hex = 0xffffff) {
      this.setHex(hex);
    }
    setHex(hex) {
      this.hex = hex;
      this.r = ((hex >> 16) & 255) / 255;
      this.g = ((hex >> 8) & 255) / 255;
      this.b = (hex & 255) / 255;
      return this;
    }
    clone() {
      return new SimpleColor(this.hex);
    }
    copy(c) {
      if (c && c.hex !== undefined) {
        this.setHex(c.hex);
      } else if (c && typeof c.getHex === 'function') {
        this.setHex(c.getHex());
      } else if (c && c.r !== undefined) {
        this.r = c.r;
        this.g = c.g;
        this.b = c.b;
        this.hex = ((Math.round(c.r * 255) << 16) | (Math.round(c.g * 255) << 8) | Math.round(c.b * 255)) >>> 0;
      }
      return this;
    }
    getHex() {
      return this.hex;
    }
    getHexString() {
      return this.hex.toString(16).padStart(6, '0');
    }
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
    a.glowTarget = intensity;
    a.glowColor = color;
  }

  function newAvatar(idx = 0) {
    const ColorClass = getColorClass();
    return {
      idx,
      active: false,
      uid: '',
      name: '',
      member: false,
      pos: { x: 0, y: 0, z: 0, copy(p) { this.x = p.x; this.y = p.y; this.z = p.z; return this; } },
      yaw: 0,
      pitch: 0,
      scale: 1,
      scaleTarget: 1,
      fade: false,
      kneel: 0,
      kneelTarget: 0,
      hands: [
        { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } },
        { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
      ],
      handPose: null,
      tones: {
        robe: new ColorClass(ROBE_TONES[0]),
        pants: new ColorClass(PANTS_TONES[0]),
        skin: new ColorClass(SKIN_TONES[0]),
        hair: new ColorClass(HAIR_TONES[0]),
        feet: new ColorClass(0x3a2418)
      },
      hairStyle: 0,
      glow: 0,
      glowTarget: 0,
      glowColor: 0xffd27a,
      heroStage: '',
      heroKind: '',
      heroSide: 1,
      guestKind: '',
      walking: false,
      waiting: false,
      entering: false,
      leaving: false,
      seat: -1,
      atSeat: -1,
      vipRank: 0,
      tier: 'normal',
      goldTrail: false,
      anon: false
    };
  }

  function spawnAvatar(a, { uid, name, member, at, yaw = 0, kneel = 0, pop = false, keep = null, anon = false }, hooks = {}) {
    // Chỉ giữ lại trạng thái chỗ ngồi và nghi lễ khi tái sử dụng slot, TUYỆT ĐỐI KHÔNG kế thừa màu tóc cũ
    const kept = keep ? {
      seat: keep.seat,
      tier: keep.tier,
      vipRank: keep.vipRank,
      flashOnArrive: keep.flashOnArrive
    } : {};

    const fresh = newAvatar(a.idx !== undefined ? a.idx : 0);
    Object.assign(a, fresh, a.tag ? { tag: a.tag } : {}, kept);
    a.active = true;
    a.uid = uid;
    a.name = name || 'Thí Chủ';
    a.member = Boolean(member);
    if (at) {
      if (a.pos && typeof a.pos.copy === 'function') a.pos.copy(at);
      else a.pos = { x: at.x || 0, y: at.y || 0, z: at.z || 0 };
    }
    a.yaw = yaw;
    a.kneel = kneel;
    if (kneel > 0.5 && a.hands && a.hands[0] && a.hands[1]) {
      a.hands[0].set(-HAND_POSES.pray[0], HAND_POSES.pray[1], HAND_POSES.pray[2]);
      a.hands[1].set(HAND_POSES.pray[0], HAND_POSES.pray[1], HAND_POSES.pray[2]);
    }
    a.scale = pop ? 0.01 : 1;
    a.popAt = pop ? (hooks.elapsed !== undefined ? hooks.elapsed : 0) : -10;
    a.dodgePref = (a.idx % 2 === 0 ? 1 : -1) * (Math.random() < 0.25 ? -1 : 1);
    a.speedMult = 1.0;

    // Luôn xác định màu diện mạo theo danh tính UID mới (Deterministic Tones)
    assignTones(a);

    a.anon = Boolean(anon);
    if (anon) {
      if (a.tag && a.tag.el) {
        a.tag.el.style.display = 'none';
        a.tag.shown = false;
      }
    } else if (hooks.ensureTag) {
      hooks.ensureTag(a);
    }
    if (hooks.touch) {
      hooks.touch(a);
    }
    return a;
  }

  return {
    ROBE_TONES,
    PANTS_TONES,
    SKIN_TONES,
    HAIR_TONES,
    HAND_POSES,
    SimpleColor,
    getColorClass,
    hashString,
    devoteeTonesCache,
    MAX_TONES_CACHE,
    getOrCreateTones,
    assignTones,
    isVipDevotee,
    setGlow,
    newAvatar,
    spawnAvatar
  };
});
