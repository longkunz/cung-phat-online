/**
 * Stage 2.5D — Chánh Điện có chiều sâu (Depth Parallax + Camera Choreography)
 *
 * Ý tưởng: ảnh nền phẳng + bản đồ độ sâu (assets/amitabha_stage_depth.png, sinh bởi scripts/gen_depth_map.py).
 * Shader WebGL dịch từng điểm ảnh theo độ sâu khi "camera" chuyển động -> cảm giác không gian 3D.
 * Các lớp DOM trong #sceneCamera (hào quang, lư hương, Phật tử, khói...) dịch theo cùng độ sâu bằng
 * CSS `translate` với biến --d (độ sâu riêng của từng lớp), nên vẫn khớp với ảnh nền.
 *
 * - Tắt hoàn toàn bằng ?fx=2d (hoặc tự quay về ảnh tĩnh nếu máy không có WebGL).
 * - Giữ 30 FPS, tự dừng khi tab ẩn; shader chỉ 5 lần đọc texture/pixel.
 * - API cho live.js: window.Stage25D.cue('altar' | 'buddha' | 'bell' | 'fish' | 'fortune').
 */
import * as THREE from '/vendor/three/three.module.min.js';

const params = new URLSearchParams(window.location.search);
const FOCUS_DEPTH = 0.35; // Khi camera lắc ngang/dọc: mặt phẳng bàn thờ đứng yên, tượng Phật trượt ngược chiều thảm
const DOLLY_FOCUS = 0.0;  // Khi camera tiến vào: tường sau giữ nguyên cỡ, càng gần càng phóng to (không lộ mép ảnh)
const STAGE_W = 1080;
const STAGE_H = 1920;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (_) {
    return false;
  }
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Mô hình camera (khớp 100% với công thức CSS của lớp .plx trong live.css):
//   điểm ảnh p ở độ sâu d hiện ra tại   c + (p - c) * s(d) + offset * (d - focus)
//   với s(d) = 1 + dolly * (d - dollyFocus)  -> lớp gần phóng to nhanh hơn lớp xa (camera TIẾN VÀO cảnh)
// Shader giải ngược tìm p bằng lặp điểm bất động (4 bước). Rẻ, không rách ảnh nhờ depth map đã làm mờ.
const FRAG = /* glsl */ `
  precision mediump float;
  uniform sampler2D uImage;
  uniform sampler2D uDepth;
  uniform vec2 uOffset;
  uniform float uFocus;
  uniform vec2 uCenter;
  uniform float uDolly;
  uniform float uDollyFocus;
  uniform float uGlow;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    vec2 p = uv;
    for (int i = 0; i < 4; i++) {
      float d = texture2D(uDepth, p).r;
      float s = 1.0 + uDolly * (d - uDollyFocus);
      p = uCenter + (uv - uOffset * (d - uFocus) - uCenter) / s;
    }
    p = clamp(p, vec2(0.001), vec2(0.999));
    vec3 col = texture2D(uImage, p).rgb;

    // Ánh hào quang tỏa từ tượng Phật khi có Đại Lễ (nhẹ, không làm mất chi tiết khuôn mặt)
    if (uGlow > 0.001) {
      vec2 c = vec2(0.5, 0.74); // tâm hào quang (toạ độ uv, gốc dưới-trái)
      float r = distance(vec2(p.x, p.y * 1.78), vec2(c.x, c.y * 1.78));
      float halo = smoothstep(0.55, 0.0, r);
      col += vec3(1.0, 0.82, 0.45) * halo * uGlow * 0.35;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

function loadTexture(loader, url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

const damp = (current, target, lambda, dt) => target + (current - target) * Math.exp(-lambda * dt);

async function initStage25D() {
  const sceneCamera = document.getElementById('sceneCamera');
  const bgImg = document.querySelector('.sanctuary-bg-img');
  if (!sceneCamera || !bgImg) return null;

  if (params.get('fx') === '2d' || !hasWebGL()) {
    console.info('[Stage25D] Dùng chế độ 2D phẳng');
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.id = 'stageGl';
  canvas.className = 'stage-gl';
  canvas.width = STAGE_W;
  canvas.height = STAGE_H;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
  } catch (err) {
    console.warn('[Stage25D] Không tạo được WebGL renderer, dùng ảnh 2D:', err);
    return null;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(STAGE_W, STAGE_H, false);
  // Không chuyển đổi không gian màu: hiển thị đúng từng pixel như thẻ <img> gốc
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  const loader = new THREE.TextureLoader();
  let imageTex;
  let depthTex;
  try {
    [imageTex, depthTex] = await Promise.all([
      loadTexture(loader, bgImg.currentSrc || bgImg.src),
      loadTexture(loader, '/assets/amitabha_stage_depth.png')
    ]);
  } catch (err) {
    console.warn('[Stage25D] Không tải được texture, dùng ảnh 2D:', err);
    renderer.dispose();
    return null;
  }
  for (const t of [imageTex, depthTex]) {
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
  }

  const uniforms = {
    uImage: { value: imageTex },
    uDepth: { value: depthTex },
    uOffset: { value: new THREE.Vector2(0, 0) },
    uFocus: { value: FOCUS_DEPTH },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uDolly: { value: 0 },
    uDollyFocus: { value: DOLLY_FOCUS },
    uGlow: { value: 0 }
  };
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false })
  );
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  bgImg.insertAdjacentElement('afterend', canvas);
  renderer.render(scene, cam);
  bgImg.classList.add('replaced-by-gl');
  document.body.classList.add('fx-25d');

  // ------------------------------------------------------------------------
  // Camera choreography
  // ------------------------------------------------------------------------
  // Biên độ lắc (đơn vị uv cho chênh độ sâu 1.0): thảm sát đáy trượt ~30px, tượng Phật ngược chiều ~7px
  const SWAY_X = 0.045;
  const SWAY_Y = 0.022;
  const BASE_ZOOM = 1.045; // phóng sẵn toàn cảnh để mép ảnh không lộ khi lắc
  const IDLE_DOLLY = 0.07; // camera "thở" tiến/lùi nhẹ liên tục
  const IDLE = { zoom: BASE_ZOOM, dolly: IDLE_DOLLY, cx: 0.5, cy: 0.5, glow: 0, sway: 1 };

  const CUES = {
    // Phật tử bước lên dâng hương/cầu nguyện/dâng lễ: camera tiến vào về phía bàn thờ
    altar: { zoom: 1.06, dolly: 0.32, cx: 0.5, cy: 0.5, glow: 0.15, ms: 6500, sway: 0.6 },
    // Đại lễ: tiến sâu tới sát tượng Phật + hào quang
    buddha: { zoom: 1.1, dolly: 0.55, cx: 0.5, cy: 0.3, glow: 1, ms: 8000, sway: 1.3 },
    fortune: { zoom: 1.05, dolly: 0.25, cx: 0.75, cy: 0.5, glow: 0.2, ms: 5000, sway: 0.7 },
    bell: { shake: 1.0 },
    fish: { shake: 0.4 }
  };

  const cur = { ...IDLE, x: 0, y: 0, shake: 0 };
  const target = { ...IDLE };
  let cueUntil = 0;
  let cueRank = 0;
  let pointer = { x: 0, y: 0 };

  function cue(name) {
    const c = CUES[name];
    if (!c) return;
    if (c.shake) {
      cur.shake = Math.max(cur.shake, c.shake);
      return;
    }
    const now = performance.now();
    // Không để cue nhỏ cắt ngang cue lớn (Đại lễ) đang diễn ra
    if (now < cueUntil && cueRank > c.dolly) return;
    Object.assign(target, { zoom: c.zoom, dolly: c.dolly, cx: c.cx, cy: c.cy, glow: c.glow, sway: c.sway });
    cueRank = c.dolly;
    cueUntil = now + c.ms;
  }

  if (!document.body.classList.contains('obs-mode')) {
    // Xem trước trên trình duyệt: di chuột để "nhìn quanh" thử hiệu ứng chiều sâu
    window.addEventListener('pointermove', (e) => {
      pointer = { x: (e.clientX / window.innerWidth - 0.5) * 2, y: (e.clientY / window.innerHeight - 0.5) * 2 };
    });
  }

  const FRAME_MS = 1000 / 30;
  let last = performance.now();
  let lastRender = 0;
  let t = 0;
  const camStyle = sceneCamera.style;

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || now - lastRender < FRAME_MS) return;
    lastRender = now;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;

    if (now > cueUntil) {
      Object.assign(target, IDLE);
      cueRank = 0;
    }

    for (const k of ['zoom', 'dolly', 'cx', 'cy']) cur[k] = damp(cur[k], target[k], 1.4, dt);
    cur.glow = damp(cur.glow, target.glow, 2.2, dt);
    cur.sway = damp(cur.sway, target.sway, 1.5, dt);
    cur.shake = damp(cur.shake, 0, 5.5, dt);

    // Lắc theo quỹ đạo Lissajous chậm (chu kỳ ~27s x ~37s) + "thở" tiến lùi chu kỳ ~21s
    const sx = Math.sin(t * 0.23) * SWAY_X * cur.sway + pointer.x * 0.03;
    const sy = Math.sin(t * 0.17 + 1.3) * SWAY_Y * cur.sway + pointer.y * 0.015;
    cur.x = damp(cur.x, sx, 3, dt);
    cur.y = damp(cur.y, sy, 3, dt);
    const ox = cur.x + cur.shake * 0.006 * Math.sin(t * 47);
    const oy = cur.y + cur.shake * 0.004 * Math.sin(t * 61 + 0.7);
    const dolly = Math.max(0, cur.dolly + Math.sin(t * 0.3) * 0.04);

    // 1. Ảnh nền (uv: trục y hướng lên)
    uniforms.uOffset.value.set(ox, -oy);
    uniforms.uCenter.value.set(cur.cx, 1 - cur.cy);
    uniforms.uDolly.value = dolly;
    uniforms.uGlow.value = cur.glow;
    renderer.render(scene, cam);

    // 2. Lớp DOM: cùng mô hình camera qua biến CSS (xem .fx-25d .plx trong live.css)
    camStyle.setProperty('--plx', `${(ox * STAGE_W).toFixed(2)}px`);
    camStyle.setProperty('--ply', `${(oy * STAGE_H).toFixed(2)}px`);
    camStyle.setProperty('--cx', (cur.cx * STAGE_W).toFixed(1));
    camStyle.setProperty('--cy', (cur.cy * STAGE_H).toFixed(1));
    camStyle.setProperty('--dolly', dolly.toFixed(4));
    // 3. Phóng đều toàn cảnh (khung hình) quanh cùng tâm camera
    camStyle.transformOrigin = `${(cur.cx * 100).toFixed(2)}% ${(cur.cy * 100).toFixed(2)}%`;
    camStyle.transform = `scale(${cur.zoom.toFixed(4)})`;
  }
  requestAnimationFrame(frame);

  console.info('[Stage25D] Đã bật chế độ Chánh Điện 2.5D');
  return { cue };
}

window.Stage25D = { cue() {} }; // no-op cho tới khi khởi tạo xong
initStage25D()
  .then((api) => {
    if (api) window.Stage25D = api;
  })
  .catch((err) => console.warn('[Stage25D] Lỗi khởi tạo, giữ chế độ 2D:', err));
