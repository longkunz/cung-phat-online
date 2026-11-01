/**
 * Chùa Thiên Mụ 3D — Đại Hùng Bảo Điện + sân chùa, tháp Phước Duyên 7 tầng, cổng Tam Quan,
 * Đạo Tràng Phật tử áo lam có khớp tay chân (TikTok Live 9:16).
 *
 * - Toàn bộ hình khối + texture dựng bằng code lúc khởi động (không file model / ảnh ngoài).
 * - Phật tử: rig khớp (hông, thân, đầu, cánh tay, cẳng tay, bàn tay, đùi, cẳng chân, bàn chân).
 *   Mỗi bộ phận là 1 InstancedMesh dùng chung cho mọi người -> ~12 draw call cho cả đạo tràng;
 *   ma trận từng bộ phận được tính trên CPU từ tư thế (đi, quỳ, lạy, chắp tay...) mỗi khung hình.
 * - Người mới vào đạo tràng đi từ cổng Tam Quan, qua sân, lên bậc, theo thảm đỏ về chỗ rồi quỳ.
 * - Đạo diễn camera tự động: hall / side / altar / top + cắt cảnh theo sự kiện (entrance/follow,
 *   buddha khi Đại Lễ, altar khi dâng hương / xin xăm).
 * - Nhãn tên / bong bóng / chữ bay là HTML, chiếu 3D -> 2D mỗi khung hình (đúng ở mọi góc máy).
 * - Âm thanh + TTS dùng lại nguyên TempleAudioEngine (public/js/audio.js).
 * - Giao thức: temple.state, temple.event, hall.roster, hall.action, temple.viewerCount, tts.play.
 * - Hiệu năng: tối đa 30 FPS, dừng khi tab ẩn, pixelRatio 1, powerPreference 'low-power'.
 *   URL: ?obs=1 (khung sạch cho OBS), ?q=0.75 (độ phân giải render; q<1 tắt đổ bóng),
 *        ?aa=0 (tắt khử răng cưa), ?shadows=0, ?cam=hall|altar|side|buddha|entrance|top (khóa góc máy),
 *        ?director=0 (không tự đổi góc máy theo chu kỳ).
 */
import * as THREE from 'three';
import { RoomEnvironment } from '/vendor/three-addons/environments/RoomEnvironment.js';

const params = new URLSearchParams(window.location.search);
const OBS = params.get('obs') === '1';
if (OBS) document.body.classList.add('obs-mode');

const STAGE_W = 1080;
const STAGE_H = 1920;
const SEATS = 40;
const POOL = 100; // 40 chỗ + 16 người chờ ngoài sân + người đang đi vào / đi ra / khách vãng lai
const MAX_BUBBLES = 6;
const FRAME_MS = 1000 / 30;
// bước thời gian tối đa / khung (máy chậm vẫn giữ nhịp thời gian thật tới 4 FPS; ?dtmax= cho kiểm thử phần mềm)
const DT_MAX = Math.min(2, Math.max(0.05, parseFloat(params.get('dtmax')) || 0.25));
const qParam = parseFloat(params.get('q'));
const SHADOWS = params.get('shadows') !== '0' && !(Number.isFinite(qParam) && qParam < 1);

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
// 1. RENDERER / SCENE / ÁNH SÁNG
// ============================================================================
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: params.get('aa') !== '0', powerPreference: 'low-power', alpha: false });
} catch (err) {
  document.getElementById('noWebgl').hidden = false;
  throw err;
}
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = SHADOWS;
renderer.shadowMap.type = THREE.PCFShadowMap;

function fitStage() {
  const rect = stageWrapper.getBoundingClientRect();
  stageScale = rect.width / STAGE_W || 1;
  stageEl.style.transform = `scale(${stageScale})`;
  const q = Number.isFinite(qParam)
    ? Math.min(1, Math.max(0.3, qParam))
    : Math.min(1, Math.max(0.5, stageScale * (window.devicePixelRatio || 1)));
  renderer.setSize(Math.round(STAGE_W * q), Math.round(STAGE_H * q), false);
}
window.addEventListener('resize', fitStage);
fitStage();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b0d12);
scene.fog = new THREE.FogExp2(0x24120c, 0.011);
{
  // Môi trường phản chiếu cho vàng / đồng / sơn mài (tạo 1 lần lúc khởi động)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;
  pmrem.dispose();
}

const camera = new THREE.PerspectiveCamera(55, STAGE_W / STAGE_H, 0.1, 140);
camera.position.set(0, 10.4, 12.6);

scene.add(new THREE.HemisphereLight(0xffd9b0, 0x2a140c, 0.55));
// Đèn chính ấm từ phía bàn thờ (có đổ bóng, chỉ vùng đạo tràng)
const keyLight = new THREE.DirectionalLight(0xffc98a, 1.7);
keyLight.position.set(-5, 16, -14);
keyLight.target.position.set(0, 0, -2);
keyLight.castShadow = SHADOWS;
if (SHADOWS) {
  keyLight.shadow.mapSize.set(1024, 1024);
  const sc = keyLight.shadow.camera;
  sc.left = -7; sc.right = 7; sc.top = 9; sc.bottom = -9; sc.near = 4; sc.far = 40;
  keyLight.shadow.bias = -0.0008;
  keyLight.shadow.normalBias = 0.02;
}
scene.add(keyLight, keyLight.target);
// Ánh sáng lạnh từ sân / cổng chùa
const fillLight = new THREE.DirectionalLight(0x8fb0ff, 0.65);
fillLight.position.set(4, 9, 30);
scene.add(fillLight);
// Đèn điểm thật: bàn thờ + 2 ngọn nến (phần còn lại giả bằng phát sáng + sprite)
const altarLight = new THREE.PointLight(0xffa850, 16, 18, 1.8);
altarLight.position.set(0, 5.2, -12.5);
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

// Hạt nhiễu dùng chung để giả vân gỗ / đá / độ nhám
function noiseFill(ctx, w, h, n, alpha, colors) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  ctx.globalAlpha = 1;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Ghép nhiều hình khối thành 1 BufferGeometry có màu đỉnh + UV (để InstancedMesh vẽ 1 lần). */
function mergeColored(parts) {
  const pos = [];
  const nor = [];
  const col = [];
  const uv = [];
  for (const { geo, color = 0xffffff, pos: p = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _m.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'XYZ')), _s.set(scale[0], scale[1], scale[2]));
    g.applyMatrix4(_m);
    g.computeVertexNormals();
    const pa = g.attributes.position.array;
    const na = g.attributes.normal.array;
    const ua = g.attributes.uv ? g.attributes.uv.array : null;
    _c.set(color);
    for (let i = 0, j = 0; i < pa.length; i += 3, j += 2) {
      pos.push(pa[i], pa[i + 1], pa[i + 2]);
      nor.push(na[i], na[i + 1], na[i + 2]);
      col.push(_c.r, _c.g, _c.b);
      uv.push(ua ? ua[j] : 0, ua ? ua[j + 1] : 0);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
function lathe(profile, segments = 16) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}
/** Hình trụ / con nhộng nối 2 điểm. */
function limb(a, b, r0, r1 = r0, seg = 8, capsule = false) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = capsule ? new THREE.CapsuleGeometry(r0, Math.max(0.01, len), 6, seg) : new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  const dir = vb.clone().sub(va).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const ease = (t) => t * t * (3 - 2 * t);
const rand = (a, b) => a + Math.random() * (b - a);
const additive = (map, color, opacity = 1) => new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

// ============================================================================
// 3. TEXTURE THỦ TỤC (sinh 1 lần)
// ============================================================================
const TEX = {};
// Sàn gỗ gụ đánh bóng: ván có vân + bản đồ độ nhám
{
  const W = 512;
  const H = 1024;
  const planks = 6;
  const seeds = Array.from({ length: planks * 4 }, () => Math.random());
  TEX.floor = canvasTexture(W, H, (ctx) => {
    for (let i = 0; i < planks; i++) {
      const x = (i * W) / planks;
      const pw = W / planks;
      for (let j = 0; j < 4; j++) {
        const y = (j * H) / 4 + ((i % 2) * H) / 8;
        const base = 38 + seeds[i * 4 + j] * 18;
        ctx.fillStyle = `rgb(${base + 40},${base * 0.55},${base * 0.3})`;
        ctx.fillRect(x, y, pw, H / 4);
        ctx.fillRect(x, y - H, pw, H / 4);
        // vân gỗ
        ctx.strokeStyle = 'rgba(20,6,0,0.35)';
        ctx.lineWidth = 1;
        for (let k = 0; k < 9; k++) {
          ctx.beginPath();
          const gx = x + 4 + Math.random() * (pw - 8);
          ctx.moveTo(gx, y);
          ctx.bezierCurveTo(gx + rand(-6, 6), y + H / 12, gx + rand(-6, 6), y + H / 6, gx + rand(-3, 3), y + H / 4);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(10,3,0,0.7)';
        ctx.fillRect(x, y, pw, 2);
      }
      ctx.fillStyle = 'rgba(10,3,0,0.8)';
      ctx.fillRect(x, 0, 2, H);
    }
    noiseFill(ctx, W, H, 6000, 0.08, ['#fff', '#000']);
  }, { repeat: [3, 5] }).tex;
  TEX.floorRough = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(0, 0, w, h);
    noiseFill(ctx, w, h, 4000, 0.25, ['#9a9a9a', '#303030']);
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#2a2a2a' : '#8a8a8a';
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, rand(10, 40), rand(5, 20), Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { repeat: [4, 7], srgb: false }).tex;
}
// Thảm đỏ: viền hồi văn + hoa sen ở giữa
TEX.carpet = canvasTexture(256, 1024, (ctx, w, h) => {
  ctx.fillStyle = '#8f0f17';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d9a440';
  ctx.fillRect(0, 0, 18, h);
  ctx.fillRect(w - 18, 0, 18, h);
  ctx.fillStyle = '#5a070c';
  ctx.fillRect(22, 0, 26, h);
  ctx.fillRect(w - 48, 0, 26, h);
  // hồi văn (greek key)
  ctx.strokeStyle = '#e8b85a';
  ctx.lineWidth = 3;
  for (const x0 of [24, w - 46]) {
    for (let y = 0; y < h; y += 24) {
      ctx.beginPath();
      ctx.moveTo(x0, y + 20);
      ctx.lineTo(x0, y + 2);
      ctx.lineTo(x0 + 20, y + 2);
      ctx.lineTo(x0 + 20, y + 16);
      ctx.lineTo(x0 + 7, y + 16);
      ctx.lineTo(x0 + 7, y + 9);
      ctx.lineTo(x0 + 13, y + 9);
      ctx.stroke();
    }
  }
  // hoa sen cách điệu
  for (let y = 128; y < h; y += 256) {
    ctx.save();
    ctx.translate(w / 2, y);
    ctx.fillStyle = 'rgba(232,170,80,0.85)';
    for (let k = 0; k < 8; k++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.ellipse(0, -30, 11, 30, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#8f0f17';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,170,80,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  noiseFill(ctx, w, h, 9000, 0.1, ['#000', '#ff8080']);
}, { repeat: [1, 6] }).tex;
// Cột sơn son: đỏ có biến thiên + đai vàng
TEX.column = canvasTexture(128, 512, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#5c0b08');
  g.addColorStop(0.5, '#9c1c12');
  g.addColorStop(1, '#5c0b08');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  noiseFill(ctx, w, h, 1500, 0.08, ['#000', '#ff9070']);
  for (const y of [14, 40, h - 70]) {
    ctx.fillStyle = '#d9a440';
    ctx.fillRect(0, y, w, 12);
    ctx.fillStyle = '#7a4a10';
    ctx.fillRect(0, y + 12, w, 3);
  }
  // rồng mây cách điệu (nét vàng mờ)
  ctx.strokeStyle = 'rgba(230,170,70,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let y = 80; y < h - 90; y += 4) ctx.lineTo(w / 2 + Math.sin(y * 0.05) * 28, y);
  ctx.stroke();
});
// Vách gỗ chạm (pano)
TEX.panel = canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#5e130d';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c99036';
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, w - 60, h - 60);
  ctx.strokeStyle = 'rgba(210,150,60,0.55)';
  for (let r = 18; r < 90; r += 14) {
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let k = 0; k < 8; k++) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((k * Math.PI) / 4);
    ctx.beginPath();
    ctx.ellipse(0, -60, 10, 26, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  noiseFill(ctx, w, h, 2500, 0.07, ['#000', '#ffb070']);
}, { repeat: [6, 2] });
// Gạch đá sân chùa
TEX.stone = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#2a2622';
  ctx.fillRect(0, 0, w, h);
  const n = 4;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = 95 + Math.random() * 35;
      ctx.fillStyle = `rgb(${v},${v * 0.93},${v * 0.84})`;
      ctx.fillRect(i * (w / n) + 3, j * (h / n) + 3, w / n - 6, h / n - 6);
    }
  }
  noiseFill(ctx, w, h, 12000, 0.14, ['#000', '#fff', '#556']);
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = '#20301c';
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, rand(4, 18), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}, { repeat: [10, 8] }).tex;
// Gấm bồ đoàn
TEX.brocade = canvasTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#b31e1a';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(245,190,90,0.75)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= w; x += 32) {
    for (let y = 0; y <= h; y += 32) {
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 16, y + 16, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  noiseFill(ctx, w, h, 1200, 0.12, ['#000', '#ffd090']);
}, { repeat: [3, 1] }).tex;
// Tường gạch tháp (vàng đất) có ô cửa vòm
TEX.towerWall = canvasTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#b8895a';
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) {
    ctx.fillStyle = 'rgba(80,40,20,0.25)';
    ctx.fillRect(0, y, w, 1);
  }
  noiseFill(ctx, w, h, 2000, 0.15, ['#000', '#fff']);
  ctx.fillStyle = '#2a1408';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 18, h - 18);
  ctx.lineTo(w / 2 - 18, h / 2 - 4);
  ctx.arc(w / 2, h / 2 - 4, 18, Math.PI, 0);
  ctx.lineTo(w / 2 + 18, h - 18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#e0c08a';
  ctx.lineWidth = 3;
  ctx.stroke();
}, { repeat: [8, 1] }).tex;

// ============================================================================
// 4. VẬT LIỆU
// ============================================================================
const M = {
  floor: new THREE.MeshStandardMaterial({ map: TEX.floor, roughnessMap: TEX.floorRough, roughness: 0.7, metalness: 0 }),
  carpet: new THREE.MeshStandardMaterial({ map: TEX.carpet, roughness: 0.95 }),
  column: new THREE.MeshStandardMaterial({ map: TEX.column.tex, roughness: 0.32, metalness: 0.05 }),
  panel: new THREE.MeshStandardMaterial({ map: TEX.panel.tex, roughness: 0.55 }),
  lacquer: new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.3 }),
  lacquerDark: new THREE.MeshStandardMaterial({ color: 0x3e0a07, roughness: 0.35 }),
  goldTrim: new THREE.MeshStandardMaterial({ color: 0xe6b24c, roughness: 0.32, metalness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x4a2412, roughness: 0.6 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x8f8476, roughness: 0.85 }),
  courtyard: new THREE.MeshStandardMaterial({ map: TEX.stone, roughness: 0.9 }),
  bronze: new THREE.MeshStandardMaterial({ color: 0x8a5a26, roughness: 0.38, metalness: 0.95 }),
  buddhaGold: new THREE.MeshStandardMaterial({ color: 0xffc35a, roughness: 0.3, metalness: 1, emissive: 0x3a1e00, emissiveIntensity: 0.55 }),
  lotusPink: new THREE.MeshPhysicalMaterial({ color: 0xf4a6b0, roughness: 0.45, sheen: 0.6, sheenColor: new THREE.Color(0xffd0d8), emissive: 0x4a0c18, emissiveIntensity: 0.35 }),
  lotusGold: new THREE.MeshStandardMaterial({ color: 0xf6d27a, roughness: 0.35, metalness: 0.85 }),
  lantern: new THREE.MeshStandardMaterial({ color: 0xe8341e, emissive: 0xff5a1e, emissiveIntensity: 1.1, roughness: 0.6 }),
  candle: new THREE.MeshStandardMaterial({ color: 0xf6ecd8, emissive: 0x3a2a10, roughness: 0.7 }),
  roofTile: new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.75 }),
  towerWall: new THREE.MeshStandardMaterial({ map: TEX.towerWall, roughness: 0.9 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 0.9, flatShading: true }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 })
};

// ============================================================================
// 5. ĐẠI HÙNG BẢO ĐIỆN: sàn, thảm, cột, vách, cửa, cửa sổ, bệ thờ
// ============================================================================
const HALL_FRONT = 14; // tường trước (cửa chính)
const HALL_BACK = -19.5;
const COURT_Y = -0.45;
const STEP_LEN = 1.2;
function groundY(z) {
  if (z <= HALL_FRONT) return 0;
  if (z >= HALL_FRONT + STEP_LEN) return COURT_Y;
  return (COURT_Y * (z - HALL_FRONT)) / STEP_LEN;
}

const hallLen = HALL_FRONT - HALL_BACK;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(19, hallLen), M.floor);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, (HALL_FRONT + HALL_BACK) / 2);
floor.receiveShadow = true;
scene.add(floor);

const CARPET_Z0 = HALL_FRONT - 0.2;
const CARPET_Z1 = -8.6;
const carpet = new THREE.Mesh(new THREE.PlaneGeometry(2.3, CARPET_Z0 - CARPET_Z1), M.carpet);
carpet.rotation.x = -Math.PI / 2;
carpet.position.set(0, 0.012, (CARPET_Z0 + CARPET_Z1) / 2);
carpet.receiveShadow = true;
scene.add(carpet);

// Vách (khối dày để nhìn từ trên / từ sân đều đẹp)
const WALL_H = 13;
function wallBox(w, h, d, x, y, z, mat = M.panel) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}
TEX.panel.tex.repeat.set(6, 3);
wallBox(19.8, WALL_H, 0.4, 0, WALL_H / 2, HALL_BACK - 0.2);
for (const side of [-1, 1]) {
  wallBox(0.4, WALL_H, hallLen, side * 9.7, WALL_H / 2, (HALL_FRONT + HALL_BACK) / 2);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, hallLen), M.wood);
  skirt.position.set(side * 9.45, 0.55, (HALL_FRONT + HALL_BACK) / 2);
  scene.add(skirt);
}
// Tường trước có cửa chính 4.8 x 7
const DOOR_W = 4.8;
const DOOR_H = 7;
for (const side of [-1, 1]) {
  const w = (19.8 - DOOR_W) / 2;
  wallBox(w, WALL_H, 0.4, side * (DOOR_W / 2 + w / 2), WALL_H / 2, HALL_FRONT + 0.2);
}
wallBox(DOOR_W, WALL_H - DOOR_H, 0.4, 0, DOOR_H + (WALL_H - DOOR_H) / 2, HALL_FRONT + 0.2);
// Khung cửa vàng + 2 cánh cửa mở ra ngoài
const doorFrameGeo = new THREE.BoxGeometry(0.3, DOOR_H, 0.6);
for (const side of [-1, 1]) {
  const f = new THREE.Mesh(doorFrameGeo, M.goldTrim);
  f.position.set(side * (DOOR_W / 2 + 0.05), DOOR_H / 2, HALL_FRONT + 0.2);
  scene.add(f);
  const leaf = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W / 2, DOOR_H - 0.1, 0.14), M.lacquer);
  panel.position.x = -side * DOOR_W / 4;
  const studGeo = new THREE.SphereGeometry(0.06, 6, 4);
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 3; c++) {
      const st = new THREE.Mesh(studGeo, M.goldTrim);
      st.position.set(-side * (0.45 + c * 0.7), 0.6 + r * 0.95, 0.08);
      leaf.add(st);
    }
  }
  panel.position.y = DOOR_H / 2;
  leaf.add(panel);
  mergeStaticByMaterial(leaf); // cánh cửa + 21 đinh vàng -> 2 draw call
  leaf.position.set(side * DOOR_W / 2, 0, HALL_FRONT + 0.45);
  leaf.rotation.y = side * -1.25; // mở ra phía sân
  scene.add(leaf);
}
const lintel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + 0.8, 0.35, 0.7), M.goldTrim);
lintel.position.set(0, DOOR_H + 0.1, HALL_FRONT + 0.2);
scene.add(lintel);
// Bậc thềm đá xuống sân
for (let i = 0; i < 3; i++) {
  const st = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + 2.4 - i * 0.0, 0.15, STEP_LEN / 3 + 0.02), M.stone);
  st.position.set(0, -0.075 - i * 0.15, HALL_FRONT + 0.2 + (i + 0.5) * (STEP_LEN / 3));
  scene.add(st);
}
// Cửa sổ cao hai bên + vệt nắng (giả thể tích bằng mặt phẳng cộng sáng)
const shaftTex = canvasTexture(64, 256, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,230,180,0.9)');
  g.addColorStop(1, 'rgba(255,230,180,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const gx = ctx.createLinearGradient(0, 0, w, 0);
  gx.addColorStop(0, 'rgba(0,0,0,1)');
  gx.addColorStop(0.3, 'rgba(0,0,0,0)');
  gx.addColorStop(0.7, 'rgba(0,0,0,0)');
  gx.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, w, h);
}).tex;
const shafts = [];
for (const z of [-12, -5.5, 1, 7.5]) {
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), new THREE.MeshBasicMaterial({ color: 0xffe2b0, fog: false }));
  win.position.set(-9.48, 10.2, z);
  win.rotation.y = Math.PI / 2;
  scene.add(win);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 13), additive(shaftTex, 0xffd9a0, 0.16));
  sh.position.set(-5.6, 5.4, z + 0.6);
  sh.rotation.set(0, Math.PI / 2, 0.62);
  sh.material.side = THREE.DoubleSide;
  shafts.push(sh);
  scene.add(sh);
}
// Xà ngang
for (let z = -18; z <= 12; z += 4.8) {
  const beam = new THREE.Mesh(new THREE.BoxGeometry(19.4, 0.55, 0.55), M.lacquerDark);
  beam.position.set(0, 12.2, z);
  scene.add(beam);
  const band = new THREE.Mesh(new THREE.BoxGeometry(19.4, 0.1, 0.58), M.goldTrim);
  band.position.set(0, 11.95, z);
  scene.add(band);
}
// Cột son (InstancedMesh: 1 draw call cho thân cột, 1 cho chân đá, 1 cho đai vàng)
const COL_Z = [10.6, 5.6, 0.6, -4.4, -9.4, -14.4];
{
  const cols = [];
  for (const side of [-1, 1]) for (const z of COL_Z) cols.push([side * 7.0, z]);
  const colMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.36, 0.4, 12, 20), M.column, cols.length);
  const baseMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.72, 0.5, 8), M.stone, cols.length);
  const capMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.38, 0.4, 12), M.goldTrim, cols.length);
  cols.forEach(([x, z], i) => {
    colMesh.setMatrixAt(i, _m.makeTranslation(x, 6, z));
    baseMesh.setMatrixAt(i, _m.makeTranslation(x, 0.25, z));
    capMesh.setMatrixAt(i, _m.makeTranslation(x, 11.8, z));
  });
  scene.add(colMesh, baseMesh, capMesh);
}

// Bệ thờ 2 cấp
const ALTAR_Y = 1.05;
{
  const base = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 7.2), M.stone);
  base.position.set(0, 0.25, -15.6);
  const top = new THREE.Mesh(new THREE.BoxGeometry(11, 0.55, 5.8), M.lacquerDark);
  top.position.set(0, 0.77, -16);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(11.1, 0.12, 0.12), M.goldTrim);
  edge.position.set(0, 1.0, -13.1);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(11, 0.5), M.panel);
  front.position.set(0, 0.78, -13.09);
  scene.add(base, top, edge, front);
  // Vách hậu cung chạm + vòm vàng
  const arch = new THREE.Mesh(new THREE.BoxGeometry(11, 11, 0.4), M.panel);
  arch.position.set(0, 6.4, -19.0);
  scene.add(arch);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.18, 10, 64, Math.PI), M.goldTrim);
  ring.position.set(0, 7.0, -18.75);
  scene.add(ring);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.36, 7.0, 0.36), M.goldTrim);
    post.position.set(side * 4.3, 3.5, -18.75);
    scene.add(post);
  }
}

// Hoành phi "CHÙA THIÊN MỤ" (trong điện) + biển ngoài cổng
function makeSign(text, wPx = 1024, hPx = 220) {
  const t = canvasTexture(wPx, hPx, () => {});
  const draw = () => {
    const { ctx, canvas: c } = t;
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#3a0a06');
    g.addColorStop(1, '#5e140c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#e8b24a';
    ctx.lineWidth = 12;
    ctx.strokeRect(10, 10, c.width - 20, c.height - 20);
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 30, c.width - 60, c.height - 60);
    ctx.fillStyle = '#ffd77a';
    ctx.font = `900 ${Math.round(c.height * 0.5)}px "Noto Serif", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,170,40,0.8)';
    ctx.shadowBlur = 18;
    ctx.fillText(text, c.width / 2, c.height / 2 + 6);
    t.tex.needsUpdate = true;
  };
  draw();
  document.fonts?.ready?.then(draw);
  return new THREE.MeshBasicMaterial({ map: t.tex, fog: false });
}
const signMat = makeSign('CHÙA THIÊN MỤ');
const plaque = new THREE.Mesh(new THREE.PlaneGeometry(6.3, 1.35), signMat);
plaque.position.set(0, 10.9, -18.55);
scene.add(plaque);
const plaqueOut = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.1), signMat);
plaqueOut.position.set(0, DOOR_H + 1.3, HALL_FRONT + 0.42);
scene.add(plaqueOut);

// ============================================================================
// 6. TƯỢNG PHẬT A DI ĐÀ — kiết già, ấn thiền định ôm hoa sen, y vắt vai trái,
//    tòa sen nhiều tầng trên đế bát giác, hào quang chạm lửa. Đây là hình ảnh chính:
//    chỉ riêng tượng dùng nhiều đa giác (1 vật thể), phần còn lại giữ rẻ.
// ============================================================================
/** Cánh sen cong: mặt trước +z, gốc ở gốc toạ độ, đầu nhọn theo +y, mép cúp vào trong, chóp hơi ngả ra. */
function petalGeometry(len = 1, width = 0.42, cup = 0.22, bend = 0.18, segU = 8, segV = 14) {
  const g = new THREE.PlaneGeometry(1, 1, segU, segV);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5;
    const v = p.getY(i) + 0.5;
    const shape = Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + v * 0.94)), 0.75) * (1 - 0.25 * v * v);
    const hw = width * shape;
    const x = (u - 0.5) * 2 * hw;
    const y = v * len;
    const z = -cup * len * Math.pow((u - 0.5) * 2, 2) * shape + bend * len * v * v;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
/** Vạt y rủ (nửa trụ phía trước) có nếp gấp dọc và gấu lượn sóng. */
function drapeGeometry({ rTop, rBot, h, arc, folds, amp, hemAmp, segU = 96, segV = 20 }) {
  const g = new THREE.CylinderGeometry(1, 1, 1, segU, segV, true, -arc / 2, arc);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const v = p.getY(i) + 0.5; // 0 gấu .. 1 trên
    const th = Math.atan2(x, z);
    const edge = 1 - Math.pow(Math.abs(th) / (arc / 2), 6);
    const r = lerp(rBot, rTop, v) + amp * (1 - v * 0.7) * Math.sin(th * folds) * edge;
    const y = (v - 0.5) * h + (1 - v) * hemAmp * Math.sin(th * folds * 0.5 + 0.7);
    p.setXYZ(i, Math.sin(th) * r, y, Math.cos(th) * r);
  }
  g.computeVertexNormals();
  return g;
}
const robeNormal = canvasTexture(512, 64, (ctx, w, h) => {
  const img = ctx.createImageData(w, h);
  for (let x = 0; x < w; x++) {
    const n = Math.cos(x * 0.21) * 0.35 + Math.cos(x * 0.077 + 1) * 0.25;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      img.data[i] = 128 + n * 127;
      img.data[i + 1] = 128;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}, { srgb: false }).tex;
robeNormal.wrapS = robeNormal.wrapT = THREE.RepeatWrapping;
robeNormal.repeat.set(1.5, 1);
const goldRough = canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = 'rgb(84,84,84)';
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.2;
  for (let i = 0; i < 260; i++) {
    const v = 50 + Math.random() * 70;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, rand(3, 22), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}, { srgb: false }).tex;
goldRough.wrapS = goldRough.wrapT = THREE.RepeatWrapping;
const GOLD = {
  skin: new THREE.MeshStandardMaterial({ color: 0xf5c464, metalness: 0.9, roughness: 0.48, roughnessMap: goldRough, emissive: 0x4a2a00, emissiveIntensity: 0.45 }),
  robe: new THREE.MeshStandardMaterial({ color: 0xe9ad45, metalness: 1, roughness: 0.5, roughnessMap: goldRough, normalMap: robeNormal, normalScale: new THREE.Vector2(0.4, 0.4), emissive: 0x3a1e00, emissiveIntensity: 0.45, side: THREE.DoubleSide }),
  dark: new THREE.MeshStandardMaterial({ color: 0xc98a2e, metalness: 1, roughness: 0.42, emissive: 0x2a1400, emissiveIntensity: 0.4 }),
  petal: new THREE.MeshStandardMaterial({ color: 0xf6b3b8, metalness: 0.15, roughness: 0.45, side: THREE.DoubleSide, emissive: 0x5a1626, emissiveIntensity: 0.35 }),
  petalGold: new THREE.MeshStandardMaterial({ color: 0xffd27a, metalness: 1, roughness: 0.3, side: THREE.DoubleSide, emissive: 0x4a2a00, emissiveIntensity: 0.45 })
};
GOLD.robePlain = GOLD.robe.clone();
GOLD.robePlain.normalMap = null;
M.buddhaGold = GOLD.skin;

const buddha = new THREE.Group();
const HEAD_LOCAL = new THREE.Vector3(0, 2.66, 0.03); // trong khung "body"
{
  const add = (parent, geo, mat, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...p);
    m.scale.set(...s);
    m.rotation.set(...r);
    parent.add(m);
    return m;
  };
  // Đế bát giác 2 cấp + viền
  add(buddha, new THREE.CylinderGeometry(2.25, 2.4, 0.38, 8), M.lacquerDark, [0, 0.19, 0], [1, 1, 1], [0, Math.PI / 8, 0]);
  add(buddha, new THREE.CylinderGeometry(2.05, 2.2, 0.32, 8), GOLD.dark, [0, 0.54, 0], [1, 1, 1], [0, Math.PI / 8, 0]);
  add(buddha, new THREE.TorusGeometry(2.12, 0.04, 8, 8), GOLD.skin, [0, 0.7, 0], [1, 1, 1], [Math.PI / 2, 0, Math.PI / 8]);
  add(buddha, new THREE.CylinderGeometry(1.55, 1.85, 0.5, 48), GOLD.dark, [0, 0.95, 0]);
  // Tòa sen: 3 vòng cánh cong (instanced), vòng trong vàng
  const rings = [
    { n: 18, r: 1.78, y: 0.82, tilt: 1.05, len: 0.95, w: 0.36, mat: GOLD.petal },
    { n: 16, r: 1.6, y: 1.0, tilt: 0.72, len: 0.85, w: 0.36, mat: GOLD.petal },
    { n: 14, r: 1.42, y: 1.2, tilt: 0.42, len: 0.6, w: 0.34, mat: GOLD.petalGold }
  ];
  rings.forEach((d, ri) => {
    const geo = petalGeometry(d.len, d.w, 0.2, 0.22);
    const im = new THREE.InstancedMesh(geo, d.mat, d.n);
    for (let i = 0; i < d.n; i++) {
      const a = ((i + (ri % 2) * 0.5) / d.n) * Math.PI * 2;
      _e.set(d.tilt, a, 0, 'YXZ');
      _m.compose(_v.set(Math.sin(a) * d.r, d.y, Math.cos(a) * d.r), _q.setFromEuler(_e), _s.set(1, 1, 1));
      im.setMatrixAt(i, _m);
    }
    buddha.add(im);
  });
  add(buddha, new THREE.CylinderGeometry(1.48, 1.5, 0.18, 64), GOLD.petalGold, [0, 1.52, 0]);

  const body = new THREE.Group();
  body.position.y = 1.6;
  buddha.add(body);
  const S = GOLD.skin;
  const R = GOLD.robe;
  // --- Chân kiết già: lòng đùi phủ y (khối rộng, mềm), 2 bàn chân ngửa trên đùi ---
  const RL = GOLD.robePlain;
  add(body, new THREE.SphereGeometry(1, 64, 32), RL, [0, 0.3, 0.1], [1.5, 0.42, 1.0]);
  add(body, new THREE.SphereGeometry(1, 48, 24), RL, [0, 0.42, 0.42], [1.15, 0.3, 0.62]);
  for (const side of [-1, 1]) {
    add(body, new THREE.SphereGeometry(0.2, 32, 16), S, [side * 0.55, 0.6, 0.62], [0.6, 0.3, 1.1], [0.15, side * 0.6, 0]);
  }
  // Vạt y rủ phía trước, gấu lượn sóng chảy xuống tòa sen
  add(body, drapeGeometry({ rTop: 0.95, rBot: 1.2, h: 0.8, arc: 2.2, folds: 14, amp: 0.03, hemAmp: 0.05 }), R, [0, -0.15, 0.16], [1.5, 1, 1]);
  // --- Thân: khối y hình chuông (vai tròn -> ôm cánh tay -> phủ xuống lòng): dáng tượng hình tháp ---
  const BELL = [[0, 0], [1.0, 0.05], [1.03, 0.35], [1.0, 0.7], [0.95, 1.0], [0.88, 1.25], [0.86, 1.45], [0.9, 1.58], [0.88, 1.7], [0.7, 1.83], [0.42, 1.93], [0.2, 2.04]];
  const BELL_Y0 = 0.32;
  const BELL_Z = 0.64;
  add(body, lathe(BELL, 96), R, [0, BELL_Y0, 0], [1, 1, BELL_Z]);
  const bellR = (y) => {
    const ly = y - BELL_Y0;
    for (let i = 1; i < BELL.length; i++) {
      if (ly <= BELL[i][1]) return lerp(BELL[i - 1][0], BELL[i][0], (ly - BELL[i - 1][1]) / (BELL[i][1] - BELL[i - 1][1]));
    }
    return 0.2;
  };
  const onBell = (x, y, lift = 0.012) => [x, y, BELL_Z * Math.sqrt(Math.max(0, bellR(y) ** 2 - x * x)) + lift];
  // mép y chéo từ nách phải lên vai trái + 2 nếp mảnh (bám đúng mặt áo)
  const sash = (pts, r) => add(body, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(...onBell(x, y, r * 0.6)))), 64, r, 10), R);
  sash([[0.66, 1.5], [0.4, 1.66], [0.05, 1.86], [-0.3, 2.04], [-0.5, 2.14]], 0.03);
  sash([[0.66, 1.12], [0.15, 1.28], [-0.3, 1.5], [-0.62, 1.78]], 0.013);
  // --- cánh tay trên nổi khối dưới lớp y hai bên sườn; cẳng tay (ống tay áo) đặt ngang lòng ---
  for (const side of [-1, 1]) {
    add(body, limb([side * 0.8, 1.98, 0.02], [side * 0.92, 1.22, 0.12], 0.21, 0.21, 40, true), R);
    add(body, limb([side * 0.86, 1.2, 0.2], [side * 0.3, 0.9, 0.6], 0.135, 0.12, 40, true), GOLD.robePlain);
    // vạt tay áo rủ từ cẳng tay xuống lòng
    add(body, new THREE.SphereGeometry(0.2, 32, 16), GOLD.robePlain, [side * 0.6, 0.94, 0.44], [1.8, 0.62, 0.8], [0, side * 0.62, side * 0.5]);
  }
  // ấn thiền định: 2 bàn tay chồng ngửa, 2 ngón cái chạm nhau
  add(body, new THREE.SphereGeometry(0.3, 48, 24), S, [0, 0.82, 0.66], [1.15, 0.26, 0.78]);
  add(body, new THREE.SphereGeometry(0.3, 48, 24), S, [0, 0.88, 0.68], [1.05, 0.22, 0.72]);
  for (const side of [-1, 1]) add(body, new THREE.CapsuleGeometry(0.04, 0.14, 8, 16), S, [side * 0.07, 0.98, 0.8], [1, 1, 1], [0, 0, side * 1.15]);
  // hoa sen nhỏ trên tay
  {
    const lotus = new THREE.Group();
    const pg = petalGeometry(0.26, 0.34, 0.25, 0.15, 6, 10);
    for (let ring = 0; ring < 2; ring++) {
      for (let i = 0; i < 8; i++) {
        const a = ((i + ring * 0.5) / 8) * Math.PI * 2;
        const p = new THREE.Mesh(pg, ring ? GOLD.petal : GOLD.petal);
        p.position.set(Math.sin(a) * 0.05, 0, Math.cos(a) * 0.05);
        p.rotation.set(ring ? 0.35 : 0.8, a, 0, 'YXZ');
        p.scale.setScalar(ring ? 0.85 : 1);
        lotus.add(p);
      }
    }
    add(lotus, new THREE.SphereGeometry(0.06, 24, 16), GOLD.petalGold, [0, 0.1, 0]);
    lotus.position.set(0, 0.96, 0.66);
    body.add(lotus);
  }
  // --- Cổ 3 ngấn, đầu, mặt ---
  add(body, new THREE.CylinderGeometry(0.21, 0.26, 0.26, 64), S, [0, 2.26, 0]);
  for (let i = 0; i < 3; i++) add(body, new THREE.TorusGeometry(0.235 - i * 0.012, 0.01, 8, 64), S, [0, 2.17 + i * 0.06, 0.0], [1, 1, 0.92], [Math.PI / 2, 0, 0]);
  const head = new THREE.Group();
  head.position.copy(HEAD_LOCAL);
  head.rotation.x = 0.06; // hơi cúi nhìn xuống chúng sinh
  body.add(head);
  // khối mặt trái xoan: cằm thon, má đầy (các khối phụ nằm chìm trong khối đầu để mặt liền mạch)
  add(head, new THREE.SphereGeometry(0.5, 64, 48), S, [0, 0, 0], [0.86, 1.08, 0.9]);
  add(head, new THREE.SphereGeometry(0.24, 48, 24), S, [0, -0.24, 0.1], [1.1, 0.85, 1]);
  // mắt nhìn xuống: nếp mí cong mảnh; mày cong vòng cung; sống mũi thẳng nhỏ; miệng mỉm nhẹ
  for (const side of [-1, 1]) {
    add(head, new THREE.TorusGeometry(0.075, 0.008, 8, 32, Math.PI * 0.85), GOLD.dark, [side * 0.155, 0.075, 0.415], [1, 0.32, 1], [Math.PI + 0.35, 0, Math.PI * 0.075]);
    add(head, new THREE.TorusGeometry(0.12, 0.011, 8, 40, Math.PI * 0.7), S, [side * 0.155, 0.11, 0.405], [1, 0.38, 1], [0.3, 0, Math.PI * 0.15]);
  }
  add(head, new THREE.CapsuleGeometry(0.024, 0.15, 8, 16), S, [0, 0.0, 0.415], [1, 1, 0.75], [-0.2, 0, 0]);
  add(head, new THREE.SphereGeometry(0.036, 24, 12), S, [0, -0.09, 0.425], [1.4, 0.7, 0.7]);
  add(head, new THREE.TorusGeometry(0.06, 0.009, 8, 32, Math.PI * 0.75), GOLD.dark, [0, -0.19, 0.425], [1, 0.45, 1], [0, 0, Math.PI * 1.125]);
  add(head, new THREE.SphereGeometry(0.045, 24, 12), S, [0, -0.215, 0.41], [1.25, 0.45, 0.6]);
  // tai dài, dái tai trĩu (dẹt, ôm sát đầu)
  for (const side of [-1, 1]) {
    add(head, new THREE.SphereGeometry(0.1, 24, 16), S, [side * 0.42, -0.02, -0.02], [0.45, 1.5, 0.75], [0, 0, side * -0.05]);
    add(head, new THREE.SphereGeometry(0.075, 24, 16), S, [side * 0.43, -0.25, 0.0], [0.6, 1.05, 0.8]);
  }
  // bạch hào (ūrṇā)
  const urna = add(head, new THREE.SphereGeometry(0.03, 20, 12), new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffe08a, emissiveIntensity: 1.5, roughness: 0.2 }), [0, 0.2, 0.44]);
  urna.name = 'urna';
  // tóc xoắn ốc (instanced) + nhục kế + ngọc
  add(head, new THREE.SphereGeometry(0.5, 64, 40, 0, Math.PI * 2, 0, Math.PI * 0.42), GOLD.dark, [0, 0.06, -0.01], [0.88, 1.1, 0.93], [-0.12, 0, 0]);
  add(head, new THREE.SphereGeometry(0.25, 48, 32), GOLD.dark, [0, 0.55, -0.03]);
  {
    const curlGeo = new THREE.SphereGeometry(0.045, 8, 6);
    const pts = [];
    const shell = (cy, rx, ry, rz, maxPolar, n, cz = 0) => {
      for (let i = 0; i < n; i++) {
        const y = 1 - (i / (n - 1)) * (1 - Math.cos(maxPolar));
        const rr = Math.sqrt(Math.max(0, 1 - y * y));
        const phi = i * 2.39996;
        const x = Math.cos(phi) * rr;
        const z = Math.sin(phi) * rr;
        // đường chân tóc: trán để trống
        if (z > 0.55 && y < 0.62 && cy < 0.3) continue;
        pts.push([x * rx, cy + y * ry, cz + z * rz]);
      }
    };
    shell(0.04, 0.455, 0.55, 0.48, 1.32, 340, -0.01);
    shell(0.55, 0.265, 0.27, 0.265, 1.45, 110, -0.03);
    const curls = new THREE.InstancedMesh(curlGeo, GOLD.dark, pts.length);
    pts.forEach((p, i) => curls.setMatrixAt(i, _m.makeTranslation(p[0], p[1], p[2])));
    head.add(curls);
  }
  add(head, new THREE.SphereGeometry(0.06, 24, 16), new THREE.MeshStandardMaterial({ color: 0xff6a4a, emissive: 0xff3a1a, emissiveIntensity: 0.8, roughness: 0.15, metalness: 0.2 }), [0, 0.68, 0.18]);
  add(head, new THREE.ConeGeometry(0.05, 0.16, 24), GOLD.skin, [0, 0.84, -0.03]);
}
/** Gộp các mesh tĩnh cùng vật liệu trong 1 nhóm thành 1 mesh (giữ pháp tuyến mịn) -> ít draw call. */
function mergeStaticByMaterial(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const victims = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.name === 'urna' || o.userData.keep) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g);
    victims.push(o);
  });
  victims.forEach((o) => o.parent.remove(o));
  for (const [mat, geos] of buckets) {
    const total = geos.reduce((n, g) => n + g.attributes.position.count, 0);
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    let o3 = 0;
    let o2 = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, o3);
      nor.set(g.attributes.normal.array, o3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o2);
      o3 += g.attributes.position.count * 3;
      o2 += g.attributes.position.count * 2;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    group.add(new THREE.Mesh(out, mat));
  }
}
mergeStaticByMaterial(buddha);
buddha.scale.setScalar(1.45);
buddha.position.set(0, ALTAR_Y, -16.4);
scene.add(buddha);
const HEAD_Y = ALTAR_Y + (1.6 + HEAD_LOCAL.y) * 1.45;
// Đèn riêng cho tượng: spot nhẹ chiếu mặt + đèn viền phía sau để tách khối ở mọi góc máy
{
  const face = new THREE.SpotLight(0xffe2b0, 22, 14, 0.32, 0.7, 1.4);
  face.position.set(0, HEAD_Y + 2.5, -9.5);
  face.target.position.set(0, HEAD_Y - 1.2, -16.4);
  scene.add(face, face.target);
  const rim = new THREE.DirectionalLight(0xffd7a0, 1.4);
  rim.position.set(3, 14, -26);
  rim.target.position.set(0, 4, -16);
  scene.add(rim, rim.target);
}

// Hào quang chạm: đĩa chạm sau đầu + vành phát sáng + viền lửa (đầu và thân) + tia sáng
const raysTex = canvasTexture(512, 512, (ctx, w) => {
  ctx.translate(w / 2, w / 2);
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
const haloCarveTex = canvasTexture(512, 512, (ctx, w) => {
  ctx.translate(w / 2, w / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
  g.addColorStop(0, '#fff0bf');
  g.addColorStop(0.5, '#e2a948');
  g.addColorStop(1, '#7a420e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, w / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(100,45,0,0.6)';
  ctx.lineWidth = 4;
  for (const r of [70, 118, 176, 236]) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = 3;
  for (let i = 0; i < 24; i++) {
    ctx.rotate(Math.PI / 12);
    ctx.beginPath();
    ctx.ellipse(0, -147, 11, 25, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -205, 9, 0, Math.PI * 2);
    ctx.stroke();
  }
}).tex;
const haloGroup = new THREE.Group();
haloGroup.position.set(0, HEAD_Y + 0.12, -17.55);
const haloCarve = new THREE.Mesh(new THREE.CircleGeometry(1.25, 96), new THREE.MeshStandardMaterial({ map: haloCarveTex, metalness: 0.85, roughness: 0.35, emissive: 0x6a3a00, emissiveIntensity: 0.55 }));
const rimMat = new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb030, emissiveIntensity: 1.2, metalness: 0.6, roughness: 0.3 });
const haloRim = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.06, 16, 128), rimMat);
const haloRim2 = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.025, 12, 96), rimMat);
haloRim2.position.z = 0.02;
// viền lửa/mây quanh đầu + quanh thân (mandorla)
const flameGeo = petalGeometry(0.42, 0.2, 0.1, -0.15, 4, 8);
const flamePts = [];
for (let i = 0; i < 30; i++) flamePts.push([Math.sin((i / 30) * Math.PI * 2) * 1.32, Math.cos((i / 30) * Math.PI * 2) * 1.32, (i / 30) * Math.PI * 2, 0.9]);
for (let i = 0; i < 34; i++) {
  const a = -Math.PI * 0.62 + (i / 33) * Math.PI * 1.24;
  flamePts.push([Math.sin(a) * 3.15, -3.35 + Math.cos(a) * 3.95, Math.atan2(Math.sin(a) * 3.95, Math.cos(a) * 3.15), 1.2]);
}
const flames = new THREE.InstancedMesh(flameGeo, GOLD.dark, flamePts.length);
flamePts.forEach(([x, y, a, s], i) => {
  _m.compose(_v.set(x, y, -0.02), _q.setFromEuler(_e.set(0, 0, -a, 'XYZ')), _s.set(s, s, s));
  flames.setMatrixAt(i, _m);
});
const haloGlow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), additive(glowTex, 0xffc861, 0.55));
haloGlow.position.z = -0.06;
const haloRays = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), additive(raysTex, 0xffd27a, 0.3));
haloRays.position.z = -0.1;
const mandorlaRim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 10, 128, Math.PI * 1.24), rimMat);
mandorlaRim.scale.set(3.0, 3.8, 1);
mandorlaRim.rotation.z = Math.PI / 2 - Math.PI * 0.62 + Math.PI;
mandorlaRim.position.set(0, -3.35, 0.03);
const mandorla = new THREE.Mesh(new THREE.PlaneGeometry(7, 9), additive(softTex, 0xff9a3a, 0.36));
mandorla.position.set(0, -3.0, -0.2);
haloGroup.add(mandorla, haloRays, haloGlow, haloCarve, haloRim, haloRim2, flames, mandorlaRim);
scene.add(haloGroup);

// Đèn cầy (2 đèn điểm thật) + bình sen
const flameMat = additive(glowTex, 0xffb050, 1);
const candleFlames = [];
for (const side of [-1, 1]) {
  for (const x of [3.2, 4.4]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 12), M.candle);
    c.position.set(side * x, ALTAR_Y + 0.55, -14.2);
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.2, 12), M.goldTrim);
    holder.position.set(side * x, ALTAR_Y + 0.1, -14.2);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.8), flameMat);
    f.position.set(side * x, ALTAR_Y + 1.35, -14.2);
    candleFlames.push(f);
    scene.add(c, holder, f);
  }
  const cl = new THREE.PointLight(0xffa040, 6, 9, 1.8);
  cl.position.set(side * 3.8, ALTAR_Y + 1.6, -13.8);
  scene.add(cl);
  const vase = new THREE.Mesh(lathe([[0, 0], [0.3, 0.05], [0.42, 0.4], [0.22, 0.85], [0.3, 1.1]], 20), M.bronze);
  vase.position.set(side * 2.3, ALTAR_Y, -13.9);
  scene.add(vase);
  for (let i = 0; i < 3; i++) {
    const bud = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), M.lotusPink);
    bud.scale.set(1, 1.5, 1);
    bud.position.set(side * 2.3 + (i - 1) * 0.25, ALTAR_Y + 1.5 + (i % 2) * 0.25, -13.9);
    const stem = new THREE.Mesh(limb([side * 2.3, ALTAR_Y + 1.0, -13.9], [bud.position.x, bud.position.y - 0.2, -13.9], 0.03), M.leaf);
    scene.add(bud, stem);
  }
}

// ============================================================================
// 7. LƯ HƯƠNG + NHANG + KHÓI, CHUÔNG, MÕ, BỒ ĐOÀN LẠY TRƯỚC LƯ
// ============================================================================
const BURNER = new THREE.Vector3(0, 0, -10.2);
{
  const g = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, 0.7, 8), M.stone);
  stand.position.y = 0.35;
  const pot = new THREE.Mesh(lathe([[0, 0], [0.7, 0.05], [0.95, 0.4], [0.9, 0.75], [0.75, 0.82], [0.8, 0.9]], 32), M.bronze);
  pot.position.y = 0.95;
  g.add(stand, pot);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.add(new THREE.Mesh(limb([Math.sin(a) * 0.55, 1.0, Math.cos(a) * 0.55], [Math.sin(a) * 0.8, 0.7, Math.cos(a) * 0.8], 0.09), M.bronze));
  }
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 16), M.bronze);
    ear.position.set(side * 0.82, 1.98, 0);
    ear.rotation.y = Math.PI / 2;
    g.add(ear);
  }
  g.position.copy(BURNER);
  scene.add(g);
}
const BURNER_TOP = BURNER.y + 1.85;
const stickGeo = new THREE.CylinderGeometry(0.018, 0.018, 1.0, 4);
stickGeo.translate(0, 0.5, 0);
const MAX_STICKS = 15;
const sticks = new THREE.InstancedMesh(stickGeo, new THREE.MeshStandardMaterial({ color: 0xc23a1c, roughness: 0.8 }), MAX_STICKS);
const tips = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16), additive(glowTex, 0xff6a1a, 1), MAX_STICKS);
const stickPos = [];
for (let i = 0; i < MAX_STICKS; i++) {
  const a = i * 2.39996;
  const r = 0.12 + 0.48 * Math.sqrt((i + 0.5) / MAX_STICKS);
  stickPos.push({
    p: new THREE.Vector3(BURNER.x + Math.sin(a) * r, BURNER_TOP - 0.05, BURNER.z + Math.cos(a) * r * 0.8),
    tilt: new THREE.Euler(Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12),
    len: rand(0.8, 1.05),
    tip: new THREE.Vector3()
  });
}
let visibleSticks = 9;
function layoutSticks() {
  for (let i = 0; i < MAX_STICKS; i++) {
    const s = stickPos[i];
    const on = i < visibleSticks ? 1 : 0;
    _m.compose(s.p, _q.setFromEuler(s.tilt), _s.set(on || 0.0001, s.len * on || 0.0001, on || 0.0001));
    sticks.setMatrixAt(i, _m);
    s.tip.set(0, s.len, 0).applyEuler(s.tilt).add(s.p);
  }
  sticks.instanceMatrix.needsUpdate = true;
}
layoutSticks();
scene.add(sticks, tips);

// Bồ đoàn lạy trước lư hương (3 làn)
const BOW_SPOTS = [new THREE.Vector3(-1.0, 0, -8.1), new THREE.Vector3(1.0, 0, -8.1), new THREE.Vector3(0, 0, -7.6)];

class Particles {
  constructor(count, size, tex) {
    this.n = count;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.items = Array.from({ length: count }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1 }));
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
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
  update(dt, drag = 0, wobble = 0, t = 0, gravity = 0) {
    for (let i = 0; i < this.n; i++) {
      const it = this.items[i];
      if (it.life <= 0) {
        this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
        continue;
      }
      it.life -= dt;
      it.vy -= gravity * dt;
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
const flare = { burner: 0, halo: 0, bellSwing: 0 };
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

const BELL_POS = new THREE.Vector3(-4.6, 0, -11.2);
const bellPivot = new THREE.Group();
{
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4, 0.22), M.wood);
    post.position.set(side * 1.0, 2, 0);
    g.add(post);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.26, 0.3), M.lacquer);
  top.position.y = 4.05;
  g.add(top);
  bellPivot.position.y = 3.9;
  const bell = new THREE.Mesh(lathe([[0.1, 0], [0.42, -0.1], [0.55, -0.6], [0.62, -1.3], [0.78, -1.55], [0, -1.55]], 28), M.bronze);
  bell.position.y = -0.15;
  bellPivot.add(bell, new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 8, 12), M.bronze));
  g.add(bellPivot);
  g.position.copy(BELL_POS);
  g.rotation.y = 0.35;
  scene.add(g);
}
const FISH_POS = new THREE.Vector3(4.6, 0, -11.2);
const fish = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 16), new THREE.MeshStandardMaterial({ color: 0x7a3a18, roughness: 0.35 }));
{
  const g = new THREE.Group();
  const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.35, 16), new THREE.MeshStandardMaterial({ map: TEX.brocade, roughness: 0.8 }));
  cushion.position.y = 0.95;
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 0.8, 8), M.wood);
  table.position.y = 0.4;
  fish.scale.set(1.15, 0.8, 1);
  fish.position.y = 1.6;
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 6, 18), M.lacquerDark);
  mouth.position.set(0, 1.6, 0.66);
  g.add(table, cushion, fish, mouth);
  g.position.copy(FISH_POS);
  scene.add(g);
}
const ringPool = Array.from({ length: 4 }, () => {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  scene.add(m);
  return { m, t: 0, dur: 1, max: 1, active: false };
});
function shockwave(pos, maxR = 14, dur = 2.2, y = 0.05) {
  const r = ringPool.find((x) => !x.active) || ringPool[0];
  Object.assign(r, { active: true, t: 0, dur, max: maxR });
  r.m.position.set(pos.x, y, pos.z);
  r.m.visible = true;
}

// Đèn lồng treo (phát sáng + sprite; không dùng đèn điểm thật)
const hangingLanterns = [];
const lanternGroup = new THREE.Group();
{
  const lanternGeo = new THREE.SphereGeometry(0.5, 16, 12);
  const capGeo = new THREE.CylinderGeometry(0.26, 0.3, 0.12, 12);
  for (const side of [-1, 1]) {
    for (const z of [8.1, 3.1, -1.9, -6.9]) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(lanternGeo, M.lantern);
      body.scale.set(1, 1.2, 1);
      const capT = new THREE.Mesh(capGeo, M.goldTrim);
      capT.position.y = 0.6;
      const capB = capT.clone();
      capB.position.y = -0.6;
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3, 3), M.lacquerDark);
      cord.position.y = 2.1;
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), additive(glowTex, 0xff7a2a, 0.5));
      glow.position.set(side * 4.6, 8.4, z);
      g.add(body, capT, capB, cord);
      g.position.set(side * 4.6, 8.4, z);
      hangingLanterns.push(glow);
      lanternGroup.add(g);
      scene.add(glow);
    }
  }
  // 8 đèn lồng gộp theo vật liệu -> 3 draw call (quầng sáng vẫn là sprite riêng quay theo camera)
  mergeStaticByMaterial(lanternGroup);
  scene.add(lanternGroup);
}

// ============================================================================
// 8. SÂN CHÙA: gạch đá, lối đi, đèn đá, cây, CỔNG TAM QUAN, THÁP PHƯỚC DUYÊN 7 TẦNG
// ============================================================================
{
  // Bầu trời hoàng hôn xứ Huế
  const skyTex = canvasTexture(16, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0d0f2a');
    g.addColorStop(0.45, '#2b2350');
    g.addColorStop(0.62, '#7a3a4a');
    g.addColorStop(0.72, '#d77a46');
    g.addColorStop(1, '#2a1a14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }).tex;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(110, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  sky.position.set(0, 0, 20);
  scene.add(sky);

  const court = new THREE.Mesh(new THREE.PlaneGeometry(60, 50), M.courtyard);
  court.rotation.x = -Math.PI / 2;
  court.position.set(0, COURT_Y, HALL_FRONT + 25.4);
  court.receiveShadow = true;
  scene.add(court);
  // nền ngoài hai bên điện (để nhìn từ trên không thấy hở)
  for (const side of [-1, 1]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(40, hallLen + 2), M.courtyard);
    g.rotation.x = -Math.PI / 2;
    g.position.set(side * 30, COURT_Y, (HALL_FRONT + HALL_BACK) / 2);
    scene.add(g);
  }
  const path = new THREE.Mesh(new THREE.PlaneGeometry(3, 24), new THREE.MeshStandardMaterial({ color: 0xb8a890, roughness: 0.8 }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, COURT_Y + 0.01, HALL_FRONT + 13);
  scene.add(path);
}
const GATE_Z = 27;
const TOWER_Z = 37;
const gateGlows = [];
{
  // Cổng Tam Quan: 3 lối, mái 2 tầng ngói đen, bờ nóc vàng, đầu đao cong
  const g = new THREE.Group();
  const pillar = new THREE.BoxGeometry(0.7, 5, 0.7);
  for (const x of [-4.4, -1.6, 1.6, 4.4]) {
    const p = new THREE.Mesh(pillar, M.lacquer);
    p.position.set(x, 2.5, 0);
    g.add(p);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), M.stone);
    base.position.set(x, 0.25, 0);
    g.add(base);
  }
  const roof = (w, d, y, h) => {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1, h, 4, 1), M.roofTile);
    r.rotation.y = Math.PI / 4;
    r.scale.set(w / 1.41, 1, d / 1.41);
    const wrap = new THREE.Group();
    wrap.add(r);
    wrap.position.y = y;
    g.add(wrap);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.45, 0.14, 0.2), M.goldTrim);
    ridge.position.y = y + h / 2 - 0.02;
    g.add(ridge);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), M.goldTrim);
        tip.position.set((sx * w) / 2, y - h / 2 + 0.12, (sz * d) / 2);
        g.add(tip);
      }
    }
  };
  const beam = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 0.9), M.lacquerDark);
  beam.position.y = 5.1;
  g.add(beam);
  roof(5.2, 3.4, 6.5, 1.6);
  roof(3.8, 2.6, 7.9, 1.2);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.6), signMat);
  sign.position.set(0, 4.5, 0.46);
  g.add(sign);
  const signBack = sign.clone();
  signBack.position.z = -0.46;
  signBack.rotation.y = Math.PI;
  g.add(signBack);
  mergeStaticByMaterial(g);
  g.position.set(0, COURT_Y, GATE_Z);
  scene.add(g);
  // mái hai lối phụ
  for (const sx of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1, 1.1, 4, 1), M.roofTile);
    r.rotation.y = Math.PI / 4;
    r.scale.set(3.4 / 1.41, 1, 2.4 / 1.41);
    r.position.set(sx * 3.0, COURT_Y + 5.9, GATE_Z);
    scene.add(r);
  }
  // Đèn đá dọc lối đi
  const lamps = new THREE.Group();
  const lampGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.3, 6);
  const lampTop = new THREE.ConeGeometry(0.5, 0.45, 6);
  for (const z of [17.5, 21, 24.5]) {
    for (const sx of [-1, 1]) {
      const l = new THREE.Mesh(lampGeo, M.stone);
      l.position.set(sx * 2.3, COURT_Y + 0.65, z);
      const t = new THREE.Mesh(lampTop, M.stone);
      t.position.set(sx * 2.3, COURT_Y + 1.6, z);
      const lightBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), new THREE.MeshBasicMaterial({ color: 0xffc070, fog: false }));
      lightBox.position.set(sx * 2.3, COURT_Y + 1.35, z);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), additive(glowTex, 0xffa040, 0.55));
      gl.position.copy(lightBox.position);
      gateGlows.push(gl);
      lamps.add(l, t, lightBox);
      scene.add(gl);
    }
  }
  mergeStaticByMaterial(lamps);
  scene.add(lamps);
  // Cây xanh hai bên sân
  const foliage = new THREE.IcosahedronGeometry(1.6, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 2.4, 6);
  const treePos = [[-8, 18], [8, 19], [-10, 24], [10, 25], [-7.5, 30], [7.5, 31], [-12, 33], [12, 34]];
  const leaves = new THREE.InstancedMesh(foliage, M.leaf, treePos.length * 2);
  const trunks = new THREE.InstancedMesh(trunkGeo, M.trunk, treePos.length);
  treePos.forEach(([x, z], i) => {
    trunks.setMatrixAt(i, _m.makeTranslation(x, COURT_Y + 1.2, z));
    leaves.setMatrixAt(i * 2, _m.compose(_v.set(x, COURT_Y + 3.2, z), _q.identity(), _s.set(1.2, 1, 1.2)));
    leaves.setMatrixAt(i * 2 + 1, _m.compose(_v.set(x + 0.4, COURT_Y + 4.4, z - 0.3), _q.identity(), _s.set(0.8, 0.8, 0.8)));
  });
  scene.add(leaves, trunks);
}
{
  // Tháp Phước Duyên: bát giác 7 tầng, mỗi tầng có mái ngói + ô cửa vòm, chóp đồng
  const tower = new THREE.Group();
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.9, 0.8, 8), M.stone);
  plat.position.y = 0.4;
  tower.add(plat);
  let y = 0.8;
  for (let i = 0; i < 7; i++) {
    const r = 2.3 - i * 0.22;
    const h = 2.05 - i * 0.1;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r, h, 8, 1), M.towerWall);
    body.position.y = y + h / 2;
    tower.add(body);
    const eave = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r + 0.6, 0.38, 8, 1), M.roofTile);
    eave.position.y = y + h + 0.1;
    tower.add(eave);
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.62, r + 0.62, 0.06, 8, 1), M.goldTrim);
    trim.position.y = y + h - 0.08;
    tower.add(trim);
    y += h + 0.28;
  }
  const finial = [
    [new THREE.CylinderGeometry(0.35, 0.55, 0.5, 8), 0.25],
    [new THREE.SphereGeometry(0.42, 16, 10), 0.8],
    [new THREE.CylinderGeometry(0.08, 0.12, 1.2, 8), 1.6],
    [new THREE.SphereGeometry(0.22, 12, 8), 2.25],
    [new THREE.ConeGeometry(0.12, 0.6, 8), 2.7]
  ];
  for (const [geo, dy] of finial) {
    const f = new THREE.Mesh(geo, M.bronze);
    f.position.y = y + dy;
    tower.add(f);
  }
  mergeStaticByMaterial(tower);
  tower.position.set(0, COURT_Y, TOWER_Z);
  scene.add(tower);
  const towerGlow = new THREE.Mesh(new THREE.PlaneGeometry(10, 18), additive(softTex, 0xffa060, 0.18));
  towerGlow.position.set(0, COURT_Y + 8, TOWER_Z - 3);
  scene.add(towerGlow);
}
const GATE_SPAWN = new THREE.Vector3(0, COURT_Y, GATE_Z - 1.2);
const DOOR_IN = new THREE.Vector3(0, 0, HALL_FRONT - 1.0);

// ============================================================================
// 9. LÀN ĐÈN HOA ĐĂNG + CÁNH SEN RƠI
// ============================================================================
const skyLanterns = Array.from({ length: 5 }, () => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.7, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb35a, side: THREE.DoubleSide }));
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
const PETALS = 160;
const petalGeo2 = new THREE.SphereGeometry(0.16, 6, 4);
petalGeo2.scale(1, 0.25, 0.6);
const petals = new THREE.InstancedMesh(petalGeo2, new THREE.MeshBasicMaterial({ color: 0xffffff }), PETALS);
petals.frustumCulled = false;
const petalState = Array.from({ length: PETALS }, (_, i) => ({ x: 0, y: -10, z: 0, vy: 0, spin: 0, phase: i }));
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
    p.y = rand(9, 20);
    p.z = rand(-15, 5);
    p.vy = rand(1.2, 2.4);
    p.spin = rand(1, 3);
  });
}

// ============================================================================
// 10. PHẬT TỬ ÁO LAM — RIG KHỚP DỰNG BẰNG INSTANCEDMESH (mỗi bộ phận 1 draw call)
// ============================================================================
// Kích thước (đơn vị ~ mét)
const THIGH = 0.42;
const SHIN = 0.4;
const STAND_HIP = THIGH + SHIN + 0.05;
const KNEEL_HIP = 0.43; // ngồi trên gót, trên bồ đoàn cao 0.16
const UPPER_ARM = 0.27;
const FORE_ARM = 0.24;
const SHOULDER_Y = 0.46;
const SHOULDER_X = 0.19;
const NECK_Y = 0.51;
const STRIDE = 0.7; // quãng đường cho mỗi nửa chu kỳ bước

const partGeos = {
  torso: mergeColored([
    { geo: lathe([[0, -0.02], [0.17, -0.02], [0.165, 0.12], [0.18, 0.3], [0.205, 0.42], [0.17, 0.48], [0.08, 0.52], [0, 0.53]], 18), scale: [1, 1, 0.74] },
    // vạt cài khuy bên phải đặc trưng áo dài / áo tràng
    { geo: new THREE.BoxGeometry(0.02, 0.32, 0.02), color: 0x9fb0c0, pos: [0.07, 0.3, -0.128] },
    { geo: new THREE.TorusGeometry(0.075, 0.012, 6, 16), color: 0xb7c4cf, pos: [0, 0.5, 0], rot: [Math.PI / 2, 0, 0] }
  ]),
  skirt: mergeColored([
    { geo: lathe([[0, 0.06], [0.175, 0.06], [0.2, -0.1], [0.235, -0.28], [0.265, -0.42], [0, -0.42]], 18), scale: [1, 1, 0.8] }
  ]),
  head: mergeColored([
    { geo: new THREE.CylinderGeometry(0.05, 0.058, 0.1, 10), pos: [0, 0.04, 0] },
    { geo: new THREE.SphereGeometry(0.15, 18, 14), pos: [0, 0.2, 0], scale: [0.92, 1.06, 0.98] },
    { geo: new THREE.SphereGeometry(0.018, 6, 5), color: 0x24140c, pos: [-0.052, 0.215, -0.135] },
    { geo: new THREE.SphereGeometry(0.018, 6, 5), color: 0x24140c, pos: [0.052, 0.215, -0.135] },
    { geo: new THREE.BoxGeometry(0.05, 0.008, 0.01), color: 0x3a2418, pos: [-0.052, 0.248, -0.137], rot: [0, 0, 0.12] },
    { geo: new THREE.BoxGeometry(0.05, 0.008, 0.01), color: 0x3a2418, pos: [0.052, 0.248, -0.137], rot: [0, 0, -0.12] },
    { geo: new THREE.SphereGeometry(0.02, 6, 5), color: 0xe8b090, pos: [0, 0.19, -0.148], scale: [0.8, 1.2, 1] },
    { geo: new THREE.SphereGeometry(0.022, 6, 5), color: 0xb9605a, pos: [0, 0.145, -0.13], scale: [1.6, 0.5, 0.7] },
    { geo: new THREE.SphereGeometry(0.03, 6, 5), pos: [-0.14, 0.2, 0.0], scale: [0.6, 1.3, 1] },
    { geo: new THREE.SphereGeometry(0.03, 6, 5), pos: [0.14, 0.2, 0.0], scale: [0.6, 1.3, 1] }
  ]),
  hair: mergeColored([
    { geo: new THREE.SphereGeometry(0.168, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), pos: [0, 0.205, 0.016], rot: [0.45, 0, 0], scale: [0.96, 1.07, 1.02] },
    { geo: new THREE.SphereGeometry(0.068, 10, 8), pos: [0, 0.27, 0.15] }
  ]),
  upperArm: mergeColored([{ geo: new THREE.CylinderGeometry(0.06, 0.054, UPPER_ARM, 10), pos: [0, -UPPER_ARM / 2, 0] }, { geo: new THREE.SphereGeometry(0.062, 10, 8) }]),
  foreArm: mergeColored([{ geo: new THREE.CylinderGeometry(0.06, 0.05, FORE_ARM - 0.03, 10), pos: [0, -(FORE_ARM - 0.03) / 2, 0] }, { geo: new THREE.SphereGeometry(0.055, 8, 6) }]),
  hand: mergeColored([{ geo: new THREE.SphereGeometry(0.045, 10, 8), pos: [0, -0.055, -0.005], scale: [0.62, 1.55, 0.42] }]),
  thigh: mergeColored([{ geo: new THREE.CylinderGeometry(0.068, 0.078, THIGH, 10), pos: [0, -THIGH / 2, 0] }, { geo: new THREE.SphereGeometry(0.078, 10, 8) }]),
  shin: mergeColored([{ geo: new THREE.CylinderGeometry(0.046, 0.06, SHIN, 10), pos: [0, -SHIN / 2, 0] }, { geo: new THREE.SphereGeometry(0.062, 10, 8) }]),
  foot: mergeColored([{ geo: new THREE.BoxGeometry(0.085, 0.05, 0.21), color: 0x3a2216, pos: [0, -0.03, -0.06] }])
};
const PAIRED = { upperArm: true, foreArm: true, hand: true, thigh: true, shin: true, foot: true };
const avatarMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
const parts = {};
for (const [name, geo] of Object.entries(partGeos)) {
  const n = PAIRED[name] ? POOL * 2 : POOL;
  const im = new THREE.InstancedMesh(geo, avatarMat, n);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.setColorAt(0, _c.set(0xffffff));
  im.instanceColor.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  im.castShadow = SHADOWS;
  im.count = 0;
  parts[name] = im;
  scene.add(im);
}
const auraMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), additive(glowTex, 0xffffff, 1), POOL);
auraMesh.setColorAt(0, _c.set(0));
auraMesh.frustumCulled = false;
auraMesh.count = 0;
scene.add(auraMesh);
const blobMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), POOL);
blobMesh.frustumCulled = false;
blobMesh.count = 0;
blobMesh.visible = !SHADOWS;
scene.add(blobMesh);

const ROBE_TONES = [0x7790a8, 0x6f879e, 0x8297ab, 0x6a8299, 0x8a9db0, 0x7a8ca0];
const PANTS_TONES = [0x2a2e38, 0x3a4250, 0x1e2026, 0x56677a];
const SKIN_TONES = [0xf0c49c, 0xe8b88e, 0xdba47c, 0xf4ccaa, 0xe2ad84];
const HAIR_TONES = [0x1d1612, 0x2a1d16, 0x3a2a20, 0x1a1a1e, 0x8c8784, 0x4a3324, 0xb8b4b0];

// Chỗ ngồi: đệm gấm thường | đài sen hồng (đã tặng quà) | đài sen vàng phát sáng (≥ 100 xu)
const cushionGeo = mergeColored([
  { geo: new THREE.CylinderGeometry(0.46, 0.5, 0.16, 20), pos: [0, 0.08, 0] },
  { geo: new THREE.TorusGeometry(0.46, 0.035, 4, 20), color: 0xf2c35b, pos: [0, 0.16, 0], rot: [Math.PI / 2, 0, 0] },
  ...Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return { geo: new THREE.SphereGeometry(0.16, 6, 4), color: i % 2 ? 0xffb0b8 : 0xff8f9c, pos: [Math.sin(a) * 0.5, 0.06, Math.cos(a) * 0.5], rot: [0, a, 0], scale: [0.7, 0.35, 1.2] };
  })
]);
const thronePetal = petalGeometry(0.34, 0.3, 0.2, 0.2, 2, 4);
// Đài sen: đế + 2 vòng cánh cong nở ra (xoay theo thứ tự YXZ rồi mới gộp)
const throneGeo = (() => {
  const petalsSpec = [];
  for (let i = 0; i < 12; i++) petalsSpec.push([(i / 12) * Math.PI * 2, 1.05, 1, 0.5, 0.0, i % 2 ? 0xff8fa8 : 0xff6f90]);
  for (let i = 0; i < 10; i++) petalsSpec.push([((i + 0.5) / 10) * Math.PI * 2, 0.55, 0.8, 0.44, 0.08, 0xffb3c4]);
  const list = [{ geo: new THREE.CylinderGeometry(0.44, 0.5, 0.16, 24), color: 0xf6a0b4, pos: [0, 0.08, 0] }];
  for (const [a, tilt, sc, r, y, color] of petalsSpec) {
    const g = thronePetal.clone();
    g.applyMatrix4(_m.compose(_v.set(Math.sin(a) * r, y, Math.cos(a) * r), _q.setFromEuler(_e.set(tilt, a, 0, 'YXZ')), _s.set(sc, sc, sc)));
    list.push({ geo: g, color });
  }
  return mergeColored(list);
})();
const cushionMat = new THREE.MeshStandardMaterial({ map: TEX.brocade, vertexColors: true, roughness: 0.75 });
const cushions = new THREE.InstancedMesh(cushionGeo, cushionMat, SEATS + BOW_SPOTS.length);
const pinkThrones = new THREE.InstancedMesh(throneGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x401018, emissiveIntensity: 0.4 }), SEATS);
const goldThrones = new THREE.InstancedMesh(throneGeo, new THREE.MeshStandardMaterial({ color: 0xffd36a, metalness: 1, roughness: 0.3, side: THREE.DoubleSide, emissive: 0x8a5200, emissiveIntensity: 0.7 }), SEATS);
const throneGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.0, 2.0).rotateX(-Math.PI / 2), additive(glowTex, 0xffc24a, 0.75), SEATS);
for (const m of [cushions, pinkThrones, goldThrones]) m.receiveShadow = true;
for (const m of [pinkThrones, goldThrones, throneGlow]) {
  for (let i = 0; i < SEATS; i++) {
    m.setMatrixAt(i, _m.makeScale(0, 0, 0));
    if (m !== throneGlow) m.setColorAt(i, _c.setRGB(1, 1, 1));
  }
}

// Bố trí: ghế 0..7 = HÀNG ĐẦU GIỮ CHỖ (sát lư hương/bàn thờ) cho top 8 người tặng quà:
//   ghế 0 chính giữa, 1..7 xen kẽ trái/phải ra ngoài.
// Ghế 8..39 = chỗ thường 4 hàng × 8; ghế 8 = hàng gần camera "hall" nhất, lấp dần về bàn thờ.
const VIP_SEATS = 8;
const VIP_Z = -6.0;
const VIP_X = [0, -1.75, 1.75, -3.05, 3.05, -4.35, 4.35, -5.65];
const ROW_Z = [0.9, -0.8, -2.5, -4.2];
const COL_X = [1.6, 2.6, 3.6, 4.6];
const LANE_X = 0.95; // làn đi bộ hai bên mép thảm
const seatPos = [];
for (let i = 0; i < SEATS; i++) {
  if (i < VIP_SEATS) {
    seatPos.push(new THREE.Vector3(VIP_X[i], 0, VIP_Z));
    continue;
  }
  const j = i - VIP_SEATS;
  const row = Math.floor(j / 8);
  const k = j % 8;
  const side = k % 2 === 0 ? -1 : 1;
  const col = Math.floor(k / 2);
  const spread = 0.82 + row * 0.05;
  seatPos.push(new THREE.Vector3(side * (COL_X[0] + (COL_X[col] - COL_X[0]) * spread), 0, ROW_Z[row]));
}
const ROW_GAP = 0.875; // lối đi giữa 2 hàng (phía cửa)
const seatState = Array.from({ length: SEATS }, () => ({ occupied: false, tier: 'normal' }));
/** Vẽ lại toàn bộ chỗ ngồi (gọi khi roster đổi). Gói các instance đang dùng liền nhau -> không tốn đỉnh cho chỗ ẩn. */
function refreshSeats() {
  let nc = 0;
  let np = 0;
  let ng = 0;
  let nl = 0;
  const putC = (p, sc, bright) => {
    cushions.setMatrixAt(nc, _m.compose(_v.set(p.x, 0, p.z), _q.identity(), _s.set(sc[0], sc[1], sc[0])));
    cushions.setColorAt(nc++, bright ? _c.setRGB(1, 1, 1) : _c.setRGB(0.22, 0.15, 0.13));
  };
  for (let i = 0; i < SEATS; i++) {
    const p = seatPos[i];
    const { occupied, tier } = seatState[i];
    const vip = i < VIP_SEATS;
    // Hàng đầu trống = đài sen vàng giữ chỗ (mờ); chỗ thường trống = đệm nhỏ tối
    const kind = vip && !occupied ? 'goldDim' : !occupied ? 'empty' : tier === 'goldLotus' ? 'gold' : tier === 'lotus' ? 'pink' : 'cushion';
    if (kind === 'empty') putC(p, [0.78, 0.6], false);
    else if (kind === 'cushion') putC(p, [1, 1], true);
    else if (kind === 'pink') pinkThrones.setMatrixAt(np++, _m.makeTranslation(p.x, 0, p.z));
    else {
      goldThrones.setMatrixAt(ng, _m.makeTranslation(p.x, 0, p.z));
      goldThrones.setColorAt(ng++, kind === 'goldDim' ? _c.setRGB(0.45, 0.38, 0.3) : _c.setRGB(1, 1, 1));
      if (kind === 'gold') throneGlow.setMatrixAt(nl++, _m.makeTranslation(p.x, 0.03, p.z));
    }
  }
  for (const p of BOW_SPOTS) putC(p, [1, 1], true);
  cushions.count = nc;
  pinkThrones.count = np;
  goldThrones.count = ng;
  throneGlow.count = nl;
  for (const m of [cushions, pinkThrones, goldThrones, throneGlow]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}
refreshSeats();
scene.add(cushions, pinkThrones, goldThrones, throneGlow);

// Chỗ đứng chờ ngoài sân (16 người, hai bên lối đi giữa đèn đá và cổng Tam Quan)
const WAIT_SPOTS = [];
for (const z of [18.6, 20.2, 21.8, 23.4]) for (const x of [-3.4, 3.4, -4.5, 4.5]) WAIT_SPOTS.push(new THREE.Vector3(x + rand(-0.15, 0.15), 0, z + rand(-0.2, 0.2)));

// ----------------------------------------------------------------------------
// Trạng thái Phật tử
// ----------------------------------------------------------------------------
let toneSeed = 0;
const avatars = Array.from({ length: POOL }, (_, i) => newAvatar(i));
function newAvatar(i) {
  return {
    idx: i,
    active: false,
    uid: '',
    name: '',
    seat: -1,
    member: false,
    pos: new THREE.Vector3(),
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
    glowColor: new THREE.Color(0xffd27a),
    script: null,
    busy: false,
    leaving: false,
    tag: null,
    lastActive: 0,
    bobY: 0,
    tones: null,
    head: new THREE.Vector3(),
    tier: 'normal',
    vipRank: 0,
    waiting: false,
    waitSpot: -1,
    atSeat: -1,
    bowSpot: -1,
    flashOnArrive: false,
    entering: false,
    guestKind: '',
    goldTrail: false,
    anon: false
  };
}
function assignTones(a) {
  const s = toneSeed++ * 7 + Math.floor(Math.random() * 1000);
  a.tones = {
    robe: new THREE.Color(ROBE_TONES[s % ROBE_TONES.length]),
    pants: new THREE.Color(PANTS_TONES[(s >> 2) % PANTS_TONES.length]),
    skin: new THREE.Color(SKIN_TONES[(s >> 1) % SKIN_TONES.length]),
    hair: new THREE.Color(HAIR_TONES[(s >> 3) % HAIR_TONES.length]),
    feet: new THREE.Color(0xffffff)
  };
}

function setGlow(a, intensity, color = 0xffd27a) {
  if (!a) return;
  a.glow = Math.max(a.glow, intensity);
  a.glowColor.set(color);
}
function touch(a) {
  if (a) a.lastActive = performance.now();
}

function ensureTag(a) {
  if (!a.tag) {
    const el = document.createElement('div');
    el.className = 'tag';
    el.style.transform = 'translate(-2000px, -2000px)';
    el.innerHTML = '<div class="tag-inner"></div>';
    overlay.appendChild(el);
    a.tag = { el, inner: el.firstChild, x: -999, y: -999, s: 0, lit: false, shown: true, w: 80 };
  }
  const rank = a.member && a.vipRank ? `${'①②③④⑤⑥⑦⑧'[a.vipRank - 1] || '★'} ` : '';
  const text = rank + shortName(a.name);
  a.tag.inner.textContent = text;
  a.tag.w = Math.min(16, text.length) * 11 + 34;
  a.tag.el.classList.toggle('walker', !a.member && !a.waiting);
  a.tag.el.classList.toggle('waiting', a.waiting);
  a.tag.el.classList.toggle('vip', Boolean(a.member && a.vipRank));
  a.tag.el.classList.toggle('lotus', a.tier === 'lotus');
  a.tag.el.classList.toggle('gold', a.tier === 'goldLotus');
}

function allocAvatar() {
  return avatars.find((a) => !a.active && !a.queued) || null;
}
function spawnAvatar(a, { uid, name, member, at, yaw = 0, kneel = 0, pop = false, keep = null, anon = false }) {
  const kept = keep ? { seat: keep.seat, tier: keep.tier, vipRank: keep.vipRank, flashOnArrive: keep.flashOnArrive } : {};
  Object.assign(a, newAvatar(a.idx), { tag: a.tag }, kept);
  a.active = true;
  a.uid = uid;
  a.name = name || 'Thí Chủ';
  a.member = member;
  a.pos.copy(at);
  a.yaw = yaw;
  a.kneel = kneel;
  a.pray = kneel;
  a.scale = pop ? 0.01 : 1;
  a.popAt = pop ? clock.elapsed : -10;
  assignTones(a);
  a.anon = anon;
  if (anon) { if (a.tag) { a.tag.el.style.display = 'none'; a.tag.shown = false; } } else ensureTag(a);
  touch(a);
  return a;
}
function despawn(a) {
  a.fade = true;
  a.scaleTarget = 0;
}

// ----------------------------------------------------------------------------
// Kịch bản (chuỗi bước): đi, xoay, quỳ, đứng, chờ, bước động (tính đường lúc bắt đầu)
// ----------------------------------------------------------------------------
const WALK_SPEED = 1.9;
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function moveStep(target, speed = WALK_SPEED) {
  let from = null;
  let dur = 1;
  return {
    start(a) {
      from = a.pos.clone();
      from.y = 0;
      dur = Math.max(0.2, Math.hypot(target.x - from.x, target.z - from.z) / speed);
      a.walking = true;
    },
    get dur() { return dur; },
    update(a, k, dt) {
      const px = a.pos.x;
      const pz = a.pos.z;
      a.pos.set(lerp(from.x, target.x, k), 0, lerp(from.z, target.z, k));
      const dx = target.x - from.x;
      const dz = target.z - from.z;
      if (Math.abs(dx) + Math.abs(dz) > 0.01) a.yaw = lerpAngle(a.yaw, Math.atan2(-dx, -dz), Math.min(1, dt * 9));
      // chân không trượt: pha bước tăng đúng theo quãng đường đi được
      a.phase += (Math.hypot(a.pos.x - px, a.pos.z - pz) * Math.PI) / STRIDE;
      if (k >= 1) a.walking = false;
    }
  };
}
const waitStep = (dur, fn) => ({ dur, start: fn || null });
function kneelStep(to, dur) {
  let from = 0;
  return { dur: dur ?? (to ? 1.0 : 0.8), start(a) { from = a.kneel; a.walking = false; }, update(a, k) { a.kneel = lerp(from, to, ease(k)); } };
}
function turnStep(yaw, dur = 0.5) {
  let from = 0;
  return { dur, start(a) { from = a.yaw; a.walking = false; }, update(a, k) { a.yaw = lerpAngle(from, yaw, ease(k)); a.phase += 0.08; } };
}
/** Bước động: khi tới lượt, gọi fn(a) để sinh tiếp các bước (vd. đường về chỗ ngồi vừa được cấp). */
const dynStep = (fn) => ({ dur: 0, dynamic: fn });
function runScript(a, steps, onDone) {
  a.script = { steps: steps.slice(), i: -1, t: 0, onDone };
  a.busy = true;
  nextStep(a);
}
function nextStep(a) {
  const s = a.script;
  for (;;) {
    s.i += 1;
    s.t = 0;
    if (s.i >= s.steps.length) {
      a.script = null;
      a.busy = false;
      a.walking = false;
      s.onDone?.(a);
      return;
    }
    const st = s.steps[s.i];
    if (st.dynamic) {
      const more = st.dynamic(a);
      if (more === 'wait') { s.i -= 1; s.waiting = true; return; }
      if (Array.isArray(more)) s.steps.splice(s.i + 1, 0, ...more);
      continue;
    }
    s.waiting = false;
    st.start?.(a);
    return;
  }
}
function tickScript(a, dt) {
  const s = a.script;
  if (!s) return;
  if (s.waiting) { nextStep(a); return; }
  const step = s.steps[s.i];
  if (!step) return;
  s.t += dt;
  const k = step.dur > 0 ? clamp01(s.t / step.dur) : 1;
  step.update?.(a, k, dt);
  if (k >= 1) nextStep(a);
}

// Đường đi giữa chỗ ngồi và thảm: lùi ra lối giữa 2 hàng (phía cửa) -> ra làn đi bên mép thảm
function seatGap(seat) {
  const p = seatPos[seat];
  return new THREE.Vector3(p.x, 0, p.z + ROW_GAP);
}
function seatLane(seat) {
  const p = seatPos[seat];
  return new THREE.Vector3(p.x === 0 ? 0 : Math.sign(p.x) * LANE_X, 0, p.z + ROW_GAP);
}
function laneAt(x, z) {
  return new THREE.Vector3(x === 0 ? LANE_X : Math.sign(x) * LANE_X, 0, z);
}
function pathToSeat(seat) {
  return [
    moveStep(seatLane(seat)),
    moveStep(seatGap(seat)),
    moveStep(seatPos[seat].clone(), 1.0),
    turnStep(0, 0.45),
    kneelStep(1),
    waitStep(0.01, (av) => { av.atSeat = seat; })
  ];
}
function pathFromSeat(seat) {
  return [waitStep(0.01, (av) => { av.atSeat = -1; }), kneelStep(0), moveStep(seatGap(seat), 1.0), moveStep(seatLane(seat))];
}
/** Từ vị trí hiện tại (đang ngồi ở chỗ cũ hoặc đang đứng) đi tới chỗ av.seat (đọc lúc tới lượt). */
function goToSeat(a, onArrive) {
  const steps = [];
  if (a.atSeat >= 0) steps.push(...pathFromSeat(a.atSeat));
  else if (a.kneel > 0.05) steps.push(kneelStep(0, 0.6));
  steps.push(dynStep((av) => {
    if (av.seat < 0 || av.leaving) return [];
    // đang ở ngoài sân / gần cửa -> vào qua cửa chính trước
    const pre = av.pos.z > HALL_FRONT - 1.5 ? [moveStep(new THREE.Vector3(0, 0, Math.max(av.pos.z, HALL_FRONT + 2))), moveStep(DOOR_IN.clone())] : [];
    return [...pre, ...pathToSeat(av.seat)];
  }));
  runScript(a, steps, onArrive);
}
function onSeatArrive(av) {
  av.entering = false;
  if (av.flashOnArrive) {
    av.flashOnArrive = false;
    setGlow(av, 1.8, 0xffe27a);
    for (let i = 0; i < 18; i++) {
      const ang = Math.random() * Math.PI * 2;
      sparks.spawn(av.pos.x, 0.9, av.pos.z, Math.cos(ang) * rand(0.4, 1.4), rand(1.5, 3), Math.sin(ang) * rand(0.4, 1.4), rand(0.7, 1.3), i % 2 ? 0xffe27a : 0xfff4c0);
    }
    const f = makeFloater(av.vipRank ? `⭐ Hàng đầu · hạng ${av.vipRank}` : '⭐ Vào chỗ mới', 'merit', 3000);
    f.anchor = () => av.head;
  } else {
    setGlow(av, 1.0);
  }
}

// ----------------------------------------------------------------------------
// Hàng đợi chuyển động (đi vào từ cổng, đổi chỗ, lên hàng đầu): cách nhau ≥ 350 ms, tối đa 6 người đi vào cùng lúc
// ----------------------------------------------------------------------------
const joinQueue = [];
const moveQueue = [];
let lastSpawnAt = -10;
let lastMoveAt = -10;
const MAX_ENTERING = 6;

function walkIn(a) {
  a.queued = true;
  joinQueue.push(a);
}
function queueMove(a) {
  if (!moveQueue.includes(a)) moveQueue.push(a);
}
function processQueues(t) {
  if (moveQueue.length && t - lastMoveAt >= 0.35) {
    const a = moveQueue.shift();
    lastMoveAt = t;
    if (a.active && !a.leaving && a.seat >= 0) {
      if (a.busy) {
        // đang đi (vào / lên lư hương): bước động cuối kịch bản sẽ tự đi tới chỗ mới
        if (!a.script?.steps.some((s) => s.dynamic)) moveQueue.push(a);
      } else if (a.atSeat !== a.seat) {
        goToSeat(a, onSeatArrive);
      }
    }
  }
  if (!joinQueue.length || t - lastSpawnAt < 0.4) return;
  // Hàng chờ quá dài: người ở cuối hiện thẳng tại chỗ (tránh nghẽn cả phút)
  while (joinQueue.length > 10) {
    const late = joinQueue.pop();
    late.queued = false;
    if (late.seat >= 0) {
      spawnAvatar(late, { uid: late.uid, name: late.name, member: true, at: seatPos[late.seat], kneel: 1, pop: true, keep: late });
      late.atSeat = late.seat;
      setGlow(late, 1.3);
    } else {
      uidToAvatar.delete(late.uid);
    }
  }
  const entering = avatars.filter((x) => x.active && x.entering).length;
  if (entering >= MAX_ENTERING) return;
  const a = joinQueue.shift();
  a.queued = false;
  lastSpawnAt = t;
  spawnAvatar(a, { uid: a.uid, name: a.name, member: true, at: new THREE.Vector3(rand(-0.4, 0.4), 0, GATE_SPAWN.z), pop: true, keep: a });
  a.entering = true;
  setGlow(a, 1.2);
  goToSeat(a, onSeatArrive);
  director.request('follow', 1, 9, a);
}

function walkOut(a) {
  if (a.leaving) return;
  a.leaving = true;
  a.member = false;
  a.waiting = false;
  a.vipRank = 0;
  ensureTag(a);
  const steps = [];
  if (a.atSeat >= 0) steps.push(...pathFromSeat(a.atSeat));
  else if (a.kneel > 0.05) steps.push(kneelStep(0, 0.6));
  if (a.pos.z < HALL_FRONT) steps.push(moveStep(DOOR_IN.clone()));
  steps.push(moveStep(new THREE.Vector3(0, 0, Math.max(HALL_FRONT + 3.5, a.pos.z))), moveStep(new THREE.Vector3(0, 0, GATE_SPAWN.z)), waitStep(0.05, (av) => despawn(av)));
  a.seat = -1;
  runScript(a, steps);
}

// ----------------------------------------------------------------------------
// Đi lên lư hương dâng lễ (qua làn bên mép thảm, vòng qua hàng đầu)
// ----------------------------------------------------------------------------
let spotCursor = 0;
function walkToBurner(a, kind, ev) {
  const spotIdx = BOW_SPOTS.findIndex((_, i) => !avatars.some((x) => x.active && x.bowSpot === i));
  const spot = BOW_SPOTS[spotIdx >= 0 ? spotIdx : spotCursor++ % BOW_SPOTS.length];
  a.bowSpot = spotIdx;
  const steps = [];
  if (a.member && a.atSeat >= 0) steps.push(...pathFromSeat(a.atSeat));
  else if (!a.member && !a.guestKind) {
    a.pos.copy(DOOR_IN);
    a.yaw = 0;
  }
  const sideX = spot.x === 0 ? (a.pos.x <= 0 ? -1 : 1) : Math.sign(spot.x);
  steps.push(
    moveStep(new THREE.Vector3(sideX * LANE_X, 0, VIP_Z - 0.9)),
    moveStep(spot.clone(), 1.0),
    turnStep(0, 0.4),
    kneelStep(1, 0.9),
    waitStep(0.15, (av) => { av.bowAt = clock.elapsed; av.bowCount = 3; }),
    waitStep(1.6, (av) => ritualClimax(av, kind, ev)),
    waitStep(4.6),
    waitStep(0.05, (av) => { av.bowSpot = -1; }),
    kneelStep(0),
    turnStep(Math.PI, 0.5),
    moveStep(new THREE.Vector3(sideX * LANE_X, 0, VIP_Z - 0.9))
  );
  // về ghế (kể cả khách hành hương vừa được xếp chỗ trong lúc làm lễ) hoặc ra về qua cổng
  steps.push(dynStep((av) => (av.member ? (av.seat >= 0 && !av.leaving ? pathToSeat(av.seat) : []) : afterGuestRitual(av))));
  runScript(a, steps, (av) => { av.bowSpot = -1; av.goldTrail = false; if (av.member) onSeatArrive(av); });
  director.request('altar', 2, 11);
}

function ritualClimax(a, kind, ev) {
  if (a) setGlow(a, 1.3, kind === 'gift' || kind === 'grand' ? 0xffe27a : 0xffb35a);
  burstIncense(kind === 'grand' ? 2 : 1);
  const f = makeFloater(ev?.merit ? `+${ev.merit} Công Đức` : '+ Công Đức', 'merit', 3200);
  const p = new THREE.Vector3(BURNER.x, BURNER_TOP + 1.4, BURNER.z);
  f.anchor = () => p;
  if (kind === 'prayer') releaseSkyLantern(ev?.user || a?.name || 'Thí Chủ', ev?.wish || 'Cầu bình an');
  if (kind === 'gift' || kind === 'grand') shockwave(BURNER, 6, 1.6, 0.06);
}

function bowAll(count = 1) {
  for (const a of avatars) {
    if (a.active && !a.busy && !a.fade && (a.kneel > 0.95 || a.waiting)) {
      a.bowAt = clock.elapsed + Math.random() * 0.35;
      a.bowCount = count;
    }
  }
}

// ----------------------------------------------------------------------------
// Đạo tràng: đồng bộ roster (hall) + hàng chờ ngoài sân (waiting)
// ----------------------------------------------------------------------------
const uidToAvatar = new Map(); // thành viên đạo tràng (đang ngồi / đang đi vào)
const waitMap = new Map(); // người đứng chờ ngoài sân
let rosterSynced = false;
const pendingActions = new Map();
let waitingCount = 0;
const waitSpotTaken = new Array(WAIT_SPOTS.length).fill(null);

function memberAvatar(uid) {
  const a = uid && uidToAvatar.get(uid);
  return a && (a.active || a.queued) && !a.leaving ? a : null;
}
function anyAvatar(uid) {
  return memberAvatar(uid) || (uid && waitMap.get(uid)?.active ? waitMap.get(uid) : null);
}

function applyMemberInfo(a, m) {
  a.tier = m.tier || 'normal';
  a.vipRank = Number(m.vipRank) || 0;
  if (m.name) a.name = m.name;
  if (a.tag) ensureTag(a);
}

function ensureMember(m) {
  const { uid } = m;
  const seat = m.seat ?? -1;
  let a = memberAvatar(uid);
  if (a) return a;
  // người đang đứng chờ ngoài sân được mời vào -> chính avatar đó đi vào
  const w = waitMap.get(uid);
  if (w && w.active && !w.leaving) {
    waitMap.delete(uid);
    releaseWaitSpot(w);
    w.waiting = false;
    w.member = true;
    w.seat = seat;
    applyMemberInfo(w, m);
    uidToAvatar.set(uid, w);
    w.entering = true;
    if (w.vipRank) w.flashOnArrive = true;
    goToSeat(w, onSeatArrive);
    director.request('follow', 1, 9, w);
    return w;
  }
  // khách hành hương / khách đứng sân vừa đủ điều kiện có ghế -> chính nhân vật đó vào chỗ
  const g = guestMap.get(uid);
  if (g && g.active && !g.fade) {
    guestMap.delete(uid);
    g.guestKind = '';
    g.waiting = false;
    g.member = true;
    g.seat = seat;
    applyMemberInfo(g, m);
    uidToAvatar.set(uid, g);
    g.entering = true;
    if (!g.busy || !g.script?.steps.some((st) => st.dynamic)) goToSeat(g, onSeatArrive);
    director.request('follow', 1, 9, g);
    return g;
  }
  a = allocAvatar();
  if (!a) return null;
  a.uid = uid;
  a.name = m.name || 'Thí Chủ';
  a.seat = seat;
  a.member = true;
  applyMemberInfo(a, m);
  uidToAvatar.set(uid, a);
  if (!rosterSynced && seat >= 0) {
    spawnAvatar(a, { uid, name: a.name, member: true, at: seatPos[seat], kneel: 1, keep: a });
    a.atSeat = seat;
  } else if (a.tier !== 'normal') {
    // người tặng quà: không xếp hàng, đi ngay từ cổng về chỗ với vệt vàng
    spawnAvatar(a, { uid, name: a.name, member: true, at: new THREE.Vector3(0, 0, GATE_SPAWN.z - 4), pop: true, keep: a });
    a.entering = true;
    a.goldTrail = true;
    a.flashOnArrive = true;
    setGlow(a, 1.6, 0xffe27a);
    goToSeat(a, (av) => { av.goldTrail = false; onSeatArrive(av); });
    director.request('follow', 2, 9, a);
  } else {
    walkIn(a);
  }
  return a;
}

function syncRoster(hall, waiting, count) {
  if (!Array.isArray(hall)) return;
  const seen = new Set();
  for (const s of seatState) { s.occupied = false; s.tier = 'normal'; }
  for (const m of hall) {
    const seat = Number(m.seat);
    if (!m.uid || !(seat >= 0 && seat < SEATS)) continue;
    seen.add(m.uid);
    seatState[seat].occupied = true;
    seatState[seat].tier = m.tier || (seat < VIP_SEATS ? 'lotus' : 'normal');
    let a = memberAvatar(m.uid);
    if (!a) {
      a = ensureMember(m);
      if (a) flushPending(m.uid);
      continue;
    }
    const wasVip = a.vipRank > 0;
    applyMemberInfo(a, m);
    if (a.seat !== seat) {
      a.seat = seat;
      if (!wasVip && a.vipRank) a.flashOnArrive = true;
      if (a.active) queueMove(a); // luôn đi bộ sang chỗ mới, không dịch chuyển tức thời
    }
  }
  for (const [uid, a] of uidToAvatar) {
    if (seen.has(uid)) continue;
    uidToAvatar.delete(uid);
    if (a.queued) {
      a.queued = false;
      const qi = joinQueue.indexOf(a);
      if (qi >= 0) joinQueue.splice(qi, 1);
      a.active = false;
    } else if (a.active) {
      // rời đạo tràng; nếu bị chuyển ra hàng chờ thì syncWaiting bên dưới sẽ cho đứng ngoài sân
      if (Array.isArray(waiting) && waiting.some((w) => w.uid === uid)) {
        a.member = false;
        a.leaving = false;
        a.seat = -1;
        waitMap.set(uid, a);
        sendToWaitSpot(a);
      } else {
        walkOut(a);
      }
    }
  }
  refreshSeats();
  rosterSynced = true;
  document.getElementById('cntHall').textContent = String(seen.size);
  if (Array.isArray(waiting)) syncWaiting(waiting, Number(count) || waiting.length);
}

function releaseWaitSpot(a) {
  const i = waitSpotTaken.indexOf(a);
  if (i >= 0) waitSpotTaken[i] = null;
  a.waitSpot = -1;
}
function sendToWaitSpot(a) {
  let i = waitSpotTaken.indexOf(a);
  if (i < 0) i = waitSpotTaken.indexOf(null);
  if (i < 0) { walkOut(a); return; }
  waitSpotTaken[i] = a;
  a.waitSpot = i;
  a.waiting = true;
  ensureTag(a);
  const spot = WAIT_SPOTS[i];
  const steps = [];
  if (a.atSeat >= 0) steps.push(...pathFromSeat(a.atSeat));
  else if (a.kneel > 0.05) steps.push(kneelStep(0, 0.6));
  if (a.pos.z < HALL_FRONT) steps.push(moveStep(DOOR_IN.clone()), moveStep(new THREE.Vector3(0, 0, HALL_FRONT + 2.5)));
  steps.push(moveStep(new THREE.Vector3(Math.sign(spot.x) * 1.0, 0, spot.z)), moveStep(spot.clone(), 1.1), turnStep(rand(-0.25, 0.25), 0.5));
  runScript(a, steps);
}

let waitSpawnDelay = 0;
function syncWaiting(list, count) {
  waitingCount = count;
  const keep = new Set();
  let stagger = 0;
  for (const w of list) {
    if (!w.uid || memberAvatar(w.uid)) continue;
    keep.add(w.uid);
    let a = waitMap.get(w.uid);
    if (a && (a.active || a.queued) && !a.leaving) {
      a.tier = w.tier || 'normal';
      if (w.name && w.name !== a.name) { a.name = w.name; ensureTag(a); }
      continue;
    }
    if (waitSpotTaken.indexOf(null) < 0) continue;
    a = allocAvatar();
    if (!a) break;
    const delay = stagger++ * 380;
    waitMap.set(w.uid, a);
    a.queued = true; // giữ chỗ trong pool trong lúc chờ xuất hiện so le
    setTimeout(() => {
      a.queued = false;
      if (waitMap.get(w.uid) !== a) return;
      spawnAvatar(a, { uid: w.uid, name: w.name, member: false, at: new THREE.Vector3(rand(-0.5, 0.5), 0, GATE_SPAWN.z + 0.5), pop: true });
      a.tier = w.tier || 'normal';
      a.waiting = true;
      ensureTag(a);
      sendToWaitSpot(a);
    }, rosterSynced ? delay : 0);
  }
  for (const [uid, a] of waitMap) {
    if (keep.has(uid)) continue;
    waitMap.delete(uid);
    if (a.active && !a.leaving && uidToAvatar.get(uid) !== a) {
      releaseWaitSpot(a);
      walkOut(a);
    }
  }
}

function flushPending(uid) {
  const list = pendingActions.get(uid);
  if (!list) return;
  pendingActions.delete(uid);
  for (const p of list) if (performance.now() - p.at < 2500) applyHallAction(uid, p.action, p.text);
}

function applyHallAction(uid, action, text) {
  if (action === 'join') {
    // join tới trước hall.roster (server gom 250ms): roster sẽ gán chỗ và cho đi vào
    const a = memberAvatar(uid);
    if (a) setGlow(a, 1.4);
    return;
  }
  if (action === 'promote') {
    const a = memberAvatar(uid) || waitMap.get(uid);
    if (a) { a.flashOnArrive = true; setGlow(a, 1.5, 0xffe27a); touch(a); }
    else pendingActions.set(uid, [{ action, text, at: performance.now() }]);
    return;
  }
  const a = anyAvatar(uid);
  if (!a || a.queued) {
    if (!uid) return;
    const list = pendingActions.get(uid) || [];
    list.push({ action, text, at: performance.now() });
    pendingActions.set(uid, list.slice(-3));
    return;
  }
  applyActionTo(a, action, text);
}

function applyActionTo(a, action, text) {
  touch(a);
  const t = clock.elapsed;
  const idle = (!a.busy && a.kneel > 0.95) || (a.waiting && !a.walking);
  switch (action) {
    case 'bow':
      if (idle) { a.bowAt = t; a.bowCount = 3; }
      else if (a.guestKind === 'court') { a.bowAt = t + 2; a.bowCount = 1; }
      setGlow(a, 0.6, 0xffe6a0);
      break;
    case 'greet':
      a.nodAt = t;
      setGlow(a, 0.5, 0xfff0c0);
      showBubble(a, '🙏 A Di Đà Phật, chào cả nhà!');
      break;
    case 'chant': {
      a.chantUntil = t + 5;
      const f = makeFloater('Nam Mô A Di Đà Phật', 'chant', 3200);
      f.anchor = () => a.head;
      break;
    }
    case 'say':
      showBubble(a, text || '🙏');
      if (idle) a.nodAt = t;
      break;
    default:
      break;
  }
}

// ----------------------------------------------------------------------------
// KHÁCH (tầng 1 & 2): người vừa vào live đi ngang sân lạy vọng; khách hành hương vào làm lễ rồi ra về;
// khách bình luận đứng ở sân trước cổng vài giây; đám đông vô danh ngoài sân theo số người xem.
// ----------------------------------------------------------------------------
const GUEST_SPEED = 2.3;
const MAX_GUEST_WALKERS = 6;
const MAX_COURT_GUESTS = 8;
const guestMap = new Map(); // uid -> avatar khách đang hiện
const COURT_IN = new THREE.Vector3(0, 0, GATE_Z - 2.6); // ngay sau cổng Tam Quan
const PILGRIM_SPAWN_Z = 19.5; // khách hành hương xuất hiện giữa sân (đỡ phải đi cả quãng dài từ cổng)
const BELL_SPOT = new THREE.Vector3(BELL_POS.x + 1.5, 0, BELL_POS.z + 1.6);

const countGuests = (kind) => avatars.filter((x) => x.active && x.guestKind === kind && !x.fade).length;
const exitSteps = (speed = GUEST_SPEED) => [moveStep(new THREE.Vector3(0, 0, GATE_Z + 0.5), speed), waitStep(0.05, (av) => despawn(av))];
function toHallSteps(a, speed = GUEST_SPEED) {
  return a.pos.z > HALL_FRONT - 0.5 ? [moveStep(new THREE.Vector3(0, 0, HALL_FRONT + 2), speed), moveStep(DOOR_IN.clone(), speed)] : [];
}

/** Khách chưa có ghế làm nghi lễ: từ sân đi vào lư hương (hoặc chuông) -> lễ -> đi ra cổng (hoặc về ghế nếu vừa được xếp chỗ). */
function guestPilgrim(ev, kind) {
  const priority = kind === 'gift' || kind === 'grand';
  const existing = ev.uniqueId && guestMap.get(ev.uniqueId);
  if (existing && existing.active && !existing.fade) {
    setGlow(existing, 1.2);
    ritualClimax(null, kind, ev);
    return;
  }
  if (!priority && countGuests('pilgrim') >= MAX_GUEST_WALKERS) {
    aggregateToast(kind);
    if (kind !== 'bell') ritualClimax(null, kind, ev);
    return;
  }
  const a = allocAvatar();
  if (!a) { aggregateToast(kind); return; }
  spawnAvatar(a, { uid: ev.uniqueId || '', name: ev.user, member: false, at: new THREE.Vector3(rand(-0.4, 0.4), 0, PILGRIM_SPAWN_Z), pop: true });
  a.guestKind = 'pilgrim';
  a.goldTrail = priority;
  if (ev.uniqueId) guestMap.set(ev.uniqueId, a);
  const steps = toHallSteps(a);
  if (kind === 'bell') {
    steps.push(
      moveStep(new THREE.Vector3(-LANE_X, 0, VIP_Z - 0.9), GUEST_SPEED),
      moveStep(BELL_SPOT.clone(), 1.4),
      turnStep(Math.atan2(-(BELL_POS.x - BELL_SPOT.x), -(BELL_POS.z - BELL_SPOT.z)), 0.4),
      waitStep(0.1, (av) => { av.bowAt = clock.elapsed; av.bowCount = 1; }),
      waitStep(2.4),
      turnStep(Math.PI, 0.5),
      moveStep(new THREE.Vector3(-LANE_X, 0, VIP_Z - 0.9), GUEST_SPEED)
    );
    runScript(a, [...steps, dynStep(afterGuestRitual)]);
    return;
  }
  // lên lư hương: dùng chung kịch bản dâng lễ; bước cuối tự quyết về ghế hay ra về
  runScript(a, steps, (av) => walkToBurner(av, kind, ev));
}
function afterGuestRitual(av) {
  if (av.member && av.seat >= 0 && !av.leaving) return pathToSeat(av.seat);
  return [moveStep(DOOR_IN.clone(), GUEST_SPEED), ...exitSteps()];
}

/** hall.action cho khách (guest: true): đứng ở sân ngay sau cổng ~6 giây với bong bóng / động tác rồi ra về. */
function courtGuest(uid, name, action, text) {
  let a = guestMap.get(uid);
  if (!(a && a.active && !a.fade)) {
    if (countGuests('court') >= MAX_COURT_GUESTS) {
      if (action === 'say') aggregateToast('say');
      return null;
    }
    a = allocAvatar();
    if (!a) return null;
    spawnAvatar(a, { uid, name, member: false, at: new THREE.Vector3(rand(-0.6, 0.6), 0, GATE_Z + 0.6), pop: true });
    a.guestKind = 'court';
    guestMap.set(uid, a);
    const spot = new THREE.Vector3((countGuests('court') % 2 ? 1 : -1) * rand(0.9, 2.2), 0, COURT_IN.z + rand(-0.8, 0.8));
    runScript(a, [
      moveStep(spot, 1.6),
      turnStep(rand(-0.3, 0.3), 0.4),
      waitStep(0.05, (av) => { av.waiting = true; }),
      waitStep(6),
      waitStep(0.05, (av) => { av.waiting = false; }),
      turnStep(Math.PI, 0.5),
      ...exitSteps(1.8)
    ]);
  }
  return a;
}

/** Tầng 1 — hall.arrive: người vừa vào live đi qua cổng, lạy vọng về chánh điện rồi ra. */
function arrive(p) {
  const more = Number(p.count) > 1 ? ` và ${Number(p.count) - 1} người khác` : '';
  pushToast(`🙏 ${shortName(p.name || 'Thí Chủ', 18)}${more} vừa vào chùa`, 'arrive');
  if (countGuests('arrive') >= 3) return;
  const a = allocAvatar();
  if (!a) return;
  spawnAvatar(a, { uid: p.uid || '', name: p.name, member: false, at: new THREE.Vector3(rand(-0.4, 0.4), 0, GATE_Z + 0.8), pop: true });
  a.guestKind = 'arrive';
  const stop = new THREE.Vector3(rand(-0.8, 0.8), 0, HALL_FRONT + 3.6);
  runScript(a, [
    moveStep(stop, 1.7),
    turnStep(0, 0.4),
    waitStep(0.1, (av) => { av.bowAt = clock.elapsed; av.bowCount = 1; }),
    waitStep(2.3),
    turnStep(Math.PI, 0.6),
    moveStep(new THREE.Vector3(rand(-0.5, 0.5), 0, GATE_Z + 1), 1.7),
    waitStep(0.05, (av) => despawn(av))
  ]);
}

// Đám đông vô danh ngoài sân (không tên): min(12, ceil(người xem / 25)), đi dạo / đứng ngắm tháp
const crowd = [];
function crowdTarget(n) {
  return Math.max(0, Math.min(12, n));
}
function wanderPoint() {
  const side = Math.random() < 0.5 ? -1 : 1;
  return new THREE.Vector3(side * rand(2.9, 8), 0, rand(22, 33));
}
function crowdWander(a) {
  if (!a.active || a.fade || !crowd.includes(a)) return;
  runScript(a, [moveStep(wanderPoint(), rand(0.7, 1.1)), turnStep(rand(-Math.PI, Math.PI), 0.8), waitStep(rand(2.5, 7))], crowdWander);
}
function syncCrowd(viewers) {
  const want = crowdTarget(Math.ceil((Number(viewers) || 0) / 25));
  while (crowd.length < want) {
    const a = allocAvatar();
    if (!a) break;
    spawnAvatar(a, { uid: '', name: '', member: false, at: wanderPoint(), anon: true });
    a.yaw = rand(-Math.PI, Math.PI);
    a.guestKind = 'crowd';
    crowd.push(a);
    crowdWander(a);
  }
  while (crowd.length > want) despawn(crowd.pop());
}

// ----------------------------------------------------------------------------
// THÔNG BÁO NHỎ (xếp chồng) + BĂNG-RÔN QUÀ (lần lượt, luôn ưu tiên hơn thông báo khác)
// ----------------------------------------------------------------------------
const toastStack = document.getElementById('toastStack');
const toastQueue = [];
const MAX_TOASTS = 3;
let toastsShown = 0;
const AGG_LABEL = { incense: 'vừa thắp hương', prayer: 'vừa cầu nguyện', fortune: 'vừa xin xăm', bell: 'vừa thỉnh chuông', gift: 'vừa dâng lễ', say: 'đang bình luận' };
const aggCounts = {};
let aggTimer = 0;
function aggregateToast(kind) {
  aggCounts[kind] = (aggCounts[kind] || 0) + 1;
  if (aggTimer) return;
  aggTimer = setTimeout(() => {
    aggTimer = 0;
    for (const [k, n] of Object.entries(aggCounts)) {
      if (n > 0) pushToast(`+${n} người ${AGG_LABEL[k] || 'vừa làm lễ'}`, `agg-${k}`);
      aggCounts[k] = 0;
    }
  }, 1500);
}
function pushToast(text, key = '') {
  // gộp thông báo cùng loại đang chờ (khi băng-rôn quà đang chiếm sóng)
  const same = key && toastQueue.find((q) => q.key === key);
  if (same) { same.text = text; same.n += 1; return; }
  toastQueue.push({ text, key, n: 1, at: performance.now() });
  if (toastQueue.length > 8) toastQueue.shift();
  pumpToasts();
}
function pumpToasts() {
  if (giftBannerBusy) return;
  while (toastQueue.length && toastsShown < MAX_TOASTS) {
    const q = toastQueue.shift();
    if (performance.now() - q.at > 15000) continue;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = q.key === 'arrive' && q.n > 1 ? `🙏 ${q.n} lượt thí chủ vừa vào chùa` : q.text;
    toastStack.appendChild(el);
    toastsShown++;
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => { el.remove(); toastsShown--; pumpToasts(); }, 350);
    }, 3200);
  }
}

const giftBannerEl = document.getElementById('giftBanner');
const giftQueue = [];
const seenGiftIds = new Set();
let giftBannerBusy = false;
function queueGiftBanner(g) {
  if (!g || seenGiftIds.has(g.id)) return;
  seenGiftIds.add(g.id);
  giftQueue.push(g);
  if (!giftBannerBusy) nextGiftBanner();
}
function nextGiftBanner() {
  const g = giftQueue.shift();
  if (!g) {
    giftBannerBusy = false;
    toastStack.style.opacity = '';
    pumpToasts();
    return;
  }
  giftBannerBusy = true;
  toastStack.style.opacity = '0.35'; // thông báo khác lùi lại khi có quà
  const img = document.getElementById('giftBannerAvatar');
  img.style.display = g.avatar ? '' : 'none';
  if (g.avatar) { img.src = g.avatar; img.onerror = () => { img.style.display = 'none'; }; }
  const rank = g.vipRank ? `${'①②③④⑤⑥⑦⑧'[g.vipRank - 1] || ''} ` : '';
  document.getElementById('giftBannerTitle').textContent = `🎁 ${rank}${shortName(g.user, 18)}`;
  document.getElementById('giftBannerSub').textContent = `dâng ${g.giftName || 'lễ vật'} · ${Number(g.coins || 0).toLocaleString('vi-VN')} xu · +${Number(g.merit || 0).toLocaleString('vi-VN')} Công Đức`;
  giftBannerEl.classList.toggle('big', Boolean(g.big));
  giftBannerEl.classList.add('visible');
  setTimeout(() => {
    giftBannerEl.classList.remove('visible');
    setTimeout(nextGiftBanner, 450);
  }, g.big ? 6000 : 3500);
}

let lastFeedKey = '';
function renderGiftBoard(feed) {
  if (!Array.isArray(feed)) return;
  const key = feed.map((g) => g.id).join('|');
  if (key === lastFeedKey) return;
  const fresh = new Set(feed.map((g) => g.id).filter((id) => !lastFeedKey.includes(id)));
  const first = !lastFeedKey;
  lastFeedKey = key;
  const list = document.getElementById('giftList');
  list.textContent = '';
  if (!feed.length) {
    const li = document.createElement('li');
    li.className = 'gift-empty';
    li.textContent = '🎁 Tặng quà để được ngồi hàng đầu trên đài sen';
    list.appendChild(li);
    return;
  }
  for (const g of feed.slice(0, 6)) {
    const li = document.createElement('li');
    if (!first && fresh.has(g.id)) li.className = 'fresh';
    if (g.avatar) {
      const img = document.createElement('img');
      img.className = 'gift-ava';
      img.src = g.avatar;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => img.remove();
      li.appendChild(img);
    }
    const who = document.createElement('span');
    who.className = 'gift-who';
    if (g.vipRank) {
      const r = document.createElement('span');
      r.className = 'gift-rank';
      r.textContent = '①②③④⑤⑥⑦⑧'[g.vipRank - 1] || '';
      who.appendChild(r);
    }
    who.appendChild(document.createTextNode(g.user || 'Thí Chủ'));
    const small = document.createElement('small');
    small.textContent = g.giftName || '';
    who.appendChild(small);
    const coins = document.createElement('span');
    coins.className = 'gift-coins';
    coins.textContent = `${Number(g.coins || 0).toLocaleString('vi-VN')} xu`;
    li.append(who, coins);
    list.appendChild(li);
  }
}

// ----------------------------------------------------------------------------
// TƯ THẾ: tính góc khớp từ trạng thái (quỳ / đi / chắp tay / lạy / gật đầu)
// ----------------------------------------------------------------------------
const BOW_DUR = 2.1;
// Tư thế tay: [shoulderPitch, shoulderRollIn, elbowPitch, elbowYawIn, wrist]
const ARM_HANG = [0.06, -0.06, 0.18, 0, 0];
const ARM_PRAY = [0.55, -0.12, 1.9, 0.6, -0.2];
const ARM_FOREHEAD = [1.45, -0.05, 2.35, 0.72, -0.2];
const ARM_FLOOR = [1.95, 0.12, 0.3, 0.1, 0.9];
const _arm = [0, 0, 0, 0, 0];
function mixArm(out, a, b, k) {
  for (let i = 0; i < 5; i++) out[i] = lerp(a[i], b[i], k);
  return out;
}

/** Đường cong 1 lạy: chắp tay đưa lên trán -> cúi rạp, 2 tay đặt sàn, trán chạm đất -> đứng thẳng lên. */
function bowPhases(t, count) {
  if (t < 0 || t > count * BOW_DUR) return null;
  const k = (t % BOW_DUR) / BOW_DUR;
  const raise = k < 0.18 ? ease(k / 0.18) : k < 0.3 ? 1 : k < 0.45 ? 1 - ease((k - 0.3) / 0.15) : k > 0.85 ? ease((k - 0.85) / 0.15) * 0.6 : 0;
  const fold = k < 0.26 ? 0 : k < 0.48 ? ease((k - 0.26) / 0.22) : k < 0.66 ? 1 : k < 0.9 ? 1 - ease((k - 0.66) / 0.24) : 0;
  return { raise, fold };
}

const P = { hipY: 0, pelvisZ: 0, torso: 0, head: 0, roll: 0, legs: [[0, 0, 0], [0, 0, 0]], arms: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]], skirtY: 1, skirtW: 1 };
function computePose(a, t) {
  const k = ease(clamp01(a.kneel));
  const w = a.walk;
  const ph = a.phase;
  // Quỳ ngồi trên gót: đùi chúi xuống trước, cẳng chân gập ra sau nằm trên bồ đoàn
  P.hipY = lerp(STAND_HIP, KNEEL_HIP, k);
  P.pelvisZ = 0.17 * k;
  P.torso = -0.04 * k;
  P.head = 0;
  P.roll = 0;
  P.skirtY = lerp(1, 0.55, k);
  P.skirtW = lerp(1, 1.3, k);
  const hipK = lerp(0, 1.05, k);
  const kneeK = lerp(0, -2.62, k);
  const ankleK = lerp(0, -1.3, k);
  for (let s = 0; s < 2; s++) {
    const sp = s === 0 ? Math.sin(ph) : Math.sin(ph + Math.PI);
    const cp = s === 0 ? Math.cos(ph) : Math.cos(ph + Math.PI);
    P.legs[s][0] = hipK + w * 0.42 * sp;
    P.legs[s][1] = kneeK - w * (0.08 + 0.85 * Math.max(0, cp));
    P.legs[s][2] = ankleK + w * 0.25 * Math.max(0, -sp);
  }
  P.hipY -= w * 0.045 * Math.sin(ph) ** 2;
  P.roll = w * 0.035 * Math.sin(ph);
  P.torso += -w * 0.06;

  // Tay: buông khi đứng/đi (vung ngược chân), chắp trước ngực khi quỳ
  a.pray = lerp(a.pray, (a.kneel > 0.92 || a.waiting) && !a.walking ? 1 : 0, 0.12);
  mixArm(_arm, ARM_HANG, ARM_PRAY, ease(a.pray));
  for (let s = 0; s < 2; s++) {
    const arm = P.arms[s];
    for (let i = 0; i < 5; i++) arm[i] = _arm[i];
    arm[0] += -w * 0.38 * (s === 0 ? Math.sin(ph) : Math.sin(ph + Math.PI)) * (1 - a.pray);
    arm[2] += w * 0.25;
  }

  // Lạy
  const b = bowPhases(t - a.bowAt, a.bowCount);
  if (b && a.kneel > 0.5) {
    for (let s = 0; s < 2; s++) {
      mixArm(_arm, P.arms[s], ARM_FOREHEAD, b.raise * (1 - b.fold));
      mixArm(P.arms[s], _arm, ARM_FLOOR, b.fold);
    }
    P.torso += -1.62 * b.fold;
    P.head += -0.28 * b.fold + 0.15 * b.raise;
    P.hipY += 0.07 * b.fold;
    P.pelvisZ -= 0.12 * b.fold;
    P.skirtY = lerp(P.skirtY, 0.75, b.fold);
  } else if (b && !a.walking) {
    // đứng lạy (người chờ ngoài sân): chắp tay đưa lên trán rồi cúi gập người
    for (let s = 0; s < 2; s++) mixArm(P.arms[s], P.arms[s], ARM_FOREHEAD, Math.max(b.raise, b.fold) * 0.8);
    P.torso += -0.95 * b.fold;
    P.head += -0.3 * b.fold;
  }
  // Gật đầu chào (chắp tay cúi nhẹ 2 lần)
  const nk = (t - a.nodAt) / 1.6;
  if (nk >= 0 && nk < 1) {
    const n = Math.sin(nk * Math.PI * 2) ** 2;
    P.torso += -0.3 * n;
    P.head += -0.25 * n;
    if (a.kneel < 0.5) for (let s = 0; s < 2; s++) mixArm(P.arms[s], P.arms[s], ARM_PRAY, Math.min(1, nk * 4) * (1 - Math.max(0, nk - 0.8) * 5));
  }
  // Niệm Phật: lắc lư nhẹ
  if (t < a.chantUntil) {
    P.torso += Math.sin(t * 4.2) * 0.04;
    P.head += Math.sin(t * 4.2 + 0.6) * 0.06;
  }
  // thở
  P.torso += Math.sin(t * 1.4 + a.idx * 1.7) * 0.012;
  return P;
}

// ----------------------------------------------------------------------------
// Dựng ma trận từng bộ phận từ tư thế
// ----------------------------------------------------------------------------
const _root = new THREE.Matrix4();
const _hip = new THREE.Matrix4();
const _torso = new THREE.Matrix4();
const _j1 = new THREE.Matrix4();
const _j2 = new THREE.Matrix4();
const _j3 = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _camQ = new THREE.Quaternion();
const mT = (x, y, z) => _t.makeTranslation(x, y, z);
const mRx = (a) => new THREE.Matrix4().makeRotationX(a);
const _rx = new THREE.Matrix4();
const _ry = new THREE.Matrix4();
const _rz = new THREE.Matrix4();
const _sc = new THREE.Matrix4();

let fishBobAt = -10;
function updateAvatars(dt, t) {
  _camQ.copy(camera.quaternion);
  let n = 0;
  let na = 0;
  const fishK = t - fishBobAt;
  for (const a of avatars) {
    if (!a.active) continue;
    if (a.script) tickScript(a, dt);
    // đi bộ mượt: biên độ bước tăng/giảm dần
    a.walk = lerp(a.walk, a.walking ? 1 : 0, Math.min(1, dt * 7));

    if (a.fade) {
      a.scale = Math.max(0, a.scale - dt * 2.2);
      if (a.scale <= 0.001) {
        a.active = false;
        a.fade = false;
        if (a.tag) { a.tag.el.style.display = 'none'; a.tag.shown = false; }
        if (a.uid && guestMap.get(a.uid) === a) guestMap.delete(a.uid);
        if (a.uid && waitMap.get(a.uid) === a) waitMap.delete(a.uid);
        continue;
      }
    } else {
      const pk = (t - a.popAt) / 0.55;
      a.scale = pk < 1 ? Math.max(0.01, 1 + 2.7 * (pk - 1) ** 3 + 1.7 * (pk - 1) ** 2) : lerp(a.scale, a.scaleTarget, 0.3);
    }

    // vệt vàng sau bước chân người tặng quà
    if (a.goldTrail && a.walking && Math.random() < 0.6) {
      sparks.spawn(a.pos.x + rand(-0.15, 0.15), groundY(a.pos.z) + rand(0.1, 1.2), a.pos.z + rand(-0.1, 0.25), rand(-0.2, 0.2), rand(0.3, 0.9), rand(-0.1, 0.2), rand(0.6, 1.1), Math.random() < 0.5 ? 0xffe27a : 0xffc04a);
      a.glow = Math.max(a.glow, 0.7);
    }
    const p = computePose(a, t);
    let bob = 0;
    if (fishK >= 0 && fishK < 0.5 && a.kneel > 0.9) bob = Math.sin((fishK / 0.5) * Math.PI) * 0.05 * (0.6 + 0.4 * Math.sin(a.idx));
    a.bobY = bob;
    const s = Math.max(0.0001, a.scale);
    const gy = groundY(a.pos.z);

    _root.compose(_pos.set(a.pos.x, gy + bob, a.pos.z), _q.setFromAxisAngle(_v.set(0, 1, 0), a.yaw), _s.set(s, s, s));
    _hip.copy(_root).multiply(mT(0, p.hipY, p.pelvisZ)).multiply(_rz.makeRotationZ(p.roll));
    _torso.copy(_hip).multiply(_rx.makeRotationX(p.torso));

    const T = a.tones;
    const put = (name, slot, m, color) => {
      parts[name].setMatrixAt(slot, m);
      parts[name].setColorAt(slot, color);
    };
    put('torso', n, _torso, T.robe);
    _j1.copy(_hip).multiply(_rx.makeRotationX(p.torso * 0.35)).multiply(_sc.makeScale(p.skirtW, p.skirtY, p.skirtW));
    put('skirt', n, _j1, T.robe);
    _j1.copy(_torso).multiply(mT(0, NECK_Y, 0)).multiply(_rx.makeRotationX(p.head));
    put('head', n, _j1, T.skin);
    put('hair', n, _j1, T.hair);
    a.head.set(0, 0.42, 0).applyMatrix4(_j1);

    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? -1 : 1; // 0 = trái (x âm), 1 = phải
      const slot = n * 2 + side;
      const [shP, shR, elP, elY, wr] = p.arms[side];
      // vai -> cánh tay trên
      _j1.copy(_torso).multiply(mT(sg * SHOULDER_X, SHOULDER_Y, 0)).multiply(_rx.makeRotationX(shP)).multiply(_rz.makeRotationZ(-sg * shR));
      put('upperArm', slot, _j1, T.robe);
      _j2.copy(_j1).multiply(mT(0, -UPPER_ARM, 0)).multiply(_ry.makeRotationY(sg * elY)).multiply(_rx.makeRotationX(elP));
      put('foreArm', slot, _j2, T.robe);
      _j3.copy(_j2).multiply(mT(0, -FORE_ARM, 0)).multiply(_rx.makeRotationX(wr));
      put('hand', slot, _j3, T.skin);
      // hông -> đùi -> cẳng chân -> bàn chân (gắn khung hông, không nghiêng theo thân khi lạy)
      const [hp, kn, an] = p.legs[side];
      _j1.copy(_root).multiply(mT(sg * 0.1, p.hipY - 0.02, p.pelvisZ)).multiply(_rx.makeRotationX(hp));
      put('thigh', slot, _j1, T.pants);
      _j2.copy(_j1).multiply(mT(0, -THIGH, 0)).multiply(_rx.makeRotationX(kn));
      put('shin', slot, _j2, T.pants);
      _j3.copy(_j2).multiply(mT(0, -SHIN, 0)).multiply(_rx.makeRotationX(an));
      put('foot', slot, _j3, T.feet);
    }
    if (!SHADOWS) {
      blobMesh.setMatrixAt(n, _m.compose(_pos.set(a.pos.x, gy + 0.18 * a.kneel + 0.02, a.pos.z), _q.identity(), _s.set(s * 1.1, 1, s * 1.1)));
    }

    // Hào quang (cộng sáng; cường độ = màu)
    a.glow = Math.max(0, a.glow - dt * 0.55);
    const chanting = t < a.chantUntil;
    let aura = a.glow;
    if (chanting) aura = Math.max(aura, 0.55 + Math.sin(t * 3 + a.idx) * 0.15);
    if (aura > 0.01) {
      const sz = (1.6 + aura * 0.6) * s;
      _c.copy(chanting ? _c.set(0xffcf5a) : a.glowColor).multiplyScalar(Math.min(1, aura) * 0.7);
      auraMesh.setColorAt(na, _c);
      auraMesh.setMatrixAt(na, _m.compose(_pos.set(a.pos.x, gy + lerp(0.9, 0.62, a.kneel) * s, a.pos.z), _camQ, _s.set(sz, sz * 1.25, 1)));
      na++;
    }
    n++;
  }
  for (const [name, im] of Object.entries(parts)) {
    im.count = PAIRED[name] ? n * 2 : n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }
  blobMesh.count = SHADOWS ? 0 : n;
  blobMesh.instanceMatrix.needsUpdate = true;
  auraMesh.count = na;
  auraMesh.instanceMatrix.needsUpdate = true;
  if (auraMesh.instanceColor) auraMesh.instanceColor.needsUpdate = true;
}

// ============================================================================
// 11. ĐẠO DIỄN CAMERA: các góc máy đặt tên + chuyển cảnh mượt
// ============================================================================
const CAM_LOCK = params.get('cam');
const DIRECTOR_AUTO = params.get('director') !== '0' && !CAM_LOCK;
const CYCLE = ['hall', 'side', 'altar', 'top', 'hall', 'court'];
const SHOTS = {
  hall: (u) => ({ pos: [Math.sin(u * 0.11) * 0.5, 10.8 + Math.sin(u * 0.07) * 0.2, 13.2 - Math.min(u, 15) * 0.04], look: [Math.sin(u * 0.09) * 0.25, 3.4, -8.5] }),
  altar: (u) => ({ pos: [1.5 + Math.sin(u * 0.12) * 0.5, 3.7 + Math.sin(u * 0.08) * 0.15, -9.9], look: [-0.3, 0.5, 1.5] }),
  side: (u) => ({ pos: [8.4, 4.4, -7.2 + Math.min(u, 15) * 0.08], look: [-1.2, 0.5, -0.8] }),
  buddha: (u) => ({ pos: [Math.sin(u * 0.2) * 0.5, 6.4, -5.5 - Math.min(u, 12) * 0.22], look: [0, 6.6, -16.4] }),
  entrance: (u) => ({ pos: [-1.2 + Math.sin(u * 0.1) * 0.3, 2.2, 2.2], look: [0, 4.2, 30] }),
  top: (u) => ({ pos: [-10 + Math.sin(u * 0.05) * 2, 36, -22], look: [0, 0, 13] }),
  // sân chùa: từ thềm điện nhìn ra cổng Tam Quan và tháp Phước Duyên
  court: (u) => ({ pos: [2.4 + Math.sin(u * 0.08) * 0.5, 11.5, HALL_FRONT + 0.9 + Math.min(u, 15) * 0.05], look: [-0.3, 3.8, TOWER_Z - 4] }),
  follow: (u, target) => {
    if (!target || !target.active) return SHOTS.entrance(u);
    const gy = groundY(target.pos.z);
    // máy quay đi giật lùi phía trước người mới để thấy mặt
    return { pos: [target.pos.x + 1.5, gy + 2.3, target.pos.z - 3.8], look: [target.pos.x, gy + 1.15, target.pos.z + 0.6] };
  }
};
const director = {
  name: CAM_LOCK && SHOTS[CAM_LOCK] ? CAM_LOCK : 'hall',
  priority: 0,
  until: 14,
  startedAt: 0,
  lastCut: -10,
  blendFrom: { pos: new THREE.Vector3(0, 10.2, 12.2), look: new THREE.Vector3(0, 3.6, -8.5) },
  blendStart: -10,
  blendDur: 2.0,
  target: null,
  cycleIdx: 0,
  curLook: new THREE.Vector3(0, 3.6, -8.5),
  livePos: new THREE.Vector3(),
  liveLook: new THREE.Vector3(),
  cut(name, priority, hold, target) {
    const t = clock.elapsed;
    this.blendFrom.pos.copy(camera.position);
    this.blendFrom.look.copy(this.curLook);
    this.blendStart = t;
    this.blendDur = name === 'follow' ? 1.6 : 2.2;
    this.name = name;
    this.priority = priority;
    this.until = t + hold;
    this.startedAt = t;
    this.lastCut = t;
    this.target = target || null;
  },
  request(name, priority, hold, target) {
    if (CAM_LOCK) return;
    const t = clock.elapsed;
    const busy = this.until > t && priority < this.priority; // sự kiện lớn hơn đang diễn
    if (busy) return;
    if (t - this.lastCut < 4 && priority <= this.priority) return; // tối đa 1 cú cắt / 4 giây
    if (name === this.name && this.target === (target || null)) { this.until = Math.max(this.until, t + hold); return; }
    this.cut(name, priority, hold, target);
  },
  update(t, dt) {
    if (!CAM_LOCK && t > this.until) {
      if (this.name === 'follow' && this.target?.active && this.target.entering) {
        this.until = t + 2;
      } else if (DIRECTOR_AUTO) {
        this.cycleIdx = (this.cycleIdx + 1) % CYCLE.length;
        this.cut(CYCLE[this.cycleIdx], 0, 13 + Math.random() * 2);
      } else if (this.name !== 'hall') {
        this.cut('hall', 0, 1e9);
      } else {
        this.until = t + 1e9;
        this.priority = 0;
      }
    }
    const u = t - this.startedAt;
    const live = SHOTS[this.name](u, this.target);
    const lp = _v.set(...live.pos);
    if (this.name === 'follow') {
      // giữ máy không xuyên tường: đi qua cửa chính thì ép vào khe cửa
      if (Math.abs(lp.z - (HALL_FRONT + 0.2)) < 1.2) lp.x = Math.max(-DOOR_W / 2 + 0.6, Math.min(DOOR_W / 2 - 0.6, lp.x));
      this.livePos.lerp(lp, Math.min(1, dt * 3));
      this.liveLook.lerp(_s.set(...live.look), Math.min(1, dt * 4));
    } else {
      this.livePos.copy(lp);
      this.liveLook.set(...live.look);
    }
    const k = ease(clamp01((t - this.blendStart) / this.blendDur));
    camera.position.lerpVectors(this.blendFrom.pos, this.livePos, k);
    this.curLook.lerpVectors(this.blendFrom.look, this.liveLook, k);
    camera.lookAt(this.curLook);
  }
};
{
  const s0 = SHOTS[director.name](0);
  director.livePos.set(...s0.pos);
  director.liveLook.set(...s0.look);
  director.blendFrom.pos.copy(director.livePos);
  director.blendFrom.look.copy(director.liveLook);
  camera.position.copy(director.livePos);
  director.curLook.copy(director.liveLook);
  camera.lookAt(director.curLook);
  if (CAM_LOCK) director.until = 1e9;
}

// ============================================================================
// 12. LỚP HTML: chiếu 3D -> 2D, ẩn nhãn sau camera / ngoài khung / chồng lấn
// ============================================================================
const _proj = new THREE.Vector3();
function toStage(v, out) {
  _proj.copy(v).applyMatrix4(camera.matrixWorldInverse);
  out.behind = _proj.z > -0.2;
  out.dist = -_proj.z;
  _proj.applyMatrix4(camera.projectionMatrix);
  out.x = (_proj.x * 0.5 + 0.5) * STAGE_W;
  out.y = (-_proj.y * 0.5 + 0.5) * STAGE_H;
  out.vis = !out.behind && out.x > -60 && out.x < STAGE_W + 60 && out.y > -40 && out.y < STAGE_H + 40;
  return out;
}

const floaters = [];
function makeFloater(text, cls, ms) {
  const el = document.createElement('div');
  el.className = `floater ${cls || ''}`;
  el.style.transform = 'translate(-2000px, -2000px)';
  const inner = document.createElement('div');
  inner.className = 'floater-inner';
  inner.textContent = text;
  el.appendChild(inner);
  overlay.appendChild(el);
  const f = { el, anchor: null, until: performance.now() + ms, remove() { el.remove(); this.dead = true; } };
  floaters.push(f);
  return f;
}

// Bong bóng lời nói: mỗi người 1 bong bóng (lời mới thay lời cũ), hiện ≥ 3 giây, tối đa 6 cái;
// quá 6 thì xếp hàng chờ chứ không vẽ đè. Vị trí được dàn lại mỗi khung hình để không chồng nhau.
const bubbles = [];
const bubbleQueue = [];
const BUBBLE_MIN_MS = 3000;
const BUBBLE_MS = 4500;
function showBubble(a, text) {
  const now = performance.now();
  const msg = String(text || '🙏').slice(0, 80);
  const own = bubbles.find((x) => x.a === a && !x.dying);
  if (own) {
    own.text.nodeValue = msg;
    own.born = now;
    clearTimeout(own.timer);
    own.timer = setTimeout(() => own.kill(), BUBBLE_MS);
    own.measured = false;
    return;
  }
  const live = bubbles.filter((x) => !x.dying);
  if (live.length >= MAX_BUBBLES) {
    const old = live.find((x) => now - x.born >= BUBBLE_MIN_MS);
    if (old) old.kill();
    else {
      const qi = bubbleQueue.findIndex((q) => q.a === a);
      if (qi >= 0) bubbleQueue.splice(qi, 1);
      bubbleQueue.push({ a, text: msg, at: now });
      if (bubbleQueue.length > 12) bubbleQueue.shift();
      return;
    }
  }
  const el = document.createElement('div');
  el.className = 'bubble';
  el.style.transform = 'translate(-2000px, -2000px)'; // ẩn tới khi được dàn chỗ ở khung hình kế
  const inner = document.createElement('div');
  inner.className = 'bubble-inner';
  const nm = document.createElement('b');
  nm.textContent = shortName(a.name, 18);
  const tn = document.createTextNode(msg);
  inner.append(nm, tn);
  el.appendChild(inner);
  overlay.appendChild(el);
  const bub = {
    a,
    el,
    inner,
    text: tn,
    born: now,
    dying: false,
    timer: 0,
    dy: 0,
    w: 200,
    h: 60,
    measured: false,
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
  bub.timer = setTimeout(() => bub.kill(), BUBBLE_MS);
  bubbles.push(bub);
}
function pumpBubbles() {
  const now = performance.now();
  while (bubbleQueue.length && bubbles.filter((x) => !x.dying).length < MAX_BUBBLES) {
    const q = bubbleQueue.shift();
    if (now - q.at < 6000 && q.a.active) showBubble(q.a, q.text);
  }
}
const rectHit = (r, q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1];

function makeFixedLabel(cls) {
  const el = document.createElement('div');
  el.className = `fixed-label ${cls}`;
  el.innerHTML = '<div class="fixed-label-inner"></div>';
  el.style.display = 'none';
  overlay.appendChild(el);
  return { el, inner: el.firstChild, text: '' };
}
const reservedLabel = makeFixedLabel('reserved-label');
const waitSign = makeFixedLabel('wait-sign');
const WAIT_SIGN_POS = new THREE.Vector3(0, COURT_Y + 3.2, 21);
function placeFixed(lbl, pos, text) {
  if (!text) { if (lbl.el.style.display !== 'none') lbl.el.style.display = 'none'; return; }
  if (text !== lbl.text) { lbl.inner.textContent = text; lbl.text = text; }
  toStage(pos, _sp);
  lbl.el.style.display = _sp.vis ? '' : 'none';
  const sc = Math.max(0.6, Math.min(1.2, 14 / _sp.dist));
  lbl.el.style.transform = `translate(${Math.round(_sp.x)}px, ${Math.round(_sp.y)}px) scale(${sc.toFixed(2)})`;
}
const _fixedPos = new THREE.Vector3();
const _sp = { x: 0, y: 0, vis: false, behind: false, dist: 1 };
const placed = [];
const tagCands = [];
function updateOverlay() {
  // 1) Ứng viên nhãn tên
  tagCands.length = 0;
  for (const a of avatars) {
    if (!a.tag) continue;
    if (!a.active || a.scale < 0.15 || a.anon) {
      if (a.tag.shown) { a.tag.el.style.display = 'none'; a.tag.shown = false; }
      continue;
    }
    toStage(a.head, _sp);
    if (!_sp.vis) {
      if (a.tag.shown) { a.tag.el.style.display = 'none'; a.tag.shown = false; }
      continue;
    }
    a.tag.px = _sp.x;
    a.tag.py = _sp.y;
    a.tag.dist = _sp.dist;
    tagCands.push(a);
  }
  // 6 người tương tác gần nhất luôn hiện; còn lại ưu tiên người gần camera, ẩn nếu chồng lấn
  const recent = tagCands.slice().sort((x, y) => y.lastActive - x.lastActive).slice(0, 6);
  const recentSet = new Set(recent);
  tagCands.sort((x, y) => (recentSet.has(y) - recentSet.has(x)) || x.tag.dist - y.tag.dist);
  placed.length = 0;
  // 1b) Bong bóng: dàn từ dưới lên, đẩy lên trên khi chạm bong bóng khác
  pumpBubbles();
  const bubbleRects = [];
  const liveB = bubbles.filter((b) => !b.dying || b.el.style.display !== 'none');
  liveB.sort((x, y) => x.born - y.born);
  for (const b of liveB) {
    toStage(b.a.head, _sp);
    const show = _sp.vis && b.a.active;
    b.el.style.display = show ? '' : 'none';
    if (!show) continue;
    if (!b.measured) { b.w = b.inner.offsetWidth || 220; b.h = b.inner.offsetHeight || 60; b.measured = true; }
    const bx = Math.max(180, Math.min(STAGE_W - 180, _sp.x));
    let dy = 0;
    let r = null;
    for (let k = 0; k < 10; k++) {
      r = [bx - b.w / 2 - 4, _sp.y - 46 - b.h - dy - 4, bx + b.w / 2 + 4, _sp.y - 46 - dy + 4];
      const hit = bubbleRects.find((q) => rectHit(r, q));
      if (!hit) break;
      dy = _sp.y - 46 - hit[1] + 2;
    }
    // đẩy lên: tức thì (không bao giờ đè nhau); hạ xuống: mượt
    b.dy = dy >= b.dy ? dy : lerp(b.dy, dy, 0.3);
    r[1] -= b.dy - dy;
    r[3] -= b.dy - dy;
    bubbleRects.push(r);
    b.el.style.transform = `translate(${Math.round(bx)}px, ${Math.round(_sp.y - b.dy)}px)`;
  }
  placed.push(...bubbleRects);
  for (const a of tagCands) {
    const tg = a.tag;
    const sc = Math.max(0.55, Math.min(1.3, 13 / tg.dist));
    const w = tg.w * sc;
    const h = 30 * sc;
    const x0 = tg.px - w / 2;
    const y0 = tg.py - 6 - h;
    const forced = recentSet.has(a) || a.vipRank > 0 || (!a.member && !a.waiting);
    const tr = [x0 - 6, y0 - 4, x0 + w + 6, y0 + h + 4];
    // nhãn ưu tiên chỉ nhường bong bóng; nhãn thường nhường cả nhãn khác
    let ok = !(forced ? bubbleRects : placed).some((r) => rectHit(tr, r));
    if (!ok) {
      if (tg.shown) { tg.el.style.display = 'none'; tg.shown = false; }
      continue;
    }
    placed.push([x0, y0, x0 + w, y0 + h]);
    if (!tg.shown) { tg.el.style.display = ''; tg.shown = true; }
    const x = Math.round(tg.px);
    const y = Math.round(tg.py - 6);
    const sr = Math.round(sc * 20) / 20;
    if (x !== tg.x || y !== tg.y || sr !== tg.s) {
      tg.el.style.transform = `translate(${x}px, ${y}px) scale(${sr})`;
      tg.x = x;
      tg.y = y;
      tg.s = sr;
    }
    const lit = a.glow > 0.35;
    if (lit !== tg.lit) { tg.el.classList.toggle('lit', lit); tg.lit = lit; }
    tg.el.style.zIndex = String(recentSet.has(a) ? 900 : Math.round(500 - tg.dist));
  }
  // Hàng đầu còn trống -> nhắc "giữ chỗ dâng lễ"; hàng chờ đông -> biển "+N Phật tử đang chờ vào"
  const emptyVip = seatState.findIndex((st, i) => i < VIP_SEATS && !st.occupied);
  placeFixed(reservedLabel, _fixedPos.set(emptyVip >= 0 ? VIP_X[emptyVip] : 0, 0.75, VIP_Z), emptyVip >= 0 ? '🎁 Giữ chỗ dâng lễ' : '');
  placeFixed(waitSign, WAIT_SIGN_POS, waitingCount > WAIT_SPOTS.length ? `+${waitingCount - WAIT_SPOTS.length} Phật tử đang chờ vào` : '');
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
      f.el.style.display = _sp.vis ? '' : 'none';
      const fx = Math.max(170, Math.min(STAGE_W - 170, _sp.x));
      // làn dọc: chữ bay cùng lúc không đè lên nhau / lên bong bóng
      const w = f.w || (f.w = Math.min(380, f.el.firstChild.textContent.length * 15 + 20));
      let dy = 0;
      for (let k = 0; k < 8; k++) {
        const r = [fx - w / 2, _sp.y - 40 - dy, fx + w / 2, _sp.y - dy];
        const hit = placed.find((q) => rectHit(r, q));
        if (!hit) { placed.push(r); break; }
        dy = _sp.y - hit[1] + 6;
      }
      f.dy = lerp(f.dy || dy, dy, 0.3);
      f.el.style.transform = `translate(${Math.round(fx)}px, ${Math.round(_sp.y - f.dy)}px)`;
    }
  }
}

// ============================================================================
// 13. VÒNG LẶP KHUNG HÌNH (30 FPS)
// ============================================================================
const clock = { elapsed: 0 };
function updateEnvironment(dt, t) {
  smokeAcc += dt * (4 + visibleSticks * 0.4);
  while (smokeAcc > 1) {
    smokeAcc -= 1;
    const s = stickPos[Math.floor(Math.random() * visibleSticks)];
    if (s) smoke.spawn(s.tip.x, s.tip.y + 0.05, s.tip.z, rand(-0.06, 0.06), rand(0.45, 0.75), rand(-0.05, 0.05), rand(3.5, 5.5), 0x5a524c);
  }
  smoke.update(dt, 0, 0.12, t);
  sparks.update(dt, 1.2, 0, t, 3.2);
  for (let i = 0; i < MAX_STICKS; i++) {
    const s = stickPos[i];
    const on = i < visibleSticks ? 0.9 + Math.sin(t * 6 + i) * 0.25 + flare.burner * 1.4 : 0.0001;
    tips.setMatrixAt(i, _m.compose(s.tip, camera.quaternion, _s.set(on, on, on)));
  }
  tips.instanceMatrix.needsUpdate = true;

  flare.burner = Math.max(0, flare.burner - dt * 0.8);
  altarLight.intensity = 16 + flare.burner * 26 + flare.halo * 30 + Math.sin(t * 7) * 1;
  flare.halo = Math.max(0, flare.halo - dt * 0.18);
  haloRays.rotation.z = t * 0.06;
  haloRays.scale.setScalar(1 + flare.halo * 0.6 + Math.sin(t * 0.8) * 0.03);
  haloRays.material.opacity = 0.3 + flare.halo * 0.6;
  haloGlow.material.opacity = 0.5 + flare.halo * 0.4;
  haloGlow.scale.setScalar(1 + flare.halo * 0.6);
  mandorla.material.opacity = 0.38 + flare.halo * 0.5;
  haloRim.material.emissiveIntensity = 1.2 + flare.halo * 2 + Math.sin(t * 1.3) * 0.15;
  GOLD.skin.emissiveIntensity = 0.45 + flare.halo * 1.0;
  GOLD.robe.emissiveIntensity = GOLD.robePlain.emissiveIntensity = 0.45 + flare.halo * 0.9;

  for (const g of hangingLanterns) g.quaternion.copy(camera.quaternion);
  for (const gl of gateGlows) gl.quaternion.copy(camera.quaternion);
  for (const f of candleFlames) {
    f.quaternion.copy(camera.quaternion);
    f.scale.set(1 + Math.sin(t * 9 + f.position.x) * 0.08, 1 + Math.sin(t * 11 + f.position.x) * 0.12, 1);
  }
  for (const [i, sh] of shafts.entries()) sh.material.opacity = 0.12 + Math.sin(t * 0.3 + i) * 0.035;

  flare.bellSwing = Math.max(0, flare.bellSwing - dt * 0.35);
  bellPivot.rotation.x = Math.sin(t * 5) * 0.22 * flare.bellSwing;
  const fk = t - fishBobAt;
  fish.position.y = 1.6 + (fk >= 0 && fk < 0.3 ? Math.sin((fk / 0.3) * Math.PI) * 0.12 : 0);

  for (const r of ringPool) {
    if (!r.active) continue;
    r.t += dt;
    const k = r.t / r.dur;
    if (k >= 1) { r.active = false; r.m.visible = false; continue; }
    const rad = 0.5 + r.max * ease(k);
    r.m.scale.set(rad, rad, rad);
    r.m.material.opacity = (1 - k) * 0.85;
  }
  for (const s of skyLanterns) {
    if (!s.active) continue;
    s.t += dt;
    s.g.position.y += dt * (0.55 + s.t * 0.05);
    s.g.position.x += Math.sin(s.t * 0.8) * dt * 0.25 + s.vx * dt;
    s.g.position.z -= dt * 0.18;
    s.g.children[0].quaternion.copy(camera.quaternion);
    if (s.t > 9.5) { s.active = false; s.g.visible = false; }
  }
  const raining = t < petalRainUntil;
  if (raining || petals.userData.live) {
    let live = 0;
    for (let i = 0; i < PETALS; i++) {
      const p = petalState[i];
      p.y -= p.vy * dt;
      p.x += Math.sin(t * 1.2 + p.phase) * dt * 0.5;
      if (p.y < 0.05) {
        if (raining) { p.y = rand(12, 16); p.x = rand(-8, 8); p.z = rand(-15, 5); } else p.y = -10;
      }
      if (p.y > -5) live++;
      _e.set(t * p.spin + p.phase, t * p.spin * 0.7, p.phase, 'XYZ');
      _m.compose(_pos.set(p.x, p.y, p.z), _q.setFromEuler(_e), _s.set(0.9, 0.9, 0.9));
      if (p.y < -5) _m.makeScale(0, 0, 0);
      petals.setMatrixAt(i, _m);
    }
    petals.userData.live = live > 0;
    petals.instanceMatrix.needsUpdate = true;
  }
}

let rafId = 0;
let lastFrame = 0;
function frame(now) {
  rafId = requestAnimationFrame(frame);
  if (now - lastFrame < FRAME_MS - 2) return;
  const dt = Math.min(DT_MAX, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  clock.elapsed += dt;
  const t = clock.elapsed;
  processQueues(t);
  director.update(t, dt);
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
document.addEventListener('visibilitychange', () => (document.hidden ? stopLoop() : startLoop()));
startLoop();

// ============================================================================
// 14. NGHI THỨC (temple.event)
// ============================================================================
let fortuneTimer = 0;
let grandTimer = 0;
const recentEventIds = new Set();

function walkFor(ev, kind) {
  const status = ev.hallStatus || (memberAvatar(ev.uniqueId) ? 'seated' : 'guest');
  const a = memberAvatar(ev.uniqueId);
  const isGift = kind === 'gift' || kind === 'grand';
  const walkingToBurner = avatars.filter((x) => x.active && x.bowSpot >= 0).length;
  if (a && a.active && status !== 'guest') {
    touch(a);
    if (a.busy || (!isGift && walkingToBurner >= 3)) {
      setGlow(a, 1.2);
      if (!a.busy && a.kneel > 0.95) { a.bowAt = clock.elapsed; a.bowCount = 3; }
      ritualClimax(null, kind, ev);
      return;
    }
    walkToBurner(a, kind, ev);
    return;
  }
  // Đang đứng chờ ngoài sân: lạy tại chỗ, hương vẫn bùng trong điện
  const w = ev.uniqueId && waitMap.get(ev.uniqueId);
  if (w && w.active) {
    touch(w);
    setGlow(w, 1.2);
    if (!w.busy) { w.bowAt = clock.elapsed; w.bowCount = 3; }
    ritualClimax(null, kind, ev);
    return;
  }
  if (a && a.queued && !isGift) {
    ritualClimax(null, kind, ev);
    return;
  }
  // Khách hành hương (chưa có ghế): đi vào làm lễ rồi ra về
  guestPilgrim(ev, kind);
}

const TTS_PRIORITY = { offerGift: 3, grandCeremony: 3, drawFortune: 2, sendPrayer: 1, ringBell: 1, burnIncense: 0, strikeWoodenFish: 0 };
function ttsOpts(ev, extra = {}) {
  const priority = Number.isFinite(ev.ttsPriority) ? ev.ttsPriority : TTS_PRIORITY[ev.type] ?? 1;
  return { voice: ev.ttsVoice || 'maichi', priority, jump: Boolean(ev.ttsJump) || priority >= 3, ...extra };
}

function handleEvent(ev) {
  if (!ev || !ev.type) return;
  if (ev.id) {
    if (recentEventIds.has(ev.id)) return;
    recentEventIds.add(ev.id);
    if (recentEventIds.size > 100) recentEventIds.delete(recentEventIds.values().next().value);
  }
  // Giọng đọc tuần tự qua 1 hàng đợi; server đã rút gọn / bỏ ('') khi đông. Quà tặng chen lên ngay sau câu đang đọc.
  if (ev.ttsText && ev.type !== 'drawFortune') audio?.enqueueTts(ev.ttsText, ttsOpts(ev));
  if (ev.giftAnnounce) queueGiftBanner(ev.giftAnnounce);
  // seated nhưng roster (gom 250ms) chưa tới -> chờ nhẹ để nhân vật kịp vào chỗ rồi mới diễn
  const needsWait = ev.uniqueId && !memberAvatar(ev.uniqueId) && ev.hallStatus !== 'guest' && ev.hallStatus !== 'waiting' && ['burnIncense', 'sendPrayer', 'offerGift', 'grandCeremony'].includes(ev.type);
  if (needsWait) setTimeout(() => playEvent(ev), 450);
  else playEvent(ev);
}

function playEvent(ev) {
  const t = clock.elapsed;
  const me = memberAvatar(ev.uniqueId);
  touch(me);
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
      bowAll(1);
      showGrand(ev);
      walkFor(ev, 'grand');
      director.request('buddha', 3, 8);
      break;
    case 'ringBell':
      audio?.playTempleBell(1.0);
      flare.bellSwing = 1;
      shockwave(BELL_POS, 16, 2.4);
      setTimeout(() => shockwave(BELL_POS, 16, 2.4), 450);
      if (me && !me.busy && me.kneel > 0.95) { me.bowAt = t; me.bowCount = 1; }
      setGlow(me, 0.9);
      if (ev.hallStatus === 'guest' && ev.uniqueId) guestPilgrim(ev, 'bell');
      bowAll(1);
      break;
    case 'strikeWoodenFish': {
      audio?.playWoodenFish();
      const n = Math.max(1, Math.min(5, Number(ev.count) || 1));
      for (let k = 0; k < n; k++) {
        setTimeout(() => { fishBobAt = clock.elapsed; if (k) audio?.playWoodenFish(1 + k * 0.02); }, k * 380);
      }
      setGlow(me, 0.7);
      break;
    }
    case 'drawFortune':
      audio?.playFortuneShake();
      if (me) { setGlow(me, 1, 0xfff0b0); me.nodAt = t; }
      director.request('altar', 2, 10);
      if (ev.hallStatus === 'guest' && ev.uniqueId) guestPilgrim(ev, 'fortune');
      // ttsText rỗng (server bỏ qua giọng đọc khi đông) -> enqueueTts gọi onStart ngay: tờ quẻ hiện liền
      audio?.enqueueTts(ev.ttsText || '', ttsOpts(ev, {
        onStart: () => {
          audio?.playIncenseChime();
          showFortune(ev.user, ev.fortune);
          const a = memberAvatar(ev.uniqueId);
          if (a && !a.busy && a.kneel > 0.95) { a.bowAt = clock.elapsed; a.bowCount = 1; setGlow(a, 1.2, 0xfff0b0); }
        },
        onEnd: () => {
          clearTimeout(fortuneTimer);
          fortuneTimer = setTimeout(() => document.getElementById('fortuneCard').classList.remove('visible'), 1800);
        }
      }));
      break;
    default:
      setGlow(me, 0.8);
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
// 15. HUD (temple.state)
// ============================================================================
let giftFeedSeeded = false;
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
  if (Array.isArray(st.hall)) syncRoster(st.hall, st.hallWaiting, st.hallWaitingCount);
  if (Array.isArray(st.giftFeed)) {
    renderGiftBoard(st.giftFeed);
    // lần đầu tải trang: không chiếu lại băng-rôn quà cũ
    if (!giftFeedSeeded) { st.giftFeed.forEach((g) => seenGiftIds.add(g.id)); giftFeedSeeded = true; }
  }
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
  syncCrowd(tiktokInfo.viewerCount);
  document.getElementById('statusPill').classList.toggle('live', Boolean(tiktokInfo.connected));
  document.getElementById('statusText').textContent = tiktokInfo.connected
    ? `TRỰC TIẾP${tiktokInfo.username ? ` · @${tiktokInfo.username}` : ''}`
    : 'Chùa Thiên Mụ';
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
// 16. WEBSOCKET JSON-RPC 2.0
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
        case 'hall.roster': syncRoster(p.hall, p.waiting, p.waitingCount); break;
        case 'hall.action':
          if (p.guest) {
            const g = courtGuest(p.uid, p.name, p.action, p.text);
            if (g) applyActionTo(g, p.action, p.text);
          } else applyHallAction(p.uid, p.action, p.text);
          break;
        case 'hall.arrive': arrive(p); break;
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
window.Temple3D = { scene, camera, renderer, avatars, director, applyHallAction, handleEvent, syncRoster, updateStatus, arrive, SHOTS };
