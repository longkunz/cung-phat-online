/**
 * Chùa Linh Ứng 3D — Chánh Điện low-poly + Đạo Tràng Phật tử áo lam (TikTok Live 9:16)
 *
 * - Toàn bộ hình khối dựng bằng code (không dùng file model).
 * - 40 Phật tử = 3 InstancedMesh (thân dưới, thân trên, tóc) + 1 InstancedMesh hào quang
 *   -> chỉ vài draw call dù đạo tràng đầy chỗ. Hoạt ảnh là biến đổi ma trận (không có xương).
 * - Nhãn tên / bong bóng / chữ bay là HTML, định vị bằng chiếu 3D -> 2D mỗi khung hình.
 * - Âm thanh + TTS dùng lại nguyên TempleAudioEngine (public/js/audio.js).
 * - Giao thức: temple.state, temple.event, hall.roster, hall.action, temple.viewerCount, tts.play.
 * - Hiệu năng: tối đa 30 FPS, dừng khi tab ẩn, pixelRatio 1, powerPreference 'low-power'.
 *   Tham số URL: ?obs=1 (khung sạch cho OBS), ?q=0.75 (tỉ lệ độ phân giải render), ?aa=0 (tắt khử răng cưa).
 */
import * as THREE from '/vendor/three/three.module.min.js';

const params = new URLSearchParams(window.location.search);
const OBS = params.get('obs') === '1';
if (OBS) document.body.classList.add('obs-mode');

const STAGE_W = 1080;
const STAGE_H = 1920;
const SEATS = 40;
const WALKER_SLOTS = 8;
const MAX_AVATARS = SEATS + WALKER_SLOTS;
const MAX_BUBBLES = 6;
const FRAME_MS = 1000 / 30;

// ============================================================================
// 0. KHUNG 9:16 + ÂM THANH
// ============================================================================
const stageWrapper = document.getElementById('stageWrapper');
const stageEl = document.getElementById('stage9x16');
const overlay = document.getElementById('t3dOverlay');
const canvas = document.getElementById('t3dCanvas');
let stageScale = 1;

const audio = window.TempleAudioEngine ? new window.TempleAudioEngine() : null;
window.addEventListener('pointerdown', () => audio?.ensureContext(), { once: true });
if (OBS) {
  try { audio?.ensureContext(); } catch (_) {}
}

// ============================================================================
// 1. RENDERER / SCENE / CAMERA
// ============================================================================
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: params.get('aa') !== '0',
    powerPreference: 'low-power',
    alpha: false
  });
} catch (err) {
  document.getElementById('noWebgl').hidden = false;
  throw err;
}
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = false;

function fitStage() {
  const rect = stageWrapper.getBoundingClientRect();
  stageScale = rect.width / STAGE_W || 1;
  stageEl.style.transform = `scale(${stageScale})`;
  // Độ phân giải render: OBS 1080x1920 -> đủ nét; khung xem thử nhỏ -> render nhỏ cho nhẹ máy
  const qParam = parseFloat(params.get('q'));
  const q = Number.isFinite(qParam)
    ? Math.min(1, Math.max(0.3, qParam))
    : Math.min(1, Math.max(0.5, stageScale * (window.devicePixelRatio || 1)));
  renderer.setSize(Math.round(STAGE_W * q), Math.round(STAGE_H * q), false);
}
window.addEventListener('resize', fitStage);
fitStage();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a0805);
scene.fog = new THREE.Fog(0x2a0e07, 26, 46);

const camera = new THREE.PerspectiveCamera(55, STAGE_W / STAGE_H, 0.1, 80);
const CAM_BASE = new THREE.Vector3(0, 10.4, 12.6);
const CAM_LOOK = new THREE.Vector3(0, 3.7, -8.5);
const CAM_PUSH = new THREE.Vector3(0, 8.6, 5.5);
const CAM_PUSH_LOOK = new THREE.Vector3(0, 5.4, -14);
camera.position.copy(CAM_BASE);
camera.lookAt(CAM_LOOK);

scene.add(new THREE.HemisphereLight(0xffe2b8, 0x3a1a10, 1.35));
const sun = new THREE.DirectionalLight(0xffd29a, 1.6);
sun.position.set(4, 14, 10);
scene.add(sun);
const altarLight = new THREE.PointLight(0xffb45a, 26, 22, 1.6);
altarLight.position.set(0, 4.5, -10.5);
scene.add(altarLight);

// ============================================================================
// 2. TIỆN ÍCH HÌNH KHỐI / TEXTURE
// ============================================================================
function canvasTexture(w, h, draw, { repeat, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.anisotropy = 4;
  return { tex, ctx, canvas: c };
}

function radialTexture(stops) {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }).tex;
}

const glowTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
const softTex = radialTexture([[0, 'rgba(255,255,255,0.9)'], [0.5, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
const shadowTex = radialTexture([[0, 'rgba(0,0,0,0.55)'], [0.6, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Ghép nhiều hình khối thành 1 BufferGeometry có màu đỉnh (để InstancedMesh vẽ 1 lần). */
function mergeColored(parts) {
  const pos = [];
  const nor = [];
  const col = [];
  for (const { geo, color, pos: p = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _m.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s.set(scale[0], scale[1], scale[2]));
    g.applyMatrix4(_m);
    g.computeVertexNormals();
    const pa = g.attributes.position.array;
    const na = g.attributes.normal.array;
    _c.set(color);
    for (let i = 0; i < pa.length; i += 3) {
      pos.push(pa[i], pa[i + 1], pa[i + 2]);
      nor.push(na[i], na[i + 1], na[i + 2]);
      col.push(_c.r, _c.g, _c.b);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

function lathe(profile, segments = 14) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/** Hình trụ nối 2 điểm (tay, que hương...). */
function limb(a, b, r0, r1 = r0, seg = 7) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  const dir = vb.clone().sub(va).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
  return g;
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const ease = (t) => t * t * (3 - 2 * t);
const rand = (a, b) => a + Math.random() * (b - a);

// ============================================================================
// 3. CHÁNH ĐIỆN: SÀN, THẢM, CỘT, TƯỜNG, BÀN THỜ
// ============================================================================
const M = {
  lacquer: new THREE.MeshLambertMaterial({ color: 0x8e1d14 }),
  lacquerDark: new THREE.MeshLambertMaterial({ color: 0x4f0f0a }),
  goldTrim: new THREE.MeshStandardMaterial({ color: 0xe0a83e, emissive: 0x5a3200, roughness: 0.45, metalness: 0.35 }),
  wood: new THREE.MeshLambertMaterial({ color: 0x5a2c16 }),
  stone: new THREE.MeshLambertMaterial({ color: 0x8a6a52 }),
  bronze: new THREE.MeshStandardMaterial({ color: 0x9a6a2c, emissive: 0x2a1404, roughness: 0.5, metalness: 0.45 }),
  buddhaGold: new THREE.MeshStandardMaterial({ color: 0xf2bd4e, emissive: 0x7a4300, emissiveIntensity: 0.75, roughness: 0.38, metalness: 0.3, flatShading: true }),
  lotusPink: new THREE.MeshStandardMaterial({ color: 0xf2a0a8, emissive: 0x5a1020, emissiveIntensity: 0.4, roughness: 0.55, flatShading: true }),
  lotusGold: new THREE.MeshStandardMaterial({ color: 0xf6d27a, emissive: 0x6a4200, emissiveIntensity: 0.5, roughness: 0.4, flatShading: true }),
  lantern: new THREE.MeshLambertMaterial({ color: 0xe8341e, emissive: 0xff5a1e, emissiveIntensity: 0.85 }),
  candle: new THREE.MeshLambertMaterial({ color: 0xf6ecd8, emissive: 0x3a2a10 })
};

// Sàn gỗ bóng
const floorTex = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#6b3a20';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) {
    const y = (i * h) / 8;
    ctx.fillStyle = i % 2 ? '#74422a' : '#653620';
    ctx.fillRect(0, y, w, h / 8 - 3);
    ctx.fillStyle = 'rgba(30,10,0,0.55)';
    ctx.fillRect(0, y + h / 8 - 3, w, 3);
    const off = (i * 173) % w;
    ctx.fillRect(off, y, 3, h / 8);
  }
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
    ctx.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 80, 1);
  }
}, { repeat: [6, 12] }).tex;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 44), new THREE.MeshLambertMaterial({ map: floorTex }));
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, 0);
scene.add(floor);

// Thảm đỏ viền vàng chạy thẳng tới lư hương
const carpetTex = canvasTexture(128, 512, (ctx, w, h) => {
  ctx.fillStyle = '#a3121a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e8b24a';
  ctx.fillRect(0, 0, 10, h);
  ctx.fillRect(w - 10, 0, 10, h);
  ctx.fillStyle = '#6a0a10';
  ctx.fillRect(14, 0, 4, h);
  ctx.fillRect(w - 18, 0, 4, h);
  ctx.strokeStyle = 'rgba(240,180,80,0.45)';
  ctx.lineWidth = 3;
  for (let y = 32; y < h; y += 64) {
    ctx.beginPath();
    ctx.moveTo(w / 2, y - 18);
    ctx.lineTo(w / 2 + 18, y);
    ctx.lineTo(w / 2, y + 18);
    ctx.lineTo(w / 2 - 18, y);
    ctx.closePath();
    ctx.stroke();
  }
}, { repeat: [1, 6] }).tex;
const CARPET_Z0 = 13;
const CARPET_Z1 = -8.6;
const WALKER_Z = 3.2; // khách vãng lai xuất hiện ngay mép dưới khung hình
const carpet = new THREE.Mesh(
  new THREE.PlaneGeometry(2.3, CARPET_Z0 - CARPET_Z1),
  new THREE.MeshLambertMaterial({ map: carpetTex })
);
carpet.rotation.x = -Math.PI / 2;
carpet.position.set(0, 0.012, (CARPET_Z0 + CARPET_Z1) / 2);
scene.add(carpet);

// Tường sau + tường bên (sơn son)
const wallTex = canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#6e1610';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(230,160,60,0.22)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= w; x += 64) {
    for (let y = 0; y <= h; y += 64) {
      ctx.beginPath();
      ctx.arc(x, y, 30, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}, { repeat: [5, 4] }).tex;
const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(22, 16), wallMat);
backWall.position.set(0, 8, -19.5);
scene.add(backWall);
for (const side of [-1, 1]) {
  const w = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), wallMat);
  w.rotation.y = -side * Math.PI / 2;
  w.position.set(side * 9.5, 8, 0);
  scene.add(w);
  // chân tường gỗ
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 40), M.wood);
  skirt.position.set(side * 9.4, 0.6, 0);
  scene.add(skirt);
}
// Xà ngang trên cao
for (let z = -18; z <= 10; z += 4.6) {
  const beam = new THREE.Mesh(new THREE.BoxGeometry(19, 0.5, 0.5), M.lacquerDark);
  beam.position.set(0, 12.6, z);
  scene.add(beam);
}

// Cột son chân đá, đầu vàng
const colGeo = new THREE.CylinderGeometry(0.36, 0.4, 12.4, 12);
const colBaseGeo = new THREE.CylinderGeometry(0.62, 0.7, 0.55, 8);
const colRingGeo = new THREE.TorusGeometry(0.4, 0.07, 6, 16);
for (const side of [-1, 1]) {
  for (const z of [9, 4.2, -0.6, -5.4, -10.2, -15]) {
    const g = new THREE.Group();
    const col = new THREE.Mesh(colGeo, M.lacquer);
    col.position.y = 6.2;
    const base = new THREE.Mesh(colBaseGeo, M.stone);
    base.position.y = 0.27;
    g.add(col, base);
    for (const y of [1.2, 10.8, 11.6]) {
      const r = new THREE.Mesh(colRingGeo, M.goldTrim);
      r.rotation.x = Math.PI / 2;
      r.position.y = y;
      g.add(r);
    }
    g.position.set(side * 6.9, 0, z);
    scene.add(g);
  }
}

// Bệ thờ 2 cấp
const altarBase = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 7.2), M.stone);
altarBase.position.set(0, 0.25, -15.6);
const altarTop = new THREE.Mesh(new THREE.BoxGeometry(11, 0.55, 5.8), M.lacquerDark);
altarTop.position.set(0, 0.77, -16);
const altarEdge = new THREE.Mesh(new THREE.BoxGeometry(11.1, 0.12, 0.12), M.goldTrim);
altarEdge.position.set(0, 1.0, -13.1);
scene.add(altarBase, altarTop, altarEdge);
const ALTAR_Y = 1.05;

// Vách hậu cung + vòm vàng phía sau tượng
const archPanel = new THREE.Mesh(new THREE.BoxGeometry(11, 11, 0.4), M.lacquerDark);
archPanel.position.set(0, 6.6, -19.1);
scene.add(archPanel);
const archRing = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.18, 6, 40, Math.PI), M.goldTrim);
archRing.position.set(0, 7.2, -18.85);
scene.add(archRing);
for (const side of [-1, 1]) {
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.36, 7.2, 0.36), M.goldTrim);
  post.position.set(side * 4.3, 3.6, -18.85);
  scene.add(post);
}

// Hoành phi "CHÙA LINH ỨNG"
const plaque = canvasTexture(1024, 220, () => {});
function drawPlaque() {
  const { ctx, canvas: c } = plaque;
  const w = c.width;
  const h = c.height;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3a0a06');
  g.addColorStop(1, '#5e140c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e8b24a';
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, w - 60, h - 60);
  ctx.fillStyle = '#ffd77a';
  ctx.font = '900 112px "Noto Serif", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255,170,40,0.8)';
  ctx.shadowBlur = 18;
  ctx.fillText('CHÙA LINH ỨNG', w / 2, h / 2 + 6);
  plaque.tex.needsUpdate = true;
}
drawPlaque();
document.fonts?.ready?.then(drawPlaque);
const plaqueMesh = new THREE.Mesh(new THREE.PlaneGeometry(6.3, 1.35), new THREE.MeshBasicMaterial({ map: plaque.tex }));
plaqueMesh.position.set(0, 11.1, -18.6);
scene.add(plaqueMesh);

// ============================================================================
// 4. TƯỢNG PHẬT A DI ĐÀ NGỒI KIẾT GIÀ TRÊN TÒA SEN + HÀO QUANG
// ============================================================================
const buddha = new THREE.Group();
{
  const gold = M.buddhaGold;
  // Tòa sen
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.0, 0.9, 16), M.goldTrim);
  drum.position.y = 0.45;
  buddha.add(drum);
  const petalGeo = new THREE.SphereGeometry(1, 8, 6);
  const ringDefs = [
    { n: 14, r: 1.95, y: 1.05, tilt: 0.95, s: [0.42, 0.2, 0.75], mat: M.lotusPink },
    { n: 12, r: 1.55, y: 1.35, tilt: 0.6, s: [0.38, 0.18, 0.62], mat: M.lotusGold }
  ];
  for (const d of ringDefs) {
    for (let i = 0; i < d.n; i++) {
      const a = (i / d.n) * Math.PI * 2 + (d.n === 12 ? 0.2 : 0);
      const p = new THREE.Mesh(petalGeo, d.mat);
      p.scale.set(...d.s);
      p.position.set(Math.sin(a) * d.r, d.y, Math.cos(a) * d.r);
      p.rotation.set(0, a, 0, 'YXZ');
      p.rotateX(d.tilt);
      buddha.add(p);
    }
  }
  const seatTop = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.6, 0.25, 16), M.lotusGold);
  seatTop.position.y = 1.5;
  buddha.add(seatTop);

  const body = new THREE.Group();
  body.position.y = 1.6;
  // Chân kiết già
  const legs = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), gold);
  legs.scale.set(1.45, 0.42, 0.95);
  legs.position.y = 0.3;
  body.add(legs);
  // Thân + y áo
  const torso = new THREE.Mesh(lathe([[0.0, 0], [1.02, 0.12], [0.98, 0.6], [0.82, 1.05], [0.9, 1.55], [0.78, 1.82], [0.36, 2.0], [0.24, 2.12]], 16), gold);
  torso.position.y = 0.32;
  torso.scale.z = 0.72;
  body.add(torso);
  // Vạt áo chéo vai
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.07, 5, 20, Math.PI), gold);
  sash.position.set(0, 1.55, 0.05);
  sash.rotation.set(0.2, 0, 2.5);
  sash.scale.z = 0.7;
  body.add(sash);
  // Tay & ấn thiền định
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(limb([side * 0.88, 2.0, 0], [side * 0.95, 1.05, 0.25], 0.24, 0.2), gold);
    const fore = new THREE.Mesh(limb([side * 0.95, 1.05, 0.25], [side * 0.25, 0.72, 0.62], 0.2, 0.16), gold);
    body.add(arm, fore);
  }
  const hands = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 6), gold);
  hands.scale.set(1.2, 0.45, 0.8);
  hands.position.set(0, 0.74, 0.62);
  body.add(hands);
  // Đầu, nhục kế, tai dài
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.52, 16, 12), gold);
  head.position.y = 2.72;
  head.scale.set(0.95, 1.08, 0.95);
  body.add(head);
  const hair = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), gold);
  hair.position.y = 2.88;
  hair.scale.set(1.0, 0.82, 1.0);
  body.add(hair);
  const ushnisha = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), gold);
  ushnisha.position.y = 3.3;
  body.add(ushnisha);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), gold);
    ear.scale.set(0.7, 2.6, 0.9);
    ear.position.set(side * 0.5, 2.55, 0);
    body.add(ear);
  }
  const urna = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  urna.position.set(0, 2.8, 0.5);
  body.add(urna);
  buddha.add(body);
}
buddha.scale.setScalar(1.45);
buddha.position.set(0, ALTAR_Y, -16.4);
scene.add(buddha);

// Hào quang: vầng tròn sau đầu + vầng thân (mandorla) + tia sáng xoay chậm
const raysTex = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.translate(w / 2, h / 2);
  for (let i = 0; i < 36; i++) {
    ctx.rotate((Math.PI * 2) / 36);
    const g = ctx.createLinearGradient(0, 0, 0, -w / 2);
    g.addColorStop(0, 'rgba(255,230,150,0.9)');
    g.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(0, -w / 2);
    ctx.lineTo(6, 0);
    ctx.fill();
  }
}).tex;
const additive = (map, color, opacity = 1) => new THREE.MeshBasicMaterial({
  map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false
});
const HEAD_Y = ALTAR_Y + (1.6 + 2.75) * 1.45;
const haloGroup = new THREE.Group();
haloGroup.position.set(0, HEAD_Y, -17.3);
const haloDisc = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), additive(glowTex, 0xffc861, 0.85));
const haloRays = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 7.5), additive(raysTex, 0xffd27a, 0.45));
const haloRing = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.06, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffe6a0 }));
const mandorla = new THREE.Mesh(new THREE.PlaneGeometry(7, 9), additive(softTex, 0xff9a3a, 0.5));
mandorla.position.set(0, -2.6, -0.3);
haloGroup.add(mandorla, haloRays, haloDisc, haloRing);
scene.add(haloGroup);

// Đèn cầy hai bên + bình sen
const flameMat = additive(glowTex, 0xffb050, 1);
const candleFlames = [];
for (const side of [-1, 1]) {
  for (const x of [3.2, 4.4]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 8), M.candle);
    c.position.set(side * x, ALTAR_Y + 0.55, -14.2);
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.2, 8), M.goldTrim);
    holder.position.set(side * x, ALTAR_Y + 0.1, -14.2);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.8), flameMat);
    f.position.set(side * x, ALTAR_Y + 1.35, -14.2);
    candleFlames.push(f);
    scene.add(c, holder, f);
  }
  const vase = new THREE.Mesh(lathe([[0, 0], [0.3, 0.05], [0.42, 0.4], [0.22, 0.85], [0.3, 1.1]], 10), M.bronze);
  vase.position.set(side * 2.3, ALTAR_Y, -13.9);
  scene.add(vase);
  for (let i = 0; i < 3; i++) {
    const bud = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 5), M.lotusPink);
    bud.scale.set(1, 1.5, 1);
    bud.position.set(side * 2.3 + (i - 1) * 0.25, ALTAR_Y + 1.5 + (i % 2) * 0.25, -13.9);
    const stem = new THREE.Mesh(limb([side * 2.3, ALTAR_Y + 1.0, -13.9], [bud.position.x, bud.position.y - 0.2, -13.9], 0.03), new THREE.MeshLambertMaterial({ color: 0x3f7a3a }));
    scene.add(bud, stem);
  }
}

// ============================================================================
// 5. LƯ HƯƠNG ĐỒNG + NHANG + KHÓI
// ============================================================================
const BURNER = new THREE.Vector3(0, 0, -10.2);
const burner = new THREE.Group();
{
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, 0.7, 8), M.stone);
  stand.position.y = 0.35;
  const pot = new THREE.Mesh(lathe([[0, 0], [0.7, 0.05], [0.95, 0.4], [0.9, 0.75], [0.75, 0.82], [0.8, 0.9]], 14), M.bronze);
  pot.position.y = 0.95;
  burner.add(stand, pot);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(limb([Math.sin(a) * 0.55, 1.0, Math.cos(a) * 0.55], [Math.sin(a) * 0.8, 0.7, Math.cos(a) * 0.8], 0.09), M.bronze);
    burner.add(leg);
  }
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 12), M.bronze);
    ear.position.set(side * 0.82, 1.98, 0);
    ear.rotation.y = Math.PI / 2;
    burner.add(ear);
  }
}
burner.position.copy(BURNER);
scene.add(burner);
const BURNER_TOP = BURNER.y + 1.85;

const stickGeo = new THREE.CylinderGeometry(0.018, 0.018, 1.0, 4);
stickGeo.translate(0, 0.5, 0);
const stickMat = new THREE.MeshLambertMaterial({ color: 0xc23a1c });
const MAX_STICKS = 15;
const sticks = new THREE.InstancedMesh(stickGeo, stickMat, MAX_STICKS);
const tipGeo = new THREE.PlaneGeometry(0.16, 0.16);
const tips = new THREE.InstancedMesh(tipGeo, additive(glowTex, 0xff6a1a, 1), MAX_STICKS);
const stickPos = [];
for (let i = 0; i < MAX_STICKS; i++) {
  const a = i * 2.39996;
  const r = 0.12 + 0.48 * Math.sqrt((i + 0.5) / MAX_STICKS);
  const p = new THREE.Vector3(BURNER.x + Math.sin(a) * r, BURNER_TOP - 0.05, BURNER.z + Math.cos(a) * r * 0.8);
  const tilt = new THREE.Euler(Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12);
  stickPos.push({ p, tilt, len: rand(0.8, 1.05) });
}
let visibleSticks = 9;
function layoutSticks() {
  for (let i = 0; i < MAX_STICKS; i++) {
    const s = stickPos[i];
    const on = i < visibleSticks ? 1 : 0;
    _m.compose(s.p, _q.setFromEuler(s.tilt), _s.set(on, s.len * on || 0.0001, on));
    sticks.setMatrixAt(i, _m);
    _v.set(0, s.len, 0).applyEuler(s.tilt).add(s.p);
    s.tip = _v.clone();
  }
  sticks.instanceMatrix.needsUpdate = true;
}
layoutSticks();
scene.add(sticks, tips);

/** Hệ hạt đơn giản (Points + màu đỉnh, cộng sáng: màu đen = vô hình). */
class Particles {
  constructor(count, size, tex) {
    this.n = count;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.items = Array.from({ length: count }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, grow: 0 }));
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.cursor = 0;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, life, color) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    const it = this.items[i];
    it.life = life;
    it.max = life;
    it.vx = vx; it.vy = vy; it.vz = vz;
    _c.set(color);
    it.r = _c.r; it.g = _c.g; it.b = _c.b;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
  }
  update(dt, drag = 0, wobble = 0, t = 0) {
    for (let i = 0; i < this.n; i++) {
      const it = this.items[i];
      if (it.life <= 0) {
        this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
        continue;
      }
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      const fade = Math.min(1, (1 - k) * 6) * k;
      if (drag) { it.vx *= 1 - drag * dt; it.vz *= 1 - drag * dt; }
      this.pos[i * 3] += (it.vx + (wobble ? Math.sin(t * 1.3 + i) * wobble : 0)) * dt;
      this.pos[i * 3 + 1] += it.vy * dt;
      this.pos[i * 3 + 2] += it.vz * dt;
      this.col[i * 3] = it.r * fade;
      this.col[i * 3 + 1] = it.g * fade;
      this.col[i * 3 + 2] = it.b * fade;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
const smoke = new Particles(90, 0.9, softTex);
const sparks = new Particles(140, 0.22, glowTex);
let smokeAcc = 0;
function burstIncense(strength = 1) {
  for (let i = 0; i < 26 * strength; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = rand(0.6, 2.2);
    sparks.spawn(BURNER.x, BURNER_TOP + 0.6, BURNER.z, Math.cos(a) * sp, rand(1.5, 4), Math.sin(a) * sp, rand(0.8, 1.6), i % 3 ? 0xffb23a : 0xfff0a0);
  }
  for (let i = 0; i < 10; i++) {
    smoke.spawn(BURNER.x + rand(-0.3, 0.3), BURNER_TOP + 1, BURNER.z + rand(-0.3, 0.3), rand(-0.3, 0.3), rand(0.8, 1.4), rand(-0.2, 0.2), rand(3, 4.5), 0x9a8a7a);
  }
  flare.burner = 1;
}

// ============================================================================
// 6. CHUÔNG & MÕ
// ============================================================================
const BELL_POS = new THREE.Vector3(-4.6, 0, -11.2);
const bellGroup = new THREE.Group();
const bellPivot = new THREE.Group();
{
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4, 0.22), M.wood);
    post.position.set(side * 1.0, 2, 0);
    bellGroup.add(post);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.26, 0.3), M.lacquer);
  top.position.y = 4.05;
  bellGroup.add(top);
  bellPivot.position.y = 3.9;
  const bell = new THREE.Mesh(lathe([[0.1, 0], [0.42, -0.1], [0.55, -0.6], [0.62, -1.3], [0.78, -1.55], [0, -1.55]], 14), M.bronze);
  bell.position.y = -0.15;
  const knob = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 6, 10), M.bronze);
  bellPivot.add(bell, knob);
  bellGroup.add(bellPivot);
}
bellGroup.position.copy(BELL_POS);
bellGroup.rotation.y = 0.35;
scene.add(bellGroup);

const FISH_POS = new THREE.Vector3(4.6, 0, -11.2);
const fishGroup = new THREE.Group();
const fish = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshLambertMaterial({ color: 0x8a4a22 }));
{
  const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.35, 12), M.lacquer);
  cushion.position.y = 0.95;
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 0.8, 8), M.wood);
  table.position.y = 0.4;
  fish.scale.set(1.15, 0.8, 1);
  fish.position.y = 1.6;
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 5, 14), M.lacquerDark);
  mouth.position.set(0, 1.6, 0.66);
  fishGroup.add(table, cushion, fish, mouth);
}
fishGroup.position.copy(FISH_POS);
scene.add(fishGroup);

// Sóng chuông: vòng tròn loang trên sàn
const ringPool = Array.from({ length: 4 }, () => {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  scene.add(m);
  return { m, t: 0, dur: 1, max: 1, active: false };
});
function shockwave(pos, maxR = 14, dur = 2.2, y = 0.05) {
  const r = ringPool.find((x) => !x.active) || ringPool[0];
  r.active = true;
  r.t = 0;
  r.dur = dur;
  r.max = maxR;
  r.m.position.set(pos.x, y, pos.z);
  r.m.visible = true;
}

// ============================================================================
// 7. ĐÈN LỒNG TREO + ĐÈN HOA ĐĂNG (CẦU NGUYỆN)
// ============================================================================
const lanternGeo = new THREE.SphereGeometry(0.5, 10, 8);
const lanternCapGeo = new THREE.CylinderGeometry(0.26, 0.3, 0.12, 8);
const hangingLanterns = [];
for (const side of [-1, 1]) {
  for (const z of [6.6, 1.8, -3.0, -7.8]) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(lanternGeo, M.lantern);
    body.scale.set(1, 1.2, 1);
    const capT = new THREE.Mesh(lanternCapGeo, M.goldTrim);
    capT.position.y = 0.6;
    const capB = capT.clone();
    capB.position.y = -0.6;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3, 3), M.lacquerDark);
    cord.position.y = 2.1;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), additive(glowTex, 0xff7a2a, 0.45));
    g.add(glow, body, capT, capB, cord);
    g.position.set(side * 4.4, 8.4, z);
    g.userData.phase = Math.random() * 6;
    g.userData.glow = glow;
    hangingLanterns.push(g);
    scene.add(g);
  }
}

const skyLanterns = Array.from({ length: 5 }, () => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.7, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb35a, side: THREE.DoubleSide }));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), additive(glowTex, 0xff9a40, 0.8));
  g.add(glow, body);
  g.visible = false;
  scene.add(g);
  return { g, t: 0, active: false, label: null, vx: 0 };
});
function releaseSkyLantern(user, wish) {
  const s = skyLanterns.find((x) => !x.active) || skyLanterns[0];
  s.active = true;
  s.t = 0;
  s.vx = rand(-0.35, 0.35);
  s.g.position.set(BURNER.x + rand(-0.4, 0.4), BURNER_TOP + 0.5, BURNER.z + 0.6);
  s.g.visible = true;
  s.label?.remove();
  s.label = makeFloater(`🏮 ${user}: “${wish}”`, 'wish-tag', 9000);
  s.label.anchor = () => s.g.position;
}

// ============================================================================
// 8. CÁNH SEN RƠI (ĐẠI LỄ)
// ============================================================================
const PETALS = 160;
const petalGeo = new THREE.SphereGeometry(0.16, 5, 3);
petalGeo.scale(1, 0.25, 0.6);
const petals = new THREE.InstancedMesh(petalGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), PETALS);
petals.frustumCulled = false;
const petalState = Array.from({ length: PETALS }, (_, i) => ({ x: 0, y: -10, z: 0, vy: 0, rx: 0, ry: 0, spin: 0, phase: i }));
for (let i = 0; i < PETALS; i++) {
  petals.setColorAt(i, _c.set(i % 3 === 0 ? 0xffd66b : i % 3 === 1 ? 0xff9fb0 : 0xffc4cc));
  petals.setMatrixAt(i, _m.makeScale(0, 0, 0));
}
scene.add(petals);
let petalRainUntil = 0;
function startPetalRain(sec = 9) {
  petalRainUntil = clock.elapsed + sec;
  petalState.forEach((p) => {
    p.x = rand(-8, 8);
    p.y = rand(9, 22);
    p.z = rand(-14, 5);
    p.vy = rand(1.2, 2.4);
    p.spin = rand(1, 3);
  });
}

// ============================================================================
// 9. PHẬT TỬ ÁO LAM — INSTANCED (thân dưới quỳ, thân trên có thể lạy, tóc)
// ============================================================================
const SKIN = 0xf0c49c;
const LAM = 0x7790a8;
const CUSHION_H = 0.2;
const LOWER_H = 0.27;

const lowerGeo = mergeColored([
  { geo: lathe([[0, 0], [0.47, 0.02], [0.46, 0.11], [0.37, 0.21], [0.25, 0.27], [0, 0.27]], 12), color: 0xc4ccd4, scale: [1, 1, 1.2], pos: [0, 0, 0.08] },
  { geo: new THREE.SphereGeometry(0.075, 6, 4), color: 0x4a2c1c, pos: [-0.13, 0.05, 0.5], scale: [0.9, 0.6, 0.5] },
  { geo: new THREE.SphereGeometry(0.075, 6, 4), color: 0x4a2c1c, pos: [0.13, 0.05, 0.5], scale: [0.9, 0.6, 0.5] }
]);
const upperGeo = mergeColored([
  { geo: lathe([[0, 0], [0.25, 0.0], [0.23, 0.16], [0.22, 0.34], [0.23, 0.42], [0.18, 0.48], [0.07, 0.53], [0, 0.54]], 12), color: LAM, scale: [1, 1, 0.78] },
  { geo: new THREE.TorusGeometry(0.235, 0.03, 4, 16), color: 0x56708a, pos: [0, 0.12, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.78, 1] },
  { geo: new THREE.CylinderGeometry(0.11, 0.13, 0.04, 10), color: 0x5d7690, pos: [0, 0.49, 0] },
  { geo: new THREE.CylinderGeometry(0.05, 0.06, 0.1, 6), color: SKIN, pos: [0, 0.54, 0] },
  { geo: new THREE.SphereGeometry(0.17, 12, 9), color: SKIN, pos: [0, 0.71, 0], scale: [0.95, 1.05, 0.95] },
  { geo: new THREE.SphereGeometry(0.035, 5, 4), color: SKIN, pos: [-0.165, 0.7, 0.01], scale: [0.6, 1.2, 1] },
  { geo: new THREE.SphereGeometry(0.035, 5, 4), color: SKIN, pos: [0.165, 0.7, 0.01], scale: [0.6, 1.2, 1] },
  { geo: new THREE.SphereGeometry(0.018, 5, 4), color: 0x3a2418, pos: [-0.055, 0.715, -0.158] },
  { geo: new THREE.SphereGeometry(0.018, 5, 4), color: 0x3a2418, pos: [0.055, 0.715, -0.158] },
  { geo: new THREE.SphereGeometry(0.02, 5, 4), color: 0xc9746a, pos: [0, 0.645, -0.16], scale: [1.6, 0.6, 1] },
  { geo: limb([-0.23, 0.43, 0], [-0.08, 0.3, -0.19], 0.065, 0.055), color: LAM },
  { geo: limb([0.23, 0.43, 0], [0.08, 0.3, -0.19], 0.065, 0.055), color: LAM },
  { geo: new THREE.SphereGeometry(0.055, 8, 6), color: SKIN, pos: [0, 0.39, -0.21], scale: [0.85, 1.7, 0.75] }
]);
const hairGeo = mergeColored([
  { geo: new THREE.SphereGeometry(0.178, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), color: 0xffffff, pos: [0, 0.72, 0.014], rot: [0.42, 0, 0] },
  { geo: new THREE.SphereGeometry(0.08, 8, 6), color: 0xffffff, pos: [0, 0.8, 0.15] }
]);
const avatarMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const lowerMesh = new THREE.InstancedMesh(lowerGeo, avatarMat, MAX_AVATARS);
const upperMesh = new THREE.InstancedMesh(upperGeo, avatarMat, MAX_AVATARS);
const hairMesh = new THREE.InstancedMesh(hairGeo, avatarMat, MAX_AVATARS);
const auraMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), additive(glowTex, 0xffffff, 1), MAX_AVATARS);
const shadowMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), MAX_AVATARS);
for (const m of [lowerMesh, upperMesh, hairMesh, auraMesh, shadowMesh]) {
  m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
}
const ROBE_TONES = [0x7790a8, 0x6f879e, 0x8297ab, 0x6a8299, 0x8a9db0];
const HAIR_TONES = [0x1d1612, 0x2a1d16, 0x3a2a20, 0x1a1a1e, 0x8c8784, 0x4a3324];
for (let i = 0; i < MAX_AVATARS; i++) {
  lowerMesh.setColorAt(i, _c.set(ROBE_TONES[i % ROBE_TONES.length]));
  upperMesh.setColorAt(i, _c.setRGB(1, 1, 1));
  hairMesh.setColorAt(i, _c.set(HAIR_TONES[(i * 7) % HAIR_TONES.length]));
  auraMesh.setColorAt(i, _c.setRGB(0, 0, 0));
}
scene.add(shadowMesh, lowerMesh, upperMesh, hairMesh, auraMesh);

// Bồ đoàn sen đỏ viền vàng cho 40 chỗ ngồi (chỗ trống mờ đi)
const cushionGeo = mergeColored([
  { geo: new THREE.CylinderGeometry(0.46, 0.5, 0.16, 14), color: 0xb3261b, pos: [0, 0.08, 0] },
  { geo: new THREE.TorusGeometry(0.46, 0.035, 5, 18), color: 0xf2c35b, pos: [0, 0.16, 0], rot: [Math.PI / 2, 0, 0] },
  ...Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return { geo: new THREE.SphereGeometry(0.16, 6, 4), color: i % 2 ? 0xe86a78 : 0xd84a5a, pos: [Math.sin(a) * 0.5, 0.06, Math.cos(a) * 0.5], rot: [0, a, 0], scale: [0.7, 0.35, 1.2] };
  })
]);
const cushions = new THREE.InstancedMesh(cushionGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), SEATS);
/** Chỗ có người: bồ đoàn đầy đủ màu; chỗ trống: nhỏ lại, tối mờ. */
function setCushion(i, occupied) {
  const p = seatPos[i];
  _m.compose(_v.set(p.x, 0, p.z), _q.identity(), occupied ? _s.set(1, 1, 1) : _s.set(0.78, 0.6, 0.78));
  cushions.setMatrixAt(i, _m);
  cushions.setColorAt(i, occupied ? _c.setRGB(1, 1, 1) : _c.setRGB(0.2, 0.13, 0.11));
  cushions.instanceMatrix.needsUpdate = true;
  if (cushions.instanceColor) cushions.instanceColor.needsUpdate = true;
}

// Bố trí: 5 hàng × 8 chỗ, mỗi hàng xen kẽ trái/phải thảm, chỗ 0 gần bàn thờ nhất
const ROW_Z = [-6.1, -4.4, -2.7, -1.0, 0.7];
const COL_X = [1.65, 2.7, 3.75, 4.8];
const seatPos = [];
for (let i = 0; i < SEATS; i++) {
  const row = Math.floor(i / 8);
  const k = i % 8;
  const side = k % 2 === 0 ? -1 : 1;
  const col = Math.floor(k / 2);
  // hàng gần camera khép lại một chút để không bị cắt mép khung dọc 9:16
  const spread = 1 - row * 0.06;
  seatPos.push(new THREE.Vector3(side * (COL_X[0] + (COL_X[col] - COL_X[0]) * spread), 0, ROW_Z[row] + (col % 2) * 0.12));
}
for (let i = 0; i < SEATS; i++) {
  setCushion(i, false);
}
scene.add(cushions);

// ----------------------------------------------------------------------------
// Trạng thái từng Phật tử
// ----------------------------------------------------------------------------
const avatars = Array.from({ length: MAX_AVATARS }, (_, i) => ({
  idx: i,
  active: false,
  uid: '',
  name: '',
  walker: i >= SEATS,
  bobY: 0,
  walkPhase: 0,
  pos: new THREE.Vector3(),
  home: i < SEATS ? seatPos[i] : new THREE.Vector3(0, 0, WALKER_Z),
  yaw: 0,
  stand: 0,
  scale: 0,
  scaleTarget: 0,
  popAt: -10,
  bowAt: -10,
  bowCount: 0,
  nodAt: -10,
  bobAt: -10,
  glow: 0,
  glowColor: new THREE.Color(0xffd27a),
  chantUntil: -10,
  script: null,
  busy: false,
  tag: null,
  fadeOut: false
}));

function setGlow(a, intensity, color = 0xffd27a) {
  a.glow = Math.max(a.glow, intensity);
  a.glowColor.set(color);
}

function ensureTag(a) {
  if (!a.tag) {
    const el = document.createElement('div');
    el.className = 'tag';
    el.innerHTML = '<div class="tag-inner"></div>';
    overlay.appendChild(el);
    a.tag = { el, inner: el.firstChild, x: -999, y: -999, lit: false };
  }
  a.tag.inner.textContent = shortName(a.name);
  a.tag.el.classList.toggle('walker', a.walker);
  a.tag.el.style.display = '';
}

function activateAvatar(a, uid, name, pop) {
  a.active = true;
  a.uid = uid;
  a.name = name || 'Thí Chủ';
  a.fadeOut = false;
  a.script = null;
  a.busy = false;
  a.pos.copy(a.home);
  a.yaw = 0;
  a.stand = 0;
  a.scaleTarget = 1;
  if (pop) {
    a.scale = 0.01;
    a.popAt = clock.elapsed;
    setGlow(a, 1.4);
  } else {
    a.scale = 1;
  }
  if (!a.walker) setCushion(a.idx, true);
  ensureTag(a);
}

function deactivateAvatar(a) {
  a.fadeOut = true;
  a.scaleTarget = 0;
  a.script = null;
  a.busy = false;
  if (!a.walker) setCushion(a.idx, false);
}

// ----------------------------------------------------------------------------
// Kịch bản đi bộ lên lư hương (dãy bước tuần tự)
// ----------------------------------------------------------------------------
function moveStep(target, speed = 2.6) {
  let from = null;
  let dur = 1;
  return {
    start(a) {
      from = a.pos.clone();
      dur = Math.max(0.25, from.distanceTo(target) / speed);
    },
    get dur() { return dur; },
    update(a, k) {
      a.pos.lerpVectors(from, target, ease(k));
      const dx = target.x - from.x;
      const dz = target.z - from.z;
      if (Math.abs(dx) + Math.abs(dz) > 0.01) a.yaw = lerpAngle(a.yaw, Math.atan2(-dx, -dz), 0.25);
      a.walkPhase = (a.walkPhase || 0) + 0.45;
    }
  };
}
function waitStep(dur, fn) {
  return { dur, start: fn ? (a) => fn(a) : null, update: null };
}
function standStep(to, dur = 0.45) {
  let from = 0;
  return { dur, start(a) { from = a.stand; }, update(a, k) { a.stand = lerp(from, to, ease(k)); } };
}
function turnStep(yaw, dur = 0.4) {
  let from = 0;
  return { dur, start(a) { from = a.yaw; }, update(a, k) { a.yaw = lerpAngle(from, yaw, ease(k)); } };
}
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function runScript(a, steps, onDone) {
  a.script = { steps, i: -1, t: 0, onDone };
  a.busy = true;
  nextStep(a);
}
function nextStep(a) {
  const s = a.script;
  s.i += 1;
  s.t = 0;
  if (s.i >= s.steps.length) {
    a.script = null;
    a.busy = false;
    s.onDone?.(a);
    return;
  }
  s.steps[s.i].start?.(a);
}
function tickScript(a, dt) {
  const s = a.script;
  if (!s) return;
  const step = s.steps[s.i];
  s.t += dt;
  const k = step.dur > 0 ? clamp01(s.t / step.dur) : 1;
  step.update?.(a, k);
  if (k >= 1) nextStep(a);
}

let laneCursor = 0;
const LANE_X = [-0.42, 0.42, 0, -0.42, 0.42];
function walkToBurner(a, kind, ev) {
  const lane = LANE_X[laneCursor++ % LANE_X.length];
  const bowZ = BURNER.z + 1.8 + (laneCursor % 3 === 0 ? 0.9 : 0);
  const front = new THREE.Vector3(lane, 0, bowZ);
  const aisle = new THREE.Vector3(lane * 0.6, 0, a.home.z);
  const steps = [];
  if (a.walker) {
    a.pos.set(lane, 0, WALKER_Z);
    a.yaw = 0;
    a.stand = 1;
  } else {
    steps.push(standStep(1), moveStep(aisle));
  }
  steps.push(
    moveStep(front, a.walker ? 3.2 : 2.6),
    turnStep(0, 0.3),
    standStep(0, 0.4),
    waitStep(0.1, () => { a.bowAt = clock.elapsed; a.bowCount = 3; }),
    waitStep(0.9, () => ritualClimax(a, kind, ev)),
    waitStep(2.9),
    standStep(1, 0.4)
  );
  if (a.walker) {
    // khách vãng lai: lùi ra giữa thảm rồi mờ dần (không cần đi hết về cuối điện)
    steps.push(turnStep(Math.PI, 0.5), moveStep(new THREE.Vector3(lane, 0, BURNER.z + 6), 3), waitStep(0.05, () => deactivateAvatar(a)));
  } else {
    steps.push(moveStep(aisle, 3), moveStep(a.home.clone(), 2.6), turnStep(0, 0.35), standStep(0, 0.4));
  }
  runScript(a, steps, () => { if (a.walker) a.uid = ''; });
}

function ritualClimax(a, kind, ev) {
  if (a) setGlow(a, 1.3, kind === 'gift' || kind === 'grand' ? 0xffe27a : 0xffb35a);
  burstIncense(kind === 'grand' ? 2 : 1);
  const merit = ev?.merit ? `+${ev.merit} Công Đức` : '+ Công Đức';
  const f = makeFloater(merit, 'merit', 3200);
  const p = new THREE.Vector3(BURNER.x, BURNER_TOP + 1.4, BURNER.z);
  f.anchor = () => p;
  if (kind === 'prayer') releaseSkyLantern(ev?.user || a?.name || 'Thí Chủ', ev?.wish || 'Cầu bình an');
  if (kind === 'gift' || kind === 'grand') shockwave(BURNER, 6, 1.6, 0.06);
}

function bowAll(count = 1) {
  for (const a of avatars) {
    if (a.active && !a.busy && !a.fadeOut && a.stand < 0.1) {
      a.bowAt = clock.elapsed + Math.random() * 0.35;
      a.bowCount = count;
    }
  }
}

// ----------------------------------------------------------------------------
// Đạo tràng: đồng bộ roster
// ----------------------------------------------------------------------------
const uidToAvatar = new Map();
let rosterSynced = false;
const pendingActions = new Map(); // uid -> [{action,text,at}]

function syncRoster(hall) {
  if (!Array.isArray(hall)) return;
  const seen = new Set();
  for (const m of hall) {
    const seat = Number(m.seat);
    if (!m.uid || !(seat >= 0 && seat < SEATS)) continue;
    seen.add(m.uid);
    const a = avatars[seat];
    if (a.active && !a.fadeOut && a.uid === m.uid) {
      if (m.name && m.name !== a.name) { a.name = m.name; ensureTag(a); }
      uidToAvatar.set(m.uid, a);
      continue;
    }
    const prev = uidToAvatar.get(m.uid);
    if (prev && prev !== a && !prev.walker) deactivateAvatar(prev);
    if (a.active && a.uid !== m.uid) uidToAvatar.delete(a.uid);
    activateAvatar(a, m.uid, m.name, rosterSynced);
    uidToAvatar.set(m.uid, a);
    flushPending(m.uid);
  }
  for (let i = 0; i < SEATS; i++) {
    const a = avatars[i];
    if (a.active && !a.fadeOut && !seen.has(a.uid)) {
      uidToAvatar.delete(a.uid);
      deactivateAvatar(a);
    }
  }
  rosterSynced = true;
  document.getElementById('cntHall').textContent = String(seen.size);
}

function flushPending(uid) {
  const list = pendingActions.get(uid);
  if (!list) return;
  pendingActions.delete(uid);
  for (const p of list) {
    if (performance.now() - p.at < 2500) applyHallAction(uid, p.action, p.text);
  }
}

function seatedAvatar(uid) {
  const a = uid && uidToAvatar.get(uid);
  return a && a.active && !a.fadeOut && !a.walker ? a : null;
}

function applyHallAction(uid, action, text) {
  const a = seatedAvatar(uid);
  if (!a) {
    if (!uid) return;
    const list = pendingActions.get(uid) || [];
    list.push({ action, text, at: performance.now() });
    pendingActions.set(uid, list.slice(-3));
    return;
  }
  const t = clock.elapsed;
  switch (action) {
    case 'join':
      if (t - a.popAt > 1.5) { a.popAt = t; a.scale = Math.min(a.scale, 0.6); }
      setGlow(a, 1.4);
      break;
    case 'bow':
      if (!a.busy) { a.bowAt = t; a.bowCount = 3; }
      setGlow(a, 0.6, 0xffe6a0);
      break;
    case 'greet':
      if (!a.busy) a.nodAt = t;
      setGlow(a, 0.5, 0xfff0c0);
      showBubble(a, '🙏 A Di Đà Phật, chào cả nhà!');
      break;
    case 'chant': {
      a.chantUntil = t + 5;
      const f = makeFloater('Nam Mô A Di Đà Phật', 'chant', 3200);
      f.anchor = () => headPos(a, f.p || (f.p = new THREE.Vector3()));
      break;
    }
    case 'say':
      showBubble(a, text || '🙏');
      if (!a.busy) a.nodAt = t;
      break;
    default:
      break;
  }
}

// ============================================================================
// 10. LỚP HTML: CHIẾU 3D -> 2D
// ============================================================================
const _proj = new THREE.Vector3();
function toStage(v, out) {
  _proj.copy(v).project(camera);
  out.x = (_proj.x * 0.5 + 0.5) * STAGE_W;
  out.y = (-_proj.y * 0.5 + 0.5) * STAGE_H;
  out.vis = _proj.z < 1 && _proj.z > -1;
  return out;
}
function headPos(a, out) {
  const ly = lerp(1, 2.05, a.stand);
  return out.set(a.pos.x, CUSHION_H * (1 - a.stand) + LOWER_H * ly * a.scale + 0.95 * a.scale + a.bobY, a.pos.z);
}

const floaters = [];
function makeFloater(text, cls, ms) {
  const el = document.createElement('div');
  el.className = `floater ${cls || ''}`;
  const inner = document.createElement('div');
  inner.className = 'floater-inner';
  inner.textContent = text;
  el.appendChild(inner);
  overlay.appendChild(el);
  const f = { el, anchor: null, until: performance.now() + ms, remove() { el.remove(); this.dead = true; } };
  floaters.push(f);
  return f;
}

const bubbles = [];
function showBubble(a, text) {
  bubbles.filter((b) => b.a === a).forEach((b) => b.kill());
  while (bubbles.filter((b) => !b.dying).length >= MAX_BUBBLES) {
    bubbles.find((b) => !b.dying).kill();
  }
  const el = document.createElement('div');
  el.className = 'bubble';
  const inner = document.createElement('div');
  inner.className = 'bubble-inner';
  const nm = document.createElement('b');
  nm.textContent = shortName(a.name, 18);
  inner.append(nm, document.createTextNode(String(text).slice(0, 80)));
  el.appendChild(inner);
  overlay.appendChild(el);
  const b = {
    a,
    el,
    dying: false,
    timer: 0,
    kill() {
      if (this.dying) return;
      this.dying = true;
      clearTimeout(this.timer);
      el.classList.add('out');
      setTimeout(() => {
        el.remove();
        const i = bubbles.indexOf(this);
        if (i >= 0) bubbles.splice(i, 1);
      }, 400);
    }
  };
  b.timer = setTimeout(() => b.kill(), 4500);
  bubbles.push(b);
}

const _hp = new THREE.Vector3();
const _sp = { x: 0, y: 0, vis: false };
function updateOverlay() {
  for (const a of avatars) {
    if (!a.tag) continue;
    if (!a.active || a.scale < 0.15) {
      if (a.tag.el.style.display !== 'none') a.tag.el.style.display = 'none';
      continue;
    }
    if (a.tag.el.style.display === 'none') a.tag.el.style.display = '';
    toStage(headPos(a, _hp), _sp);
    const x = Math.round(_sp.x);
    const y = Math.round(_sp.y - 4);
    if (x !== a.tag.x || y !== a.tag.y) {
      a.tag.el.style.transform = `translate(${x}px, ${y}px)`;
      a.tag.x = x;
      a.tag.y = y;
    }
    const lit = a.glow > 0.35;
    if (lit !== a.tag.lit) {
      a.tag.el.classList.toggle('lit', lit);
      a.tag.lit = lit;
    }
    a.tag.el.style.zIndex = String(Math.round(a.pos.z * 10 + 300));
  }
  for (const b of bubbles) {
    toStage(headPos(b.a, _hp), _sp);
    b.el.style.transform = `translate(${Math.round(Math.max(180, Math.min(STAGE_W - 180, _sp.x)))}px, ${Math.round(_sp.y)}px)`;
  }
  const now = performance.now();
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    if (f.dead || now > f.until) {
      if (!f.dead) f.remove();
      floaters.splice(i, 1);
      continue;
    }
    if (f.anchor) {
      toStage(f.anchor(), _sp);
      f.el.style.transform = `translate(${Math.round(Math.max(170, Math.min(STAGE_W - 170, _sp.x)))}px, ${Math.round(_sp.y)}px)`;
    }
  }
}

// ============================================================================
// 11. VÒNG LẶP KHUNG HÌNH (30 FPS)
// ============================================================================
const clock = { elapsed: 0, last: 0 };
const flare = { burner: 0, halo: 0, push: 0, pushUntil: -10, bellSwing: 0, fishBob: 0 };
let fishBobAt = -10;
const BOW_DUR = 1.2;

function bowCurve(t, count) {
  if (t < 0 || t > count * BOW_DUR) return 0;
  const k = (t % BOW_DUR) / BOW_DUR;
  // xuống nhanh, giữ một chút sát đất, lên chậm
  if (k < 0.35) return ease(k / 0.35);
  if (k < 0.55) return 1;
  return 1 - ease((k - 0.55) / 0.45);
}

const _base = new THREE.Matrix4();
const _tmp = new THREE.Matrix4();
const _rot = new THREE.Matrix4();
const _camQ = new THREE.Quaternion();
const _pos = new THREE.Vector3();

function updateAvatars(dt, t) {
  _camQ.copy(camera.quaternion);
  const fishK = t - fishBobAt;
  for (const a of avatars) {
    const i = a.idx;
    if (!a.active) {
      lowerMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
      upperMesh.setMatrixAt(i, _m);
      hairMesh.setMatrixAt(i, _m);
      auraMesh.setMatrixAt(i, _m);
      shadowMesh.setMatrixAt(i, _m);
      continue;
    }
    if (a.script) tickScript(a, dt);

    // Pop-in (bật nảy) / mờ dần
    if (a.fadeOut) {
      a.scale = Math.max(0, a.scale - dt * 2.5);
      if (a.scale <= 0.001) {
        a.active = false;
        a.fadeOut = false;
        if (a.tag) a.tag.el.style.display = 'none';
        if (a.walker) uidToAvatar.forEach((v, k) => { if (v === a) uidToAvatar.delete(k); });
      }
    } else {
      const pk = (t - a.popAt) / 0.55;
      // easeOutBack: phóng to vượt 1 rồi về đúng cỡ
      a.scale = pk < 1 ? Math.max(0.01, 1 + 2.7 * (pk - 1) ** 3 + 1.7 * (pk - 1) ** 2) : lerp(a.scale, a.scaleTarget, 0.3);
    }

    // Tư thế
    let pitch = -1.32 * bowCurve(t - a.bowAt, a.bowCount);
    const nk = (t - a.nodAt) / 1.6;
    if (nk >= 0 && nk < 1) pitch += -0.38 * Math.sin(nk * Math.PI * 2) ** 2;
    const chanting = t < a.chantUntil;
    let bob = 0;
    if (fishK >= 0 && fishK < 0.5 && a.stand < 0.5) bob = Math.sin((fishK / 0.5) * Math.PI) * 0.07 * (0.6 + 0.4 * Math.sin(i));
    if (a.stand > 0.5 && a.script) bob += Math.abs(Math.sin((a.walkPhase || 0))) * 0.05;
    bob += Math.sin(t * 1.3 + i * 1.7) * 0.008; // thở nhẹ
    if (chanting) pitch += Math.sin(t * 5) * 0.03;
    a.bobY = bob;

    const s = Math.max(0.0001, a.scale);
    const lift = CUSHION_H * (1 - a.stand) * (a.walker ? 0 : 1);
    _base.compose(_pos.set(a.pos.x, lift + bob, a.pos.z), _q.setFromAxisAngle(_v.set(0, 1, 0), a.yaw), _s.set(s, s, s));
    const ly = lerp(1, 2.05, a.stand);
    const lxz = lerp(1, 0.68, a.stand);
    lowerMesh.setMatrixAt(i, _tmp.copy(_base).multiply(_m.makeScale(lxz, ly, lxz)));
    _tmp.copy(_base).multiply(_m.makeTranslation(0, LOWER_H * ly - 0.02, 0)).multiply(_rot.makeRotationX(pitch));
    upperMesh.setMatrixAt(i, _tmp);
    hairMesh.setMatrixAt(i, _tmp);
    shadowMesh.setMatrixAt(i, _m.compose(_pos.set(a.pos.x, 0.02 + lift * 0.95, a.pos.z), _q.identity(), _s.set(s, 1, s)));

    // Hào quang (cộng sáng; cường độ = màu)
    a.glow = Math.max(0, a.glow - dt * 0.55);
    let aura = a.glow;
    if (chanting) aura = Math.max(aura, 0.55 + Math.sin(t * 3 + i) * 0.15);
    if (aura > 0.01) {
      const sz = (1.5 + aura * 0.6) * s;
      _c.copy(a.glowColor).multiplyScalar(Math.min(1, aura) * 0.75);
      if (chanting) _c.set(0xffcf5a).multiplyScalar(Math.min(1, aura) * 0.8);
      auraMesh.setColorAt(i, _c);
      auraMesh.setMatrixAt(i, _m.compose(_pos.set(a.pos.x, lift + 0.62 * s, a.pos.z), _camQ, _s.set(sz, sz * 1.15, 1)));
    } else {
      auraMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
  }
  for (const m of [lowerMesh, upperMesh, hairMesh, auraMesh, shadowMesh]) m.instanceMatrix.needsUpdate = true;
  auraMesh.instanceColor.needsUpdate = true;
}

function updateEnvironment(dt, t) {
  // Khói nhang liên tục
  smokeAcc += dt * (4 + visibleSticks * 0.4);
  while (smokeAcc > 1) {
    smokeAcc -= 1;
    const s = stickPos[Math.floor(Math.random() * visibleSticks)];
    if (s?.tip) smoke.spawn(s.tip.x, s.tip.y + 0.05, s.tip.z, rand(-0.06, 0.06), rand(0.45, 0.75), rand(-0.05, 0.05), rand(3.5, 5.5), 0x5a524c);
  }
  smoke.update(dt, 0, 0.12, t);
  sparks.update(dt, 1.2);
  for (let i = 0; i < sparks.n; i++) if (sparks.items[i].life > 0) sparks.items[i].vy -= 3.2 * dt;

  // Đầu nhang đỏ lập lòe
  for (let i = 0; i < MAX_STICKS; i++) {
    const s = stickPos[i];
    const on = i < visibleSticks ? 0.9 + Math.sin(t * 6 + i) * 0.25 + flare.burner * 1.4 : 0;
    tips.setMatrixAt(i, _m.compose(s.tip, camera.quaternion, _s.set(on, on, on)));
  }
  tips.instanceMatrix.needsUpdate = true;

  flare.burner = Math.max(0, flare.burner - dt * 0.8);
  altarLight.intensity = 26 + flare.burner * 40 + flare.halo * 30 + Math.sin(t * 7) * 1.2;

  // Hào quang Phật
  flare.halo = Math.max(0, flare.halo - dt * 0.18);
  haloRays.rotation.z = t * 0.06;
  const hs = 1 + flare.halo * 0.6 + Math.sin(t * 0.8) * 0.03;
  haloRays.scale.setScalar(hs);
  haloRays.material.opacity = 0.4 + flare.halo * 0.6;
  haloDisc.material.opacity = 0.75 + flare.halo * 0.25;
  haloDisc.scale.setScalar(1 + flare.halo * 0.5);
  mandorla.material.opacity = 0.45 + flare.halo * 0.5;
  M.buddhaGold.emissiveIntensity = 0.75 + flare.halo * 0.9;

  // Đèn lồng đung đưa
  for (const g of hangingLanterns) {
    g.rotation.z = Math.sin(t * 0.7 + g.userData.phase) * 0.05;
    g.userData.glow.quaternion.copy(camera.quaternion);
  }
  for (const f of candleFlames) {
    f.quaternion.copy(camera.quaternion);
    f.scale.set(1 + Math.sin(t * 9 + f.position.x) * 0.08, 1 + Math.sin(t * 11 + f.position.x) * 0.12, 1);
  }

  // Chuông lắc, mõ nảy
  flare.bellSwing = Math.max(0, flare.bellSwing - dt * 0.35);
  bellPivot.rotation.x = Math.sin(t * 5) * 0.22 * flare.bellSwing;
  const fk = t - fishBobAt;
  fish.position.y = 1.6 + (fk >= 0 && fk < 0.3 ? Math.sin((fk / 0.3) * Math.PI) * 0.12 : 0);

  // Sóng chuông
  for (const r of ringPool) {
    if (!r.active) continue;
    r.t += dt;
    const k = r.t / r.dur;
    if (k >= 1) { r.active = false; r.m.visible = false; continue; }
    const rad = 0.5 + r.max * ease(k);
    r.m.scale.set(rad, rad, rad);
    r.m.material.opacity = (1 - k) * 0.85;
  }

  // Đèn hoa đăng bay lên
  for (const s of skyLanterns) {
    if (!s.active) continue;
    s.t += dt;
    s.g.position.y += dt * (0.55 + s.t * 0.05);
    s.g.position.x += Math.sin(s.t * 0.8) * dt * 0.25 + s.vx * dt;
    s.g.position.z -= dt * 0.18;
    s.g.children[0].quaternion.copy(camera.quaternion);
    if (s.t > 9.5) { s.active = false; s.g.visible = false; }
  }

  // Mưa cánh sen
  const raining = t < petalRainUntil;
  if (raining || petals.userData.live) {
    let live = 0;
    for (let i = 0; i < PETALS; i++) {
      const p = petalState[i];
      p.y -= p.vy * dt;
      p.x += Math.sin(t * 1.2 + p.phase) * dt * 0.5;
      if (p.y < 0.05) {
        if (raining) { p.y = rand(12, 16); p.x = rand(-8, 8); p.z = rand(-14, 5); } else { p.y = -10; }
      }
      if (p.y > -5) live++;
      _e.set(t * p.spin + p.phase, t * p.spin * 0.7, p.phase);
      _m.compose(_pos.set(p.x, p.y, p.z), _q.setFromEuler(_e), _s.set(0.9, 0.9, 0.9));
      if (p.y < -5) _m.makeScale(0, 0, 0);
      petals.setMatrixAt(i, _m);
    }
    petals.userData.live = live > 0;
    petals.instanceMatrix.needsUpdate = true;
  }

  // Camera chao nhẹ + đẩy vào khi Đại Lễ
  const pushTarget = t < flare.pushUntil ? 1 : 0;
  flare.push = lerp(flare.push, pushTarget, 1 - Math.exp(-dt * (pushTarget ? 0.9 : 0.6)));
  const p = ease(clamp01(flare.push));
  camera.position.lerpVectors(CAM_BASE, CAM_PUSH, p);
  camera.position.x += Math.sin(t * 0.11) * 0.7 * (1 - p);
  camera.position.y += Math.sin(t * 0.07) * 0.25;
  _v.lerpVectors(CAM_LOOK, CAM_PUSH_LOOK, p);
  _v.x += Math.sin(t * 0.09) * 0.25;
  camera.lookAt(_v);
}

let running = true;
let rafId = 0;
let lastFrame = 0;
function frame(now) {
  rafId = requestAnimationFrame(frame);
  if (now - lastFrame < FRAME_MS - 2) return;
  const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  clock.elapsed += dt;
  const t = clock.elapsed;
  updateEnvironment(dt, t);
  updateAvatars(dt, t);
  renderer.render(scene, camera);
  updateOverlay();
}
function startLoop() {
  if (rafId) return;
  lastFrame = 0;
  rafId = requestAnimationFrame(frame);
}
function stopLoop() {
  cancelAnimationFrame(rafId);
  rafId = 0;
}
document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  if (running) startLoop(); else stopLoop();
});
startLoop();

// ============================================================================
// 12. NGHI THỨC (temple.event)
// ============================================================================
let fortuneTimer = 0;
let grandTimer = 0;
const recentEventIds = new Set();

function getWalker(ev) {
  const busyWalkers = avatars.filter((a) => a.walker && a.active).length;
  const a = avatars.find((x) => x.walker && !x.active);
  if (!a || busyWalkers >= 4) return null;
  activateAvatar(a, ev.uniqueId || `w_${Math.random()}`, ev.user, true);
  return a;
}

function walkFor(ev, kind) {
  const a = seatedAvatar(ev.uniqueId);
  if (a) {
    if (a.busy) { setGlow(a, 1.2); return; }
    const walking = avatars.filter((x) => x.busy && x.stand > 0.3).length;
    if (walking >= 4) { a.bowAt = clock.elapsed; a.bowCount = 3; setGlow(a, 1.2); burstIncense(); return; }
    walkToBurner(a, kind, ev);
    return;
  }
  const w = getWalker(ev);
  if (w) walkToBurner(w, kind, ev);
  else ritualClimax(null, kind, ev);
}

function handleEvent(ev) {
  if (!ev || !ev.type) return;
  if (ev.id) {
    if (recentEventIds.has(ev.id)) return;
    recentEventIds.add(ev.id);
    if (recentEventIds.size > 100) recentEventIds.delete(recentEventIds.values().next().value);
  }
  if (ev.ttsText && ev.type !== 'drawFortune') {
    audio?.enqueueTts(ev.ttsText, { voice: ev.ttsVoice || 'maichi' });
  }
  // hall.roster được server gom 250ms -> chờ nhẹ để Phật tử kịp vào chỗ rồi mới diễn
  const needsWait = ev.uniqueId && !seatedAvatar(ev.uniqueId) && ['burnIncense', 'sendPrayer', 'offerGift', 'grandCeremony'].includes(ev.type);
  const run = () => playEvent(ev);
  if (needsWait) setTimeout(run, 450); else run();
}

function playEvent(ev) {
  const t = clock.elapsed;
  const me = seatedAvatar(ev.uniqueId);
  switch (ev.type) {
    case 'burnIncense':
      audio?.playIncenseChime();
      walkFor(ev, 'incense');
      break;
    case 'sendPrayer':
      audio?.playIncenseChime();
      walkFor(ev, 'prayer');
      break;
    case 'offerGift':
      audio?.playIncenseChime();
      audio?.playTempleBell(0.85);
      walkFor(ev, 'gift');
      break;
    case 'grandCeremony':
      audio?.playTempleBell(1.2);
      setTimeout(() => audio?.playTempleBell(1.1), 900);
      startPetalRain(9);
      flare.halo = 1;
      flare.pushUntil = t + 6.5;
      bowAll(1);
      showGrand(ev);
      walkFor(ev, 'grand');
      break;
    case 'ringBell':
      audio?.playTempleBell(1.0);
      flare.bellSwing = 1;
      shockwave(BELL_POS, 16, 2.4);
      setTimeout(() => shockwave(BELL_POS, 16, 2.4), 450);
      if (me && !me.busy) { me.bowAt = t; me.bowCount = 1; setGlow(me, 0.9); }
      bowAll(1);
      break;
    case 'strikeWoodenFish': {
      audio?.playWoodenFish();
      const n = Math.max(1, Math.min(5, Number(ev.count) || 1));
      for (let k = 0; k < n; k++) {
        setTimeout(() => { fishBobAt = clock.elapsed; if (k) audio?.playWoodenFish(1 + k * 0.02); }, k * 380);
      }
      if (me) setGlow(me, 0.7);
      break;
    }
    case 'drawFortune':
      audio?.playFortuneShake();
      if (me) { setGlow(me, 1, 0xfff0b0); if (!me.busy) me.nodAt = t; }
      audio?.enqueueTts(ev.ttsText || '', {
        voice: ev.ttsVoice || 'maichi',
        onStart: () => {
          audio?.playIncenseChime();
          showFortune(ev.user, ev.fortune);
          const a = seatedAvatar(ev.uniqueId);
          if (a && !a.busy) { a.bowAt = clock.elapsed; a.bowCount = 1; setGlow(a, 1.2, 0xfff0b0); }
        },
        onEnd: () => {
          clearTimeout(fortuneTimer);
          fortuneTimer = setTimeout(() => document.getElementById('fortuneCard').classList.remove('visible'), 1800);
        }
      });
      break;
    default:
      if (me) setGlow(me, 0.8);
  }
}

function showFortune(user, fortune) {
  if (!fortune) return;
  document.getElementById('fortuneRank').textContent = String(fortune.rank || '').toUpperCase();
  document.getElementById('fortuneTitle').textContent = `Quẻ Số ${fortune.number} — ${fortune.title || ''}`;
  document.getElementById('fortuneDevotee').textContent = `Thí chủ cầu quẻ: ${user || ''}`;
  document.getElementById('fortunePoem').textContent = fortune.poem || '';
  document.getElementById('fortuneMeaning').textContent = fortune.meaning ? `Lời bàn: ${fortune.meaning}` : '';
  const card = document.getElementById('fortuneCard');
  card.classList.add('visible');
  clearTimeout(fortuneTimer);
  fortuneTimer = setTimeout(() => card.classList.remove('visible'), 15000);
}
document.getElementById('fortuneCard').addEventListener('click', () => document.getElementById('fortuneCard').classList.remove('visible'));

function showGrand(ev) {
  document.getElementById('grandTitle').textContent = `🪷 ${String(ev.giftName || 'Đại Lễ').toUpperCase()} 🪷`;
  document.getElementById('grandSub').textContent = `Đại Thí Chủ ${ev.user || ''} • +${Number(ev.merit || 0).toLocaleString('vi-VN')} Công Đức`;
  const b = document.getElementById('grandBanner');
  b.classList.add('visible');
  clearTimeout(grandTimer);
  grandTimer = setTimeout(() => b.classList.remove('visible'), 6500);
}

// ============================================================================
// 13. HUD (temple.state)
// ============================================================================
function updateState(st) {
  if (!st) return;
  const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
  document.getElementById('cntIncense').textContent = fmt(st.totalIncense);
  document.getElementById('cntMerit').textContent = fmt(st.totalMerit);
  document.getElementById('cntFish').textContent = fmt(st.woodenFishHits);

  const n = Math.max(3, Math.min(MAX_STICKS, Math.ceil((st.activeIncenseSticks || 9) / 2)));
  if (n !== visibleSticks) { visibleSticks = n; layoutSticks(); }

  if (st.tiktok) updateStatus(st.tiktok);
  if (Array.isArray(st.leaderboard)) renderLeaderboard(st.leaderboard);
  if (Array.isArray(st.hall)) syncRoster(st.hall);

  const s = st.settings;
  if (s && audio) {
    if (typeof s.ttsEnabled === 'boolean') audio.ttsEnabled = s.ttsEnabled;
    if (s.ttsVoice) audio.ttsVoice = s.ttsVoice;
    if (typeof s.musicVolume === 'number') audio.setMusicVolume(s.musicVolume);
    if (typeof s.ttsVolume === 'number') audio.setTtsVolume(s.ttsVolume);
  }
}

let tiktokInfo = { connected: false, username: '', viewerCount: 0 };
function updateStatus(tt) {
  tiktokInfo = { ...tiktokInfo, ...tt };
  const pill = document.getElementById('statusPill');
  pill.classList.toggle('live', Boolean(tiktokInfo.connected));
  document.getElementById('statusText').textContent = tiktokInfo.connected
    ? `TRỰC TIẾP${tiktokInfo.username ? ` · @${tiktokInfo.username}` : ''}`
    : 'Chánh Điện đang mở cửa';
  document.getElementById('statusViewers').textContent = tiktokInfo.viewerCount > 0 ? `👁 ${Number(tiktokInfo.viewerCount).toLocaleString('vi-VN')}` : '';
}

let lastBoardKey = '';
function renderLeaderboard(lb) {
  const top = lb.slice(0, 5);
  const key = top.map((d) => `${d.uniqueId}:${d.merit}:${d.name}`).join('|');
  if (key === lastBoardKey) return;
  lastBoardKey = key;
  const list = document.getElementById('meritList');
  list.textContent = '';
  if (!top.length) {
    const li = document.createElement('li');
    li.className = 'merit-empty';
    li.textContent = 'Chưa có thí chủ — hãy bình luận để ghi danh 🙏';
    list.appendChild(li);
    return;
  }
  top.forEach((d, i) => {
    const li = document.createElement('li');
    const rank = document.createElement('span');
    rank.className = 'merit-rank';
    rank.textContent = String(i + 1);
    li.appendChild(rank);
    if (d.avatar) {
      const img = document.createElement('img');
      img.className = 'merit-avatar';
      img.src = d.avatar;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => img.remove();
      li.appendChild(img);
    }
    const name = document.createElement('span');
    name.className = 'merit-name';
    name.textContent = d.name || 'Thí Chủ';
    const val = document.createElement('span');
    val.className = 'merit-val';
    val.textContent = Number(d.merit || 0).toLocaleString('vi-VN');
    li.append(name, val);
    list.appendChild(li);
  });
}

function shortName(name, max = 14) {
  const s = String(name || 'Thí Chủ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ============================================================================
// 14. WEBSOCKET JSON-RPC 2.0
// ============================================================================
function connect() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch (_) { return; }
    const p = msg.params || {};
    try {
      switch (msg.method) {
        case 'temple.state': updateState(p); break;
        case 'temple.event':
          if (p.state) updateState(p.state);
          if (p.event) handleEvent(p.event);
          break;
        case 'hall.roster': syncRoster(p.hall); break;
        case 'hall.action': applyHallAction(p.uid, p.action, p.text); break;
        case 'temple.viewerCount': updateStatus({ viewerCount: Number(p.viewerCount) || 0 }); break;
        case 'tts.play':
          if (p.url) audio?.enqueueTts(p.text || 'Nam mô A Di Đà Phật', { voice: p.voice || 'maichi', url: p.url });
          break;
        default: break;
      }
    } catch (err) {
      console.error('[temple3d]', msg.method, err);
    }
  };
  ws.onclose = () => setTimeout(connect, 2000);
}
connect();

// Gỡ lỗi / kiểm thử từ console
window.Temple3D = { scene, camera, renderer, avatars, applyHallAction, handleEvent, syncRoster };
