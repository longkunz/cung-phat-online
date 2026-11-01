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
const FOCUS_DEPTH = 0.35; // Mặt phẳng bàn thờ/lư hương đứng yên -> hotspot DOM luôn khớp ảnh
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

// Inverse parallax mapping bằng lặp điểm bất động (4 bước): tìm điểm nguồn p sao cho
// p + offset * (depth(p) - focus) = uv. Rẻ, mượt, không rách ảnh nhờ depth map đã làm mờ.
const FRAG = /* glsl */ `
  precision mediump float;
  uniform sampler2D uImage;
  uniform sampler2D uDepth;
  uniform vec2 uOffset;
  uniform float uFocus;
  uniform float uGlow;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    vec2 p = uv;
    for (int i = 0; i < 4; i++) {
      float d = texture2D(uDepth, p).r;
      p = uv - uOffset * (d - uFocus);
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
  const IDLE_AMP_X = 0.018; // biên độ dịch (đơn vị uv) cho điểm có độ sâu chênh 1.0 so với focus
  const IDLE_AMP_Y = 0.010;
  const BASE_ZOOM = 1.03;   // phóng nhẹ sẵn để mép ảnh không lộ khi parallax

  const cam2d = {
    x: 0, y: 0, zoom: BASE_ZOOM, cx: 0.5, cy: 0.47, glow: 0,
    shake: 0
  };
  const target = { zoom: BASE_ZOOM, cx: 0.5, cy: 0.47, glow: 0, swayBoost: 1 };
  let cueUntil = 0;
  let pointer = { x: 0, y: 0 };

  const CUES = {
    // Phật tử bước lên dâng hương/cầu nguyện/dâng lễ: đẩy nhẹ về phía bàn thờ
    altar: { zoom: 1.075, cx: 0.5, cy: 0.5, glow: 0.15, ms: 6500, swayBoost: 0.7 },
    // Đại lễ: tiến sát tượng Phật + hào quang
    buddha: { zoom: 1.16, cx: 0.5, cy: 0.27, glow: 1, ms: 7500, swayBoost: 1.4 },
    fortune: { zoom: 1.05, cx: 0.62, cy: 0.5, glow: 0.2, ms: 5000, swayBoost: 0.8 },
    bell: { shake: 1.0 },
    fish: { shake: 0.35 }
  };

  function cue(name) {
    const c = CUES[name];
    if (!c) return;
    if (c.shake) {
      cam2d.shake = Math.max(cam2d.shake, c.shake);
      return;
    }
    const now = performance.now();
    // Không để cue nhỏ cắt ngang cue lớn (Đại lễ) đang diễn ra
    if (now < cueUntil && target.zoom > c.zoom) return;
    Object.assign(target, { zoom: c.zoom, cx: c.cx, cy: c.cy, glow: c.glow, swayBoost: c.swayBoost });
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

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || now - lastRender < FRAME_MS) return;
    lastRender = now;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;

    if (now > cueUntil) {
      Object.assign(target, { zoom: BASE_ZOOM, cx: 0.5, cy: 0.47, glow: 0, swayBoost: 1 });
    }

    cam2d.zoom = damp(cam2d.zoom, target.zoom, 1.6, dt);
    cam2d.cx = damp(cam2d.cx, target.cx, 1.6, dt);
    cam2d.cy = damp(cam2d.cy, target.cy, 1.6, dt);
    cam2d.glow = damp(cam2d.glow, target.glow, 2.2, dt);
    cam2d.shake = damp(cam2d.shake, 0, 5.5, dt);

    const sway = target.swayBoost;
    const sx = Math.sin(t * 0.23) * IDLE_AMP_X * sway + pointer.x * 0.012;
    const sy = Math.sin(t * 0.17 + 1.3) * IDLE_AMP_Y * sway + pointer.y * 0.008;
    const shakeX = cam2d.shake * 0.006 * Math.sin(t * 47);
    const shakeY = cam2d.shake * 0.004 * Math.sin(t * 61 + 0.7);
    cam2d.x = damp(cam2d.x, sx, 3, dt);
    cam2d.y = damp(cam2d.y, sy, 3, dt);
    const ox = cam2d.x + shakeX;
    const oy = cam2d.y + shakeY;

    // 1. Ảnh nền: offset trong uv (trục y của uv hướng lên)
    uniforms.uOffset.value.set(ox, -oy);
    uniforms.uGlow.value = cam2d.glow;
    renderer.render(scene, cam);

    // 2. Lớp DOM: cùng offset tính ra px, mỗi lớp nhân với (độ sâu - focus) qua CSS
    sceneCamera.style.setProperty('--plx', `${(ox * STAGE_W).toFixed(2)}px`);
    sceneCamera.style.setProperty('--ply', `${(oy * STAGE_H).toFixed(2)}px`);
    // 3. Zoom cả cảnh (ảnh nền + DOM) bằng 1 transform GPU -> luôn khớp nhau
    sceneCamera.style.transformOrigin = `${(cam2d.cx * 100).toFixed(2)}% ${(cam2d.cy * 100).toFixed(2)}%`;
    sceneCamera.style.transform = `scale(${cam2d.zoom.toFixed(4)})`;
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
