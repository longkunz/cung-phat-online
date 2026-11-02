/**
 * TempleAudioEngine
 * - Nhạc nền: danh sách phát tối đa 3 bài (cài đặt ở trang Admin), phát lần lượt theo thứ tự,
 *   hết bài cuối quay lại bài đầu. Tự hạ nhỏ (ducking) khi có giọng đọc. Lỗi file -> bỏ qua sang bài kế;
 *   tất cả đều lỗi -> nhạc thiền tổng hợp (Web Audio) dự phòng.
 * - Pháp khí: Mõ gỗ, Đại Hồng Chung, Chuông ngọc thắp hương, Lắc ống xăm — chung 1 kênh âm lượng hiệu ứng,
 *   bật/tắt riêng từng loại.
 * - Giọng đọc: Hàng đợi ZeroTTS phát tuần tự mượt mà.
 * Mọi cài đặt từ server áp dụng qua applySettings(state.settings).
 */
const DEFAULT_BG_PLAYLIST = [{ id: 'default', name: 'Nam Mô A Di Đà Phật (mặc định)', url: '/assets/bg_chant.m4a' }];

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

    this.useSynthMusicFallback = false;
    this.synthBgTimer = null;
    this.playlist = DEFAULT_BG_PLAYLIST.slice();
    this.playlistSig = '';
    this.trackIndex = 0;
    this.trackErrors = 0;
    this.bgAudio = new Audio();
    this.bgAudio.preload = 'auto';
    this.bgAudio.volume = this.bgBaseVolume;
    this.bgAudio.addEventListener('ended', () => this.nextTrack());
    this.bgAudio.addEventListener('error', () => this.onTrackError());
    this.bgAudio.addEventListener('playing', () => {
      this.trackErrors = 0;
      if (this.onTrackChange) this.onTrackChange(this.currentTrack());
    });
    this.onTrackChange = null;
    this.setPlaylist(this.playlist, { force: true });

    this.ttsQueue = [];
    this.ttsPlaying = false;
    this.currentAudio = null;
    this.onTtsStateChange = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVolume;
      this.sfxBus.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.unlocked = true;
    if (this.bgMusicEnabled) {
      this.startZenAmbience();
    }
    return this.ctx;
  }

  // Áp dụng toàn bộ cài đặt âm thanh từ server (temple.state.settings)
  applySettings(s = {}) {
    if (!s || typeof s !== 'object') return;
    if (typeof s.ttsEnabled === 'boolean') this.ttsEnabled = s.ttsEnabled;
    if (s.ttsVoice) this.ttsVoice = s.ttsVoice;
    if (typeof s.ttsVolume === 'number') this.setTtsVolume(s.ttsVolume);
    if (typeof s.musicVolume === 'number') this.setMusicVolume(s.musicVolume);
    if (Array.isArray(s.bgPlaylist)) this.setPlaylist(s.bgPlaylist);
    if (typeof s.bgMusicEnabled === 'boolean') this.setMusicEnabled(s.bgMusicEnabled);
    if (typeof s.sfxEnabled === 'boolean') this.sfxEnabled = s.sfxEnabled;
    if (typeof s.sfxVolume === 'number') this.setSfxVolume(s.sfxVolume);
    if (s.sfx && typeof s.sfx === 'object') {
      for (const key of Object.keys(this.sfxToggles)) {
        if (typeof s.sfx[key] === 'boolean') this.sfxToggles[key] = s.sfx[key];
      }
    }
  }

  // --------------------------------------------------------------------------
  // 1. NHẠC NỀN — DANH SÁCH PHÁT TỐI ĐA 3 BÀI (CÓ AUTO-DUCKING KHI ĐỌC LỜI KHẤN)
  // --------------------------------------------------------------------------
  getDuckedVolume() {
    return Math.max(0.08, +(this.bgBaseVolume * 0.35).toFixed(2));
  }

  currentTrack() {
    return this.playlist[this.trackIndex] || null;
  }

  setPlaylist(list, { force = false } = {}) {
    const clean = (Array.isArray(list) ? list : [])
      .filter((t) => t && typeof t.url === 'string' && t.url)
      .slice(0, 3)
      .map((t) => ({ id: t.id || t.url, name: t.name || '', url: t.url }));
    const sig = clean.map((t) => t.url).join('|');
    if (!force && sig === this.playlistSig) return;
    const playingUrl = this.currentTrack()?.url;
    this.playlist = clean;
    this.playlistSig = sig;
    this.trackErrors = 0;
    if (!clean.length) {
      this.stopZenAmbience();
      try { this.bgAudio.removeAttribute('src'); this.bgAudio.load(); } catch (_) {}
      return;
    }
    // Bài đang phát vẫn còn trong danh sách mới -> phát tiếp, không ngắt; ngược lại bắt đầu lại từ bài 1
    const keepIdx = clean.findIndex((t) => t.url === playingUrl);
    if (keepIdx >= 0 && !force) {
      this.trackIndex = keepIdx;
      this.bgAudio.loop = clean.length === 1;
      return;
    }
    this.useSynthMusicFallback = false;
    if (this.synthBgTimer) {
      clearInterval(this.synthBgTimer);
      this.synthBgTimer = null;
    }
    this.loadTrack(0, !force);
  }

  loadTrack(index, autoplay = true) {
    if (!this.playlist.length) return;
    this.trackIndex = ((index % this.playlist.length) + this.playlist.length) % this.playlist.length;
    const track = this.playlist[this.trackIndex];
    try {
      this.bgAudio.loop = this.playlist.length === 1;
      this.bgAudio.src = track.url;
      this.bgAudio.volume = this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume;
      if (autoplay && this.bgMusicEnabled && this.unlocked) {
        const p = this.bgAudio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (_) {}
  }

  nextTrack() {
    if (this.playlist.length <= 1) return; // 1 bài: bgAudio.loop tự lặp
    this.loadTrack(this.trackIndex + 1);
  }

  onTrackError() {
    if (!this.playlist.length || !this.bgAudio.getAttribute('src')) return;
    this.trackErrors += 1;
    if (this.trackErrors >= this.playlist.length) {
      // Tất cả bài đều lỗi -> nhạc thiền tổng hợp dự phòng
      this.useSynthMusicFallback = true;
      if (this.bgMusicEnabled && this.unlocked) this.startDefaultZenSynthLoop();
      return;
    }
    setTimeout(() => this.loadTrack(this.trackIndex + 1), 800);
  }

  setMusicEnabled(enabled) {
    const v = Boolean(enabled);
    if (v === this.bgMusicEnabled) return;
    this.bgMusicEnabled = v;
    if (v) {
      if (this.unlocked) this.startZenAmbience();
    } else {
      this.stopZenAmbience();
    }
  }

  setMusicVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.bgBaseVolume = v;
    try {
      localStorage.setItem('temple_music_vol', String(v));
    } catch (_) {}
    if (this.bgAudio && !this.useSynthMusicFallback) {
      this.bgAudio.volume = this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume;
    }
  }

  setTtsVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.ttsVolume = v;
    try {
      localStorage.setItem('temple_tts_vol', String(v));
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
      this.sfxBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  // Kênh ra của hiệu ứng (đi qua âm lượng hiệu ứng chung)
  sfxOut(ctx) {
    return this.sfxBus || ctx.destination;
  }

  canPlaySfx(kind) {
    return this.sfxEnabled && this.sfxVolume > 0 && this.sfxToggles[kind] !== false;
  }

  startZenAmbience() {
    if (!this.bgMusicEnabled || !this.playlist.length) return;
    if (this.useSynthMusicFallback) {
      this.startDefaultZenSynthLoop();
      return;
    }
    try {
      if (!this.bgAudio.getAttribute('src')) this.loadTrack(this.trackIndex, false);
      this.bgAudio.volume = this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume;
      if (this.bgAudio.paused) {
        const p = this.bgAudio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (_) {
      this.useSynthMusicFallback = true;
      this.startDefaultZenSynthLoop();
    }
  }

  startDefaultZenSynthLoop() {
    if (!this.bgMusicEnabled || this.synthBgTimer) return;
    const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
    let step = 0;
    const playZenNote = () => {
      if (!this.bgMusicEnabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const freq = PENTATONIC[step % PENTATONIC.length];
        step++;
        const vol = (this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume) * 0.18;
        if (vol <= 0.002) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.6);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(now);
        osc.stop(now + 4.25);
      } catch (_) {}
    };
    playZenNote();
    this.synthBgTimer = setInterval(playZenNote, 3600);
  }

  stopZenAmbience() {
    try {
      this.bgAudio.pause();
    } catch (_) {}
    if (this.synthBgTimer) {
      clearInterval(this.synthBgTimer);
      this.synthBgTimer = null;
    }
  }

  setBgDucking(ducked) {
    if (!this.bgMusicEnabled) return;
    try {
      if (!this.useSynthMusicFallback && this.bgAudio) {
        this.bgAudio.volume = ducked ? this.getDuckedVolume() : this.bgBaseVolume;
      }
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 2. TIẾNG MÕ GỖ TỤNG KINH (WOODEN FISH PERCUSSION SYNTH)
  // --------------------------------------------------------------------------
  playWoodenFish(pitchMultiplier = 1.0, kind = 'woodfish') {
    if (!this.canPlaySfx(kind)) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      const baseFreq = 620 * pitchMultiplier * (0.98 + Math.random() * 0.04);
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(baseFreq * 1.4, now);
      osc1.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.018);
      osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.82, now + 0.14);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(baseFreq * 1.15, now);
      filter.Q.setValueAtTime(4.0, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc1.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxOut(ctx));

      osc1.onended = () => {
        osc1.disconnect();
        filter.disconnect();
        gain.disconnect();
      };

      osc1.start(now);
      osc1.stop(now + 0.16);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 3. TIẾNG ĐẠI HỒNG CHUNG (TEMPLE BRONZE BELL)
  // --------------------------------------------------------------------------
  playTempleBell(intensity = 1.0) {
    if (!this.canPlaySfx('bell')) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;

      const base = 174;
      const partials = [
        { ratio: 0.5, amp: 0.22, decay: 4.2 },
        { ratio: 1.0, amp: 0.35, decay: 3.6 },
        { ratio: 1.506, amp: 0.16, decay: 2.4 },
        { ratio: 2.0, amp: 0.18, decay: 1.9 }
      ];

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.28 * Math.min(1.0, intensity), now);
      master.connect(this.sfxOut(ctx));

      partials.forEach((p, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(base * p.ratio, now);

        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(p.amp, now + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

        osc.connect(g);
        g.connect(master);
        osc.onended = () => {
          osc.disconnect();
          g.disconnect();
          if (idx === 0) master.disconnect();
        };
        osc.start(now);
        osc.stop(now + p.decay + 0.05);
      });
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 4. TIẾNG LẮC ỐNG XĂM TRE (FORTUNE STICK SHAKER)
  // --------------------------------------------------------------------------
  playFortuneShake() {
    if (!this.canPlaySfx('fortune')) return;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        this.playWoodenFish(1.32 + (i % 2) * 0.16, 'fortune');
      }, i * 120);
    }
  }

  // --------------------------------------------------------------------------
  // 5. TIẾNG CHUÔNG NGỌC DÂNG LỄ / THẮP HƯƠNG (SINGING CHIME)
  // --------------------------------------------------------------------------
  playIncenseChime() {
    if (!this.canPlaySfx('chime')) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const notes = [528, 660];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);

        gain.gain.setValueAtTime(0.0001, now + idx * 0.1);
        gain.gain.linearRampToValueAtTime(0.10, now + idx * 0.1 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 1.1);

        osc.connect(gain);
        gain.connect(this.sfxOut(ctx));
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 1.15);
      });
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 6. ZEROTTS VOICE QUEUE & PREFETCHER
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

    // priority: 0 (thắp hương) .. 3 (cảm tạ quà tặng — không bao giờ bị bỏ). jump: chen lên ngay sau câu đang đọc.
    const priority = Number.isFinite(options.priority) ? options.priority : 1;
    const jump = Boolean(options.jump);
    if (this.ttsQueue.length >= 6) {
      // Đầy hàng: bỏ câu ưu tiên thấp nhất (cũ nhất trong cùng mức), không bao giờ bỏ lời cảm tạ quà
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
        // câu mới còn kém ưu tiên hơn mọi câu đang chờ -> bỏ qua giọng đọc (vẫn chạy hiệu ứng)
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
      // Không ngắt câu đang đọc: chen trước mọi câu thường đang chờ, sau các câu quà tặng đã chen trước (FIFO giữa quà)
      let at = 0;
      while (at < this.ttsQueue.length && this.ttsQueue[at].jump) at++;
      this.ttsQueue.splice(at, 0, item);
    } else {
      this.ttsQueue.push(item);
    }
    this.processTtsQueue();
  }

  async fetchZeroTtsAudio(text, voice = 'maichi') {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice })
      });
      const data = await res.json();
      if (data && data.ok && (data.audio || data.url)) {
        return { ok: true, url: data.audio || data.url, audio: data.audio };
      }
      return { ok: false, error: data?.error || 'ZeroTTS unavailable' };
    } catch (err) {
      return { ok: false, error: err.message };
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
        if (item.onEnd) setTimeout(item.onEnd, 5500);
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
    return new Promise((resolve) => {
      let done = false;
      let audio = null;
      // Chốt an toàn: nếu file bị treo (không bao giờ bắn ended/error) hàng đợi TTS sẽ kẹt vĩnh viễn
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

window.TempleAudioEngine = TempleAudioEngine;
