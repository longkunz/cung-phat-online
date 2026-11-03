/**
 * avatarRules.js — Quy tắc Thị giác, Danh tính và Vòng đời Avatar
 * Chùa Thiên Mụ 3D: Lọc phát sáng VIP, bảo toàn màu tóc & y áo theo danh tính, quản lý tư thế.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('three'));
  } else if (typeof define === 'function' && define.amd) {
    define(['three'], factory);
  } else {
    root.AvatarRules = factory(root.THREE);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(THREE) {
  if (!THREE && typeof globalThis !== 'undefined' && globalThis.THREE) {
    THREE = globalThis.THREE;
  }

  const ROBE_TONES = [0x7790a8, 0x6f879e, 0x8297ab, 0x6a8299, 0x8a9db0, 0x7a8ca0];
  const PANTS_TONES = [0x2a2e38, 0x3a4250, 0x1e2026, 0x56677a];
  const SKIN_TONES = [0xf0c49c, 0xe8b88e, 0xdba47c, 0xf4ccaa, 0xe2ad84];
  const HAIR_TONES = [0x1a1a1d, 0x221a15, 0x2c1f18, 0x38261c, 0x181716, 0x422f22, 0x7a7470];

  const HAND_POSES = {
    hang: [0.22, 0.02, -0.03],
    pray: [0.034, 0.2, -0.27],
    forehead: [0.04, 0.52, -0.3],
    floor: [0.3, 0.5, -0.18],
    reach: [0.07, 0.03, -0.37],
    candle: [0.05, 0.15, -0.39],
    hold: [0.04, 0.23, -0.3],
    plant: [0.05, 0.5, -0.4]
  };

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

  function getOrCreateTones(key, fallbackIdx = 0) {
    if (key && devoteeTonesCache.has(key)) {
      return devoteeTonesCache.get(key);
    }
    const s = key ? hashString(key) : Math.abs((fallbackIdx * 37 + 101) | 0);
    const ColorClass = THREE?.Color || class MockColor {
      constructor(hex) { this.hex = hex; }
      getHex() { return this.hex; }
      set(hex) { this.hex = hex; return this; }
      clone() { return new ColorClass(this.hex); }
    };

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

  function assignTones(a) {
    const key = a.uid || (a.name && a.name !== 'Thí Chủ' ? a.name : '');
    const toneData = getOrCreateTones(key, a.idx);
    a.tones = {
      robe: toneData.robe.clone(),
      pants: toneData.pants.clone(),
      skin: toneData.skin.clone(),
      hair: toneData.hair.clone(),
      feet: toneData.feet.clone()
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
    if (a.glowColor && typeof a.glowColor.set === 'function') {
      a.glowColor.set(color);
    } else if (THREE?.Color) {
      a.glowColor = new THREE.Color(color);
    }
  }

  function newAvatar(i) {
    const Vec3 = THREE?.Vector3 || class MockVec3 {
      constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
      copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
      clone() { return new Vec3(this.x, this.y, this.z); }
    };
    const ColorClass = THREE?.Color || class MockColor {
      constructor(hex) { this.hex = hex; }
      getHex() { return this.hex; }
      set(hex) { this.hex = hex; return this; }
      clone() { return new ColorClass(this.hex); }
    };

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
      anon: false
    };
  }

  function spawnAvatar(a, { uid, name, member, at, yaw = 0, kneel = 0, pop = false, keep = null, anon = false }) {
    const isSameDevotee = Boolean(keep && keep.uid === uid);
    const kept = keep ? {
      seat: keep.seat,
      tier: keep.tier,
      vipRank: keep.vipRank,
      flashOnArrive: keep.flashOnArrive,
      tones: isSameDevotee ? keep.tones : undefined,
      hairStyle: isSameDevotee ? keep.hairStyle : undefined
    } : {};
    Object.assign(a, newAvatar(a.idx), { tag: a.tag }, kept);
    a.active = true;
    a.uid = uid;
    a.name = name || 'Thí Chủ';
    a.member = member;
    if (at) a.pos.copy(at);
    a.yaw = yaw;
    a.kneel = kneel;
    if (kneel > 0.5) {
      a.hands[0].set(-HAND_POSES.pray[0], HAND_POSES.pray[1], HAND_POSES.pray[2]);
      a.hands[1].set(HAND_POSES.pray[0], HAND_POSES.pray[1], HAND_POSES.pray[2]);
    }
    a.scale = pop ? 0.01 : 1;
    a.popAt = pop ? (typeof clock !== 'undefined' ? clock.elapsed : 0) : -10;
    a.dodgePref = (a.idx % 2 === 0 ? 1 : -1) * (Math.random() < 0.25 ? -1 : 1);
    a.speedMult = typeof rand === 'function' ? rand(0.92, 1.08) : 1.0;

    if (kept.tones) {
      a.tones = kept.tones;
      a.hairStyle = kept.hairStyle ?? a.hairStyle ?? 0;
    } else {
      assignTones(a);
    }

    a.anon = anon;
    if (anon) {
      if (a.tag) { a.tag.el.style.display = 'none'; a.tag.shown = false; }
    } else if (typeof ensureTag === 'function') {
      ensureTag(a);
    }
    if (typeof touch === 'function') touch(a);
    return a;
  }

  return {
    ROBE_TONES,
    PANTS_TONES,
    SKIN_TONES,
    HAIR_TONES,
    HAND_POSES,
    hashString,
    devoteeTonesCache,
    clearTonesCache,
    getOrCreateTones,
    assignTones,
    isVipDevotee,
    setGlow,
    newAvatar,
    spawnAvatar
  };
});
