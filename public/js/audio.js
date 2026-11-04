/**
 * TempleAudioEngine
 * - Nhạc nền:
 *   + Phát trực tiếp từ link YouTube (Video thông thường hoặc Livestream 24/7 tụng kinh/nhạc thiền).
 *   + Tự động hạ nhỏ âm lượng (ducking) khi có giọng đọc TTS.
 *   + Nếu không cài đặt link YouTube hoặc link lỗi, tự động chuyển về nhạc nền thiền cục bộ (/assets/audio/bg/default.mp3 / .wav).
 * - Pháp khí: Mõ gỗ, Đại Hồng Chung, Chuông ngọc thắp hương, Lắc ống xăm
 *   + Nạp và phát các file âm thanh thật từ thư mục /assets/audio/sfx/ (không dùng thuật toán dao động).
 *   + Quản lý âm lượng hiệu ứng và bật/tắt riêng từng loại.
 * - Giọng đọc: Hàng đợi ZeroTTS phát tuần tự mượt mà.
 */

const SFX_CONFIG = {
  woodfish: ['/assets/audio/sfx/woodfish.mp3', '/assets/audio/sfx/woodfish.wav'],
  bell: ['/assets/audio/sfx/bell.mp3', '/assets/audio/sfx/bell.wav'],
  chime: ['/assets/audio/sfx/chime.mp3', '/assets/audio/sfx/chime.wav'],
  fortune: ['/assets/audio/sfx/fortune.mp3', '/assets/audio/sfx/fortune.wav']
};

const DEFAULT_BG_CANDIDATES = [
  '/assets/audio/bg/default.wav',
  '/assets/audio/bg/default.mp3'
];

function extractYouTubeId(urlOrId) {
  if (!urlOrId || typeof urlOrId !== 'string') return '';
  const str = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  const match = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/|shorts\/))([\w-]{11})/i);
  return match ? match[1] : '';
}

class TempleAudioEngine {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.sfxEnabled = true;
    this.sfxVolume = 0.8;
    this.sfxToggles = { bell: true, woodfish: true, chime: true, fortune: true };
    this.sfxBus = null;
    this.bgMusicEnabled = true;
    this.ttsEnabled = true;
    this.ttsVoice = 'maichi';

    let savedMusicVol = NaN;
    let savedTtsVol = NaN;
    try {
      savedMusicVol = parseFloat(localStorage.getItem('temple_music_vol'));
      savedTtsVol = parseFloat(localStorage.getItem('temple_tts_vol'));
    } catch (_) {}
    this.bgBaseVolume = Number.isFinite(savedMusicVol) ? Math.max(0, Math.min(1, savedMusicVol)) : 0.65;
    this.ttsVolume = Number.isFinite(savedTtsVol) ? Math.max(0, Math.min(1, savedTtsVol)) : 0.95;

    // Cache buffer âm thanh thật cho SFX
    this.sfxBuffers = new Map();
    this.sfxAudioPool = new Map();
    this.sfxResolvedPaths = new Map();

    // Nhạc nền YouTube
    this.youtubeUrl = '';
    this.youtubeVideoId = '';
    this.ytPlayer = null;
    this.ytReady = false;
    this.ytApiLoading = false;

    // Nhạc nền cục bộ dự phòng
    this.bgAudio = (typeof Audio !== 'undefined') ? new Audio() : null;
    if (this.bgAudio) {
      this.bgAudio.preload = 'auto';
      this.bgAudio.loop = true;
      this.bgAudio.volume = this.bgBaseVolume;
      this.setupLocalBgCandidates();
    }

    // Hàng đợi TTS
    this.ttsQueue = [];
    this.ttsPlaying = false;
    this.currentAudio = null;
    this.onTtsStateChange = null;

    // Tự động preload SFX sớm
    if (typeof window !== 'undefined') {
      this.initYouTubeApi();
      this.preloadSfx();
    }
  }

  ensureContext() {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = this.sfxVolume;
        this.sfxBus.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.unlocked = true;

    // Nạp buffer audio nếu chưa nạp
    this.preloadSfx();

    // Khởi động nhạc nền khi mở khóa tương tác
    if (this.bgMusicEnabled) {
      this.startMusic();
    }
    return this.ctx;
  }

  // --------------------------------------------------------------------------
  // NẠP & PHÁT FILE ÂM THANH THẬT (SFX - PHÁP KHÍ)
  // --------------------------------------------------------------------------
  async preloadSfx() {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    for (const [name, candidates] of Object.entries(SFX_CONFIG)) {
      if (this.sfxBuffers.has(name) || this.sfxResolvedPaths.has(name)) continue;
      this.resolveAndLoadSfx(name, candidates);
    }
  }

  async resolveAndLoadSfx(name, candidates) {
    for (const path of candidates) {
      try {
        const res = await fetch(path, { method: 'HEAD' });
        if (!res.ok) continue;
        this.sfxResolvedPaths.set(name, path);
        if (typeof Audio !== 'undefined') {
          const audio = new Audio(path);
          audio.preload = 'auto';
          this.sfxAudioPool.set(name, audio);
        }

        if (this.ctx) {
          const bufferRes = await fetch(path);
          const arrayBuf = await bufferRes.arrayBuffer();
          const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
          this.sfxBuffers.set(name, audioBuf);
        }
        break;
      } catch (_) {}
    }
  }

  async playSfx(name, { volume = 1.0, pitchMultiplier = 1.0 } = {}) {
    if (!this.canPlaySfx(name)) return;
    const ctx = this.ensureContext();

    // 1. Ưu tiên phát qua Web Audio Buffer (độ trễ 0ms, phát chồng nhiều âm không rè)
    if (ctx && this.sfxBuffers.has(name)) {
      try {
        const buf = this.sfxBuffers.get(name);
        const srcNode = ctx.createBufferSource();
        srcNode.buffer = buf;
        srcNode.playbackRate.value = Math.max(0.2, Math.min(3.0, pitchMultiplier));

        const gainNode = ctx.createGain();
        gainNode.gain.value = Math.max(0, Math.min(2.0, volume));

        srcNode.connect(gainNode);
        gainNode.connect(this.sfxOut(ctx));
        srcNode.start(0);
        return;
      } catch (_) {}
    }

    // Nếu chưa decode buffer, giải mã tức thì
    const resolvedPath = this.sfxResolvedPaths.get(name) || SFX_CONFIG[name]?.[0];
    if (ctx && resolvedPath && !this.sfxBuffers.has(name) && typeof fetch !== 'undefined') {
      fetch(resolvedPath)
        .then((r) => r.arrayBuffer())
        .then((ab) => ctx.decodeAudioData(ab))
        .then((audioBuf) => {
          this.sfxBuffers.set(name, audioBuf);
          try {
            const srcNode = ctx.createBufferSource();
            srcNode.buffer = audioBuf;
            srcNode.playbackRate.value = pitchMultiplier;
            const gainNode = ctx.createGain();
            gainNode.gain.value = volume;
            srcNode.connect(gainNode);
            gainNode.connect(this.sfxOut(ctx));
            srcNode.start(0);
          } catch (_) {}
        })
        .catch(() => this.playAudioElementFallback(name, volume));
      return;
    }

    // 2. Fallback bằng HTMLAudioElement
    this.playAudioElementFallback(name, volume);
  }

  playAudioElementFallback(name, volume = 1.0) {
    if (typeof Audio === 'undefined') return;
    const path = this.sfxResolvedPaths.get(name) || SFX_CONFIG[name]?.[0];
    if (!path) return;
    try {
      const a = new Audio(path);
      a.volume = Math.max(0, Math.min(1, this.sfxVolume * volume));
      const p = a.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
  }

  // 1. Tiếng Mõ gỗ tụng kinh (Âm thanh thật)
  playWoodenFish(pitchMultiplier = 1.0, kind = 'woodfish') {
    if (!this.canPlaySfx(kind)) return;
    this.playSfx('woodfish', { volume: 1.0, pitchMultiplier });
  }

  // 2. Tiếng Đại Hồng Chung (Âm thanh thật)
  playTempleBell(intensity = 1.0) {
    if (!this.canPlaySfx('bell')) return;
    this.playSfx('bell', { volume: Math.min(1.2, Math.max(0.2, intensity)) });
  }

  // 3. Tiếng Chuông ngọc thắp hương / dâng lễ (Âm thanh thật)
  playIncenseChime() {
    if (!this.canPlaySfx('chime')) return;
    this.playSfx('chime', { volume: 1.0 });
  }

  // 4. Tiếng Lắc ống xăm tre (Âm thanh thật)
  playFortuneShake() {
    if (!this.canPlaySfx('fortune')) return;
    this.playSfx('fortune', { volume: 1.0 });
  }

  // --------------------------------------------------------------------------
  // NHẠC NỀN YOUTUBE (HỖ TRỢ LINK VIDEO HOẶC LIVESTREAM 24/7)
  // --------------------------------------------------------------------------
  initYouTubeApi() {
    if (typeof window === 'undefined' || this.ytApiLoading) return;
    if (window.YT && window.YT.Player) {
      this.ensureYouTubePlayer();
      return;
    }
    this.ytApiLoading = true;
    const existingTag = typeof document !== 'undefined' && document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (!existingTag && typeof document !== 'undefined' && document.head) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }
    const prevInit = typeof window !== 'undefined' && window.onYouTubeIframeAPIReady;
    if (typeof window !== 'undefined') {
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevInit === 'function') prevInit();
        this.ensureYouTubePlayer();
      };
    }
  }

  getYouTubeContainer() {
    if (typeof document === 'undefined') return null;
    let el = document.getElementById('temple-yt-container');
    if (!el && document.body) {
      el = document.createElement('div');
      el.id = 'temple-yt-container';
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'position:fixed;bottom:0;right:0;width:200px;height:200px;opacity:0.001;pointer-events:none;z-index:-10;';
      document.body.appendChild(el);
    }
    return el;
  }

  ensureYouTubePlayer() {
    if (typeof window === 'undefined' || !window.YT || !window.YT.Player) return;
    if (this.ytPlayer) return;
    const container = this.getYouTubeContainer();
    if (!container) return;

    let playerTarget = document.getElementById('temple-yt-iframe');
    if (!playerTarget) {
      playerTarget = document.createElement('div');
      playerTarget.id = 'temple-yt-iframe';
      container.appendChild(playerTarget);
    }

    try {
      this.ytPlayer = new window.YT.Player('temple-yt-iframe', {
        height: '200',
        width: '200',
        videoId: this.youtubeVideoId || undefined,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          loop: 1,
          playsinline: 1,
          rel: 0
        },
        events: {
          onReady: (event) => {
            this.ytReady = true;
            const targetVol = this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume;
            try {
              event.target.setVolume(Math.round(targetVol * 100));
            } catch (_) {}
            if (this.bgMusicEnabled && this.unlocked && this.youtubeVideoId) {
              try {
                if (typeof event.target.loadVideoById === 'function') {
                  event.target.loadVideoById(this.youtubeVideoId);
                } else if (typeof event.target.playVideo === 'function') {
                  event.target.playVideo();
                }
              } catch (_) {
                this.startLocalBgAudio();
              }
            }
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              try { event.target.playVideo(); } catch (_) {}
            }
          },
          onError: () => {
            if (this.bgMusicEnabled && this.unlocked) {
              this.startLocalBgAudio();
            }
          }
        }
      });
    } catch (_) {}
  }

  setYouTubeUrl(url) {
    const raw = String(url || '').trim();
    if (raw === this.youtubeUrl) return;
    this.youtubeUrl = raw;
    const newId = extractYouTubeId(raw);

    if (newId !== this.youtubeVideoId) {
      this.youtubeVideoId = newId;
      if (newId) {
        this.stopLocalBgAudio();
        if (this.ytPlayer && this.ytReady) {
          try {
            this.ytPlayer.loadVideoById(newId);
            const targetVol = this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume;
            this.ytPlayer.setVolume(Math.round(targetVol * 100));
            if (!this.bgMusicEnabled || !this.unlocked) {
              this.ytPlayer.pauseVideo();
            }
          } catch (_) {
            this.startLocalBgAudio();
          }
        } else {
          this.initYouTubeApi();
        }
      } else {
        if (this.ytPlayer && this.ytReady) {
          try { this.ytPlayer.stopVideo(); } catch (_) {}
        }
        if (this.bgMusicEnabled && this.unlocked) {
          this.startLocalBgAudio();
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // NHẠC NỀN CỤC BỘ DỰ PHÒNG
  // --------------------------------------------------------------------------
  async setupLocalBgCandidates() {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    for (const path of DEFAULT_BG_CANDIDATES) {
      try {
        const res = await fetch(path, { method: 'HEAD' });
        if (res.ok && this.bgAudio) {
          const wasPlaying = !this.bgAudio.paused;
          const needChange = !this.bgAudio.src || !this.bgAudio.src.endsWith(path);
          if (needChange) {
            this.bgAudio.src = path;
            if (this.bgMusicEnabled && (this.unlocked || wasPlaying)) {
              const p = this.bgAudio.play();
              if (p && typeof p.catch === 'function') p.catch(() => {});
            }
          }
          break;
        }
      } catch (_) {}
    }
  }

  startLocalBgAudio() {
    if (!this.bgMusicEnabled || !this.bgAudio) return;
    try {
      if (!this.bgAudio.src) {
        this.bgAudio.src = DEFAULT_BG_CANDIDATES[0];
      }
      this.bgAudio.volume = this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume;
      const p = this.bgAudio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
  }

  stopLocalBgAudio() {
    if (!this.bgAudio) return;
    try {
      this.bgAudio.pause();
    } catch (_) {}
  }

  startMusic() {
    if (!this.bgMusicEnabled) return;
    if (this.youtubeVideoId && this.ytPlayer && this.ytReady) {
      try {
        const targetVol = this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume;
        this.ytPlayer.setVolume(Math.round(targetVol * 100));
        this.ytPlayer.playVideo();
      } catch (_) {
        this.startLocalBgAudio();
      }
    } else if (this.youtubeVideoId) {
      this.initYouTubeApi();
    } else {
      this.startLocalBgAudio();
    }
  }

  stopMusic() {
    if (this.ytPlayer && this.ytReady) {
      try { this.ytPlayer.pauseVideo(); } catch (_) {}
    }
    this.stopLocalBgAudio();
  }

  setPlaylist(_list = []) {
    // Tương thích ngược: danh sách phát thủ công đã được thay thế bằng YouTube URL / nhạc thiền mặc định
  }

  setMusicEnabled(enabled) {
    const v = Boolean(enabled);
    this.bgMusicEnabled = v;
    if (v) {
      if (this.unlocked) this.startMusic();
    } else {
      this.stopMusic();
    }
  }

  setMusicVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.bgBaseVolume = v;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('temple_music_vol', String(v));
      }
    } catch (_) {}

    const curVol = this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume;
    if (this.bgAudio) {
      this.bgAudio.volume = curVol;
    }
    if (this.ytPlayer && this.ytReady) {
      try {
        this.ytPlayer.setVolume(Math.round(curVol * 100));
      } catch (_) {}
    }
  }

  getDuckedVolume() {
    return Math.max(0.05, +(this.bgBaseVolume * 0.28).toFixed(2));
  }

  setBgDucking(ducked) {
    if (!this.bgMusicEnabled) return;
    const targetVol = ducked ? this.getDuckedVolume() : this.bgBaseVolume;
    if (this.bgAudio) {
      try {
        this.bgAudio.volume = targetVol;
      } catch (_) {}
    }
    if (this.ytPlayer && this.ytReady) {
      try {
        this.ytPlayer.setVolume(Math.round(targetVol * 100));
      } catch (_) {}
    }
  }

  // --------------------------------------------------------------------------
  // CÀI ĐẶT CHUNG & ĐIỀU PHỐI ÂM LƯỢNG
  // --------------------------------------------------------------------------
  applySettings(s = {}) {
    if (!s || typeof s !== 'object') return;
    if (typeof s.ttsEnabled === 'boolean') this.ttsEnabled = s.ttsEnabled;
    if (s.ttsVoice) this.ttsVoice = s.ttsVoice;
    if (typeof s.ttsVolume === 'number') this.setTtsVolume(s.ttsVolume);
    if (typeof s.musicVolume === 'number') this.setMusicVolume(s.musicVolume);
    if (typeof s.youtubeUrl === 'string') this.setYouTubeUrl(s.youtubeUrl);
    if (typeof s.bgMusicEnabled === 'boolean') this.setMusicEnabled(s.bgMusicEnabled);
    if (typeof s.sfxEnabled === 'boolean') this.sfxEnabled = s.sfxEnabled;
    if (typeof s.sfxVolume === 'number') this.setSfxVolume(s.sfxVolume);
    if (s.sfx && typeof s.sfx === 'object') {
      for (const key of Object.keys(this.sfxToggles)) {
        if (typeof s.sfx[key] === 'boolean') this.sfxToggles[key] = s.sfx[key];
      }
    }
  }

  setTtsVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.ttsVolume = v;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('temple_tts_vol', String(v));
      }
    } catch (_) {}
    if (this.currentAudio) {
      this.currentAudio.volume = this.ttsVolume;
    }
  }

  setSfxVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.sfxVolume = v;
    if (this.sfxBus && this.ctx) {
      try {
        this.sfxBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
      } catch (_) {
        this.sfxBus.gain.value = v;
      }
    }
  }

  sfxOut(ctx) {
    return this.sfxBus || ctx.destination;
  }

  canPlaySfx(kind) {
    return this.sfxEnabled && this.sfxVolume > 0 && this.sfxToggles[kind] !== false;
  }

  // --------------------------------------------------------------------------
  // HÀNG ĐỢI GIỌNG ĐỌC ZEROTTS & AUTO-DUCKING
  // --------------------------------------------------------------------------
  enqueueTts(text, options = {}) {
    const onStart = typeof options.onStart === 'function' ? options.onStart : null;
    const onEnd = typeof options.onEnd === 'function' ? options.onEnd : null;

    if (!this.ttsEnabled) {
      if (onStart) onStart();
      if (onEnd) setTimeout(onEnd, 5500);
      return;
    }
    const clean = String(text || '').trim();
    if (!clean) {
      if (onStart) onStart();
      if (onEnd) setTimeout(onEnd, 5500);
      return;
    }

    const priority = Number.isFinite(options.priority) ? options.priority : 1;
    const jump = Boolean(options.jump);
    if (this.ttsQueue.length >= 6) {
      let victim = -1;
      for (let i = 0; i < this.ttsQueue.length; i++) {
        const q = this.ttsQueue[i];
        if (q.priority >= 3) continue;
        if (victim < 0 || q.priority < this.ttsQueue[victim].priority) victim = i;
      }
      if (victim >= 0 && this.ttsQueue[victim].priority <= priority) {
        const [dropped] = this.ttsQueue.splice(victim, 1);
        if (dropped?.onStart) dropped.onStart();
        if (dropped?.onEnd) dropped.onEnd();
      } else if (priority < 3) {
        if (onStart) onStart();
        if (onEnd) setTimeout(onEnd, 1500);
        return;
      }
    }

    const item = {
      id: `tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: clean,
      voice: (options.voice || this.ttsVoice || 'maichi').toLowerCase(),
      url: options.url || null,
      onStart,
      onEnd,
      priority,
      jump,
      fetchPromise: null
    };

    if (!item.url) {
      item.fetchPromise = this.fetchZeroTtsAudio(item.text, item.voice);
    }

    if (jump) {
      let at = 0;
      while (at < this.ttsQueue.length && this.ttsQueue[at].jump) at++;
      this.ttsQueue.splice(at, 0, item);
    } else {
      this.ttsQueue.push(item);
    }
    this.processTtsQueue();
  }

  async fetchZeroTtsAudio(text, voice = 'maichi') {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 45000) : null;
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }),
        signal: controller ? controller.signal : undefined
      });
      const data = await res.json();
      if (data && data.ok && (data.audio || data.url)) {
        return { ok: true, url: data.audio || data.url, audio: data.audio };
      }
      return { ok: false, error: data?.error || 'ZeroTTS unavailable' };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async processTtsQueue() {
    if (this.ttsPlaying || this.ttsQueue.length === 0) return;
    this.ttsPlaying = true;
    const item = this.ttsQueue.shift();

    try {
      let audioUrl = item.url;
      if (!audioUrl && item.fetchPromise) {
        const res = await item.fetchPromise;
        if (res && res.ok && (res.audio || res.url)) {
          audioUrl = res.audio || res.url;
        }
      }

      if (audioUrl && this.ttsEnabled) {
        this.setBgDucking(true);
        if (this.onTtsStateChange) {
          this.onTtsStateChange({ speaking: true, synthesizing: false, text: item.text });
        }
        if (item.onStart) item.onStart();
        await this.playWavUrl(audioUrl);
        if (item.onEnd) item.onEnd();
      } else {
        if (item.onStart) item.onStart();
        if (item.onEnd) item.onEnd();
      }
    } catch (err) {
      console.warn('[ZeroTTS Playback Warning]', err);
      if (item.onStart) item.onStart();
      if (item.onEnd) item.onEnd();
    } finally {
      this.ttsPlaying = false;
      if (this.ttsQueue.length === 0) {
        this.setBgDucking(false);
        if (this.onTtsStateChange) {
          this.onTtsStateChange({ speaking: false, synthesizing: false, text: '' });
        }
      } else {
        setTimeout(() => this.processTtsQueue(), 250);
      }
    }
  }

  playWavUrl(url) {
    if (typeof Audio === 'undefined') return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      let audio = null;
      const safetyTimer = setTimeout(() => finish(), 45000);
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(safetyTimer);
        if (audio) {
          try { audio.pause(); } catch (_) {}
        }
        if (this.currentAudio === audio) this.currentAudio = null;
        resolve();
      };
      try {
        audio = new Audio(url);
        this.currentAudio = audio;
        audio.volume = this.ttsVolume;
        audio.onended = finish;
        audio.onerror = finish;
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(finish);
        }
      } catch (_) {
        finish();
      }
    });
  }
}

if (typeof window !== 'undefined') {
  window.TempleAudioEngine = TempleAudioEngine;
  window.extractYouTubeId = extractYouTubeId;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TempleAudioEngine;
  module.exports.TempleAudioEngine = TempleAudioEngine;
  module.exports.extractYouTubeId = extractYouTubeId;
}
