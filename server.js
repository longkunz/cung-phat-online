const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TTS_CACHE_DIR = path.join(DATA_DIR, 'tts-cache');
const STATE_FILE = path.join(DATA_DIR, 'merit-state.json');

const MUSIC_DIR = path.join(DATA_DIR, 'music');
const MUSIC_LIBRARY_FILE = path.join(MUSIC_DIR, 'library.json');

fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
fs.mkdirSync(MUSIC_DIR, { recursive: true });

// ============================================================================
// 1. BỘ 18 QUẺ LINH XĂM CHÙA THIÊN MỤ (FORTUNE STICKS DECK)
// ============================================================================
const FORTUNE_DECK = [
  {
    number: 1,
    rank: 'Thượng Thượng Cát',
    title: 'Nhật Xuất Đông Phương — Mặt Trời Mọc Phương Đông',
    poem: 'Đông phương nhật xuất chiếu Càn Khôn\nHoa nở đầy cành rạng sắc xuân\nCông danh tài lộc đều viên mãn\nGia đạo bình an phúc lộc tồn.',
    meaning: 'Mọi sự mưu cầu đều đại cát đại lợi. Công việc hanh thông, quý nhân phù trợ, gia đình hòa thuận ấm êm.',
    ttsSummary: 'Quẻ số 1, Thượng Thượng Cát, Nhật Xuất Đông Phương. Mọi sự mưu cầu đều đại cát đại lợi, công danh tài lộc viên mãn, quý nhân phù trợ.'
  },
  {
    number: 8,
    rank: 'Thượng Cát',
    title: 'Kim Liên Khai Nở — Sen Vàng Tỏa Ngát',
    poem: 'Sen vàng nở rộ giữa hồ trong\nHương thơm lan tỏa khắp non sông\nLòng thành thắp nén nhang cầu nguyện\nTrời Phật chứng tri thỏa ước mong.',
    meaning: 'Tâm thiện lành ắt gặp phước báu. Cầu tài đắc tài, cầu bình an đắc bình an, bệnh tật tiêu trừ.',
    ttsSummary: 'Quẻ số 8, Thượng Cát, Kim Liên Khai Nở. Tâm thiện lành ắt gặp phước báu, cầu tài đắc tài, cầu bình an đắc bình an.'
  },
  {
    number: 12,
    rank: 'Đại Cát',
    title: 'Long Vân Tương Hội — Rồng Mây Gặp Gỡ',
    poem: 'Rồng thiêng gặp hội tầng mây xanh\nVượt Vũ Môn Quan rạng rỡ danh\nThí chủ kiên tâm hành thiện đạo\nPhúc dày lộc vượng khắp gia đình.',
    meaning: 'Thời vận đang lên mạnh mẽ. Thi cử đỗ đạt, kinh doanh phát đạt, gặp cơ hội lớn đổi đời.',
    ttsSummary: 'Quẻ số 12, Đại Cát, Long Vân Tương Hội. Thời vận đang lên mạnh mẽ, thi cử đỗ đạt, kinh doanh phát đạt.'
  },
  {
    number: 18,
    rank: 'Thượng Cát',
    title: 'Xuân Phong Đắc Ý — Gió Xuân Thuận Buồm',
    poem: 'Thuận buồm xuôi gió vượt trùng khơi\nBến giác bình yên nắng rạng ngời\nTài lộc dồi dào nhân duyên tốt\nBốn mùa hưng thịnh rộn niềm vui.',
    meaning: 'Đi xa gặp may, buôn bán thuận lợi, tình duyên êm đẹp, người thân mạnh khỏe.',
    ttsSummary: 'Quẻ số 18, Thượng Cát, Xuân Phong Đắc Ý. Thuận buồm xuôi gió, tài lộc dồi dào, nhân duyên tốt đẹp.'
  },
  {
    number: 24,
    rank: 'Trung Cát',
    title: 'Vũ Quá Thiên Thanh — Mưa Tạnh Trời Trong',
    poem: 'Mưa qua trời lại sáng trong ngần\nGian khó lùi xa đón phúc phần\nGiữ vững lòng thành đừng nản chí\nHoa thơm trái ngọt đến mười phân.',
    meaning: 'Khó khăn cũ sắp qua đi, vận may mới đang tới. Hãy kiên nhẫn và giữ tâm bình tĩnh.',
    ttsSummary: 'Quẻ số 24, Trung Cát, Vũ Quá Thiên Thanh. Mưa qua trời lại sáng trong, gian khó lùi xa để đón phúc phần mới.'
  },
  {
    number: 36,
    rank: 'Thượng Thượng Cát',
    title: 'Phúc Tinh Cao Chiếu — Sao Phúc Chiếu Mệnh',
    poem: 'Phúc tinh rực sáng giữa đêm rằm\nTừ bi Phật độ suốt quanh năm\nTài lộc tự nhiên về gõ cửa\nTrăm điều như ý vạn điều lành.',
    meaning: 'Sao Phúc chiếu mạng, tai qua nạn khỏi, tiền tài sung túc, gia đạo hưng long.',
    ttsSummary: 'Quẻ số 36, Thượng Thượng Cát, Phúc Tinh Cao Chiếu. Sao Phúc chiếu mạng, tài lộc tự nhiên gõ cửa, trăm điều như ý.'
  },
  {
    number: 52,
    rank: 'Thượng Cát',
    title: 'Ngọc Xuất Côn Sơn — Ngọc Quý Phát Sáng',
    poem: 'Ngọc quý Côn Sơn tỏa ánh ngời\nBấy lâu rèn giũa nay gặp thời\nTri âm tương ngộ cùng nâng đỡ\nSự nghiệp thăng hoa rạng rỡ đời.',
    meaning: 'Nỗ lực bấy lâu nay sắp được đền đáp xứng đáng. Có người tốt nâng đỡ trong công việc và cuộc sống.',
    ttsSummary: 'Quẻ số 52, Thượng Cát, Ngọc Xuất Côn Sơn. Nỗ lực bấy lâu sắp được đền đáp xứng đáng, sự nghiệp thăng hoa.'
  },
  {
    number: 68,
    rank: 'Đại Cát',
    title: 'Lộc Mã Đồng Hương — Lộc Tài Cùng Tới',
    poem: 'Lộc Mã song hành đến tận nhà\nLàm ăn buôn bán nở như hoa\nTâm thành bố thí thêm công đức\nPhú quý vinh hoa khắp một nhà.',
    meaning: 'Quẻ đại lợi về tài lộc và kinh doanh. Nên làm nhiều việc thiện để phúc đức càng thêm bền vững.',
    ttsSummary: 'Quẻ số 68, Đại Cát, Lộc Mã Đồng Hương. Đại lợi về tài lộc và buôn bán, phú quý vinh hoa khắp một nhà.'
  },
  {
    number: 81,
    rank: 'Thượng Cát',
    title: 'Nguyệt Nhập Trung Thiên — Trăng Rằm Giữa Đỉnh',
    poem: 'Trăng tròn vằng vặc giữa trời thu\nSoi sáng muôn phương sạch mây mù\nTình duyên viên mãn gia đình thuận\nTâm an vạn sự chẳng ưu tư.',
    meaning: 'Tình duyên và gia đạo vô cùng tốt đẹp. Người độc thân dễ gặp ý trung nhân, gia đình thêm tin vui.',
    ttsSummary: 'Quẻ số 81, Thượng Cát, Nguyệt Nhập Trung Thiên. Tình duyên viên mãn, gia đình hòa thuận, tâm an vạn sự lành.'
  },
  {
    number: 99,
    rank: 'Thượng Thượng Cát',
    title: 'Vạn Sự Viên Thành — Cửu Cửu Đại Cát',
    poem: 'Chín tầng mây trắng ánh hào quang\nTừ bi Phật Tổ độ nhân gian\nThí chủ lòng thành dâng lễ bái\nTrọn đời trường thọ hưởng vinh khang.',
    meaning: 'Quẻ tối thượng cát tường. Sức khỏe trường thọ, công danh hiển đạt, vạn sự viên thành.',
    ttsSummary: 'Quẻ số 99, Thượng Thượng Cát, Vạn Sự Viên Thành. Quẻ tối thượng cát tường, sức khỏe trường thọ, vạn sự như ý.'
  }
];

// ============================================================================
// 2. ZEROTTS STANDALONE SERVICE CLIENT (VOICE: MAI CHI)
// ============================================================================
class ZeroTTSManager {
  constructor(baseUrl, options = {}) {
    if (typeof baseUrl === 'object' && baseUrl !== null) {
      options = baseUrl;
      baseUrl = options.baseUrl;
    }
    this.baseUrl = (baseUrl || process.env.TTS_SERVICE_URL || 'http://localhost:8008').replace(/\/+$/, '');
    this.synthTimeoutMs = (options && options.synthTimeoutMs)
      || Number(process.env.TTS_SYNTH_TIMEOUT_MS)
      || (process.env.NODE_ENV === 'test' ? 6000 : 35000);
    this.ready = false;
    this.status = 'loading';
    this.voice = 'maichi';
    this.voices = ['maichi'];
    this.model = 'zeroweight-ai/ZeroTTS';
    this.sampleRate = 48000;
    this.inflight = new Map();
    this.healthTimer = null;
    this.startHealthPolling();
  }

  startHealthPolling() {
    this.checkHealth();
    this.scheduleNextPoll();
  }

  scheduleNextPoll() {
    if (this.healthTimer) clearTimeout(this.healthTimer);
    const interval = this.ready ? 15000 : 4000;
    this.healthTimer = setTimeout(() => {
      this.checkHealth().finally(() => this.scheduleNextPoll());
    }, interval);
  }

  async checkHealth() {
    const wasReady = this.ready;
    const oldStatus = this.status;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        this.status = data.status || 'ready';
        this.ready = this.status === 'ready';
        if (data.voices && Array.isArray(data.voices)) {
          this.voices = data.voices;
        }
        if (data.model) this.model = data.model;
        if (data.sampleRate) this.sampleRate = data.sampleRate;
        if (this.ready && !wasReady) {
          console.log(`[ZeroTTS] Kết nối thành công TTS Service tại ${this.baseUrl}! Giọng: ${this.voice} (${this.voices.join(', ')})`);
        }
      } else {
        this.ready = false;
        this.status = 'error';
      }
    } catch (err) {
      this.ready = false;
      this.status = 'offline';
    } finally {
      clearTimeout(timeoutId);
    }

    if (this.ready !== wasReady || this.status !== oldStatus) {
      if (typeof broadcastNotification === 'function') {
        broadcastNotification('tts.status', this.getStatus());
      }
    }
    return this.getStatus();
  }

  getStatus() {
    return {
      ready: this.ready,
      status: this.status,
      engine: 'ZeroTTS Microservice (FastAPI)',
      serviceUrl: this.baseUrl,
      voice: (typeof state !== 'undefined' && state.settings?.ttsVoice) || this.voice || 'maichi',
      voices: this.voices,
      model: this.model,
      sampleRate: this.sampleRate
    };
  }

  async synthesize(text, voiceOverride) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return { ok: false, error: 'Empty text' };
    const voice = String(voiceOverride || (typeof state !== 'undefined' && state.settings?.ttsVoice) || 'maichi').trim().toLowerCase();
    const dedupKey = `${voice}::${cleanText}`;

    if (this.inflight.has(dedupKey)) {
      return this.inflight.get(dedupKey);
    }

    const promise = (async () => {
      if (!this.ready) {
        await this.checkHealth();
        if (!this.ready) {
          return { ok: false, error: `TTS Service đang ở trạng thái: ${this.status}` };
        }
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.synthTimeoutMs);
      try {
        const res = await fetch(`${this.baseUrl}/synthesize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanText, voice }),
          signal: controller.signal
        });

        const data = await res.json().catch(() => ({ ok: false, error: 'Invalid JSON response from TTS service' }));
        if (res.ok && data.ok) {
          return {
            ok: true,
            voice: data.voice || voice,
            audio: data.audio,
            url: data.audio,
            durationSec: data.durationSec
          };
        }
        return { ok: false, error: data?.error || `TTS Service error (${res.status})` };
      } catch (err) {
        return { ok: false, error: err.name === 'AbortError' ? 'TTS synthesis timeout' : (err.message || 'TTS connection failed') };
      } finally {
        clearTimeout(timeoutId);
      }
    })().finally(() => {
      this.inflight.delete(dedupKey);
    });

    this.inflight.set(dedupKey, promise);
    return promise;
  }

  destroy() {
    if (this.healthTimer) {
      clearTimeout(this.healthTimer);
      this.healthTimer = null;
    }
  }
}

// ============================================================================
// 3. TRẠNG THÁI CHÙA THIÊN MỤ & BẢNG VÀNG CÔNG ĐỨC
// ============================================================================
const DEFAULT_STATE = {
  totalIncense: 108,
  totalMerit: 1080,
  woodenFishHits: 360,
  bellRings: 36,
  lanternCount: 18,
  fortuneCount: 12,
  activeIncenseSticks: 9,
  haloIntensity: 0.45,
  offerings: {
    lotus: 3,
    fruit: 2,
    lamp: 2,
    dragon: 1
  },
  devotees: {},
  recentEvents: [],
  settings: {
    ttsEnabled: true,
    ttsVoice: 'maichi',
    ttsVolume: 0.95,
    bgMusicEnabled: true,
    musicVolume: 0.65,
    // Danh sách nhạc nền phát lần lượt (tối đa 3 bài), hết bài cuối quay lại bài đầu
    bgPlaylist: [{ id: 'default', name: 'Nam Mô A Di Đà Phật (mặc định)', url: '/assets/bg_chant.m4a' }],
    sfxEnabled: true,
    sfxVolume: 0.8,
    // Bật/tắt từng hiệu ứng âm thanh pháp khí
    sfx: { bell: true, woodfish: true, chime: true, fortune: true },
    smokeDensity: 1.0,
    autoSim: false,
    autoSimIntervalMs: 9500
  },
  tiktok: {
    connected: false,
    connecting: false,
    username: 'zenfacts_vn',
    roomId: null,
    viewerCount: 0,
    lastError: null
  }
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        ...DEFAULT_STATE,
        ...saved,
        devotees: saved.devotees || {},
        offerings: { ...DEFAULT_STATE.offerings, ...(saved.offerings || {}) },
        settings: {
          ...DEFAULT_STATE.settings,
          ...(saved.settings || {}),
          sfx: { ...DEFAULT_STATE.settings.sfx, ...(saved.settings?.sfx || {}) }
        },
        tiktok: { ...DEFAULT_STATE.tiktok }
      };
    }
  } catch (e) {
    console.warn('[State] Không đọc được merit-state.json, dùng mặc định:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

let state = loadState();

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const toSave = {
      totalIncense: state.totalIncense,
      totalMerit: state.totalMerit,
      woodenFishHits: state.woodenFishHits,
      bellRings: state.bellRings,
      lanternCount: state.lanternCount,
      fortuneCount: state.fortuneCount,
      activeIncenseSticks: state.activeIncenseSticks,
      offerings: state.offerings,
      devotees: state.devotees,
      settings: state.settings
    };
    fs.promises.writeFile(STATE_FILE, JSON.stringify(toSave, null, 2), 'utf8').catch((e) => {
      console.error('[State] Lỗi lưu file:', e.message);
    });
  }, 1200);
}

function getLeaderboard(limit = 6) {
  return Object.values(state.devotees)
    .sort((a, b) => b.merit - a.merit)
    .slice(0, limit)
    .map((d, index) => ({
      rank: index + 1,
      name: d.name,
      uniqueId: d.uniqueId,
      avatar: d.avatar || '',
      merit: d.merit,
      incense: d.incense || 0,
      lastWish: d.lastWish || ''
    }));
}
// Bộ lọc chặn ký tự lạ (Cuneiform 𒐫, Zalgo, Braille, ký tự spam) & từ ngữ phản cảm
const WEIRD_SPAM_RE = /[\u{12000}-\u{1254F}\uFDFD\u2800-\u28FF\u2580-\u259F]|[\u0300-\u036F]{3,}/u;
const BRACKET_EMOTE_RE = /\[[^\]]{1,24}\]/g;
const ALLOWED_VI_TEXT_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s.,!?]/g;
const ALLOWED_VI_NAME_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s._-]/g;
const VI_LETTER_RE = /[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/g;
// Dùng ranh giới chữ Unicode để không chặn nhầm tên/câu bình thường ("Mai Cường", "đi cưới", "vlog"...)
const BAD_WORDS_RE = /(?<![\p{L}\p{N}])(đá dái|địt|lồn|cặc|đm|vcl|vl|yamate|i cư|lừa đảo|lừa à|te-le gram|telegram|bố là trùm)(?![\p{L}\p{N}])/iu;
// Thu gọn ký tự lặp (spam "aaaaa") nhưng KHÔNG đụng tới chữ số (1000 -> 100 là sai)
const REPEAT_3_RE = /(\D)\1{2,}/gi;
const REPEAT_4_RE = /(\D)\1{3,}/gi;

function isBlockedSpamOrToxic(raw) {
  if (!raw) return true;
  const s = String(raw);
  if (WEIRD_SPAM_RE.test(s)) return true;
  if (BAD_WORDS_RE.test(s)) return true;
  return false;
}

function sanitizeUserName(rawName) {
  const normalized = String(rawName || '')
    .normalize('NFKC')
    .normalize('NFC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_VI_NAME_RE, ' ')
    .replace(REPEAT_4_RE, '$1$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 26);

  if (!normalized || BAD_WORDS_RE.test(normalized)) {
    return 'Thí Chủ Hữu Duyên';
  }
  const letters = normalized.match(VI_LETTER_RE) || [];
  if (letters.length < 2) {
    return 'Thí Chủ Hữu Duyên';
  }
  return normalized;
}

function sanitizeWishText(rawWish) {
  if (!rawWish) return '';
  const cleaned = String(rawWish)
    .normalize('NFKC')
    .normalize('NFC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_VI_TEXT_RE, ' ')
    .replace(/([.,!?])\1+/g, '$1')
    .replace(REPEAT_3_RE, '$1$1')
    .replace(/\s+/g, ' ')
    .replace(/^[.,!?\s-]+|[.,!?\s-]+$/g, '')
    .slice(0, 120);

  if (!cleaned || BAD_WORDS_RE.test(cleaned)) return '';
  const letters = cleaned.match(VI_LETTER_RE) || [];
  if (letters.length < 2) return '';
  return cleaned;
}

function recordDevotee(user, uniqueId, avatar, meritDelta, incenseDelta = 0, giftDelta = 0, wish = '') {
  const displayName = sanitizeUserName(user || uniqueId);
  const cleanWish = sanitizeWishText(wish);
  const key = (uniqueId || displayName).slice(0, 40);
  if (!state.devotees[key]) {
    state.devotees[key] = {
      name: displayName,
      uniqueId: uniqueId || displayName.toLowerCase().replace(/\s+/g, ''),
      avatar: avatar || '',
      merit: 0,
      incense: 0,
      gifts: 0,
      lastWish: ''
    };
  }
  const dev = state.devotees[key];
  dev.name = displayName;
  if (avatar) dev.avatar = avatar;
  dev.merit += meritDelta;
  dev.incense += incenseDelta;
  dev.gifts += giftDelta;
  if (cleanWish) dev.lastWish = cleanWish;

  state.totalMerit += meritDelta;
  state.haloIntensity = Math.min(1.0, 0.35 + (state.totalMerit % 1000) / 1400);
  return dev;
}

function pushEventLog(evt) {
  const entry = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...evt
  };
  state.recentEvents.unshift(entry);
  if (state.recentEvents.length > 35) {
    state.recentEvents.length = 35;
  }
  return entry;
}

function getPublicState() {
  return {
    totalIncense: state.totalIncense,
    totalMerit: state.totalMerit,
    woodenFishHits: state.woodenFishHits,
    bellRings: state.bellRings,
    lanternCount: state.lanternCount,
    fortuneCount: state.fortuneCount,
    activeIncenseSticks: state.activeIncenseSticks,
    haloIntensity: state.haloIntensity,
    offerings: state.offerings,
    leaderboard: getLeaderboard(24),
    recentEvents: state.recentEvents.slice(0, 15),
    settings: state.settings,
    tiktok: state.tiktok,
    hall: getHallRoster(),
    hallWaiting: getHallWaiting(),
    hallWaitingCount: hallWaiting.size,
    giftFeed,
    tts: zeroTts ? zeroTts.getStatus() : { ready: false, status: 'init', voice: 'maichi' }
  };
}

// ============================================================================
// 4. NGHI THỨC TƯƠNG TÁC (RITUAL HANDLERS)
// ============================================================================
const Rituals = {
  burnIncense(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(9, Number(params.count) || 3));
    const wish = sanitizeWishText(params.wish) || 'Thành tâm dâng hương bái Phật, cầu bình an cát tường';
    const merit = count * 5;

    state.totalIncense += count;
    state.activeIncenseSticks = Math.min(36, state.activeIncenseSticks + count);
    const devotee = recordDevotee(user, uniqueId, avatar, merit, count, 0, wish);
    const hallStatus = hallEngage(devotee.uniqueId, devotee.name, devotee.avatar, 'ritual');

    const ttsText = params.readTts === false
      ? ''
      : planSpeech(
        `Nam mô A Di Đà Phật. Cảm tạ thí chủ ${devotee.name} đã thành tâm thắp ${count} nén hương thơm. ${wish}.`,
        0,
        `Cảm tạ thí chủ ${devotee.name} dâng hương.`
      );

    const event = pushEventLog({
      type: 'burnIncense',
      ttsPriority: 0,
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      hallStatus,
      count,
      merit,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  strikeWoodenFish(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(50, Number(params.count) || 1));
    const merit = count;

    state.woodenFishHits += count;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 0);
    const hallStatus = hallEngage(devotee.uniqueId, devotee.name, devotee.avatar, 'like');

    const event = pushEventLog({
      type: 'strikeWoodenFish',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      hallStatus,
      count,
      merit,
      ttsText: params.ttsText || ''
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  ringBell(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(9, Number(params.count) || 1));
    const wish = sanitizeWishText(params.wish) || 'Thỉnh chuông Bát Nhã, phiền não tiêu tan, trí tuệ sáng ngời';
    const merit = count * 10;

    state.bellRings += count;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 0, wish);
    const hallStatus = hallEngage(devotee.uniqueId, devotee.name, devotee.avatar, 'ritual');

    const ttsText = params.readTts
      ? planSpeech(`Thí chủ ${devotee.name} thỉnh Đại Hồng Chung cầu nguyện: ${wish}.`, 1, `Thí chủ ${devotee.name} thỉnh chuông.`)
      : '';

    const event = pushEventLog({
      type: 'ringBell',
      ttsPriority: 1,
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      hallStatus,
      count,
      merit,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  sendPrayer(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const wish = sanitizeWishText(params.wish) || 'Cầu cho quốc thái dân an, gia đình mạnh khỏe hạnh phúc';
    const merit = 10;

    state.lanternCount += 1;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 1, 0, wish);
    const hallStatus = hallEngage(devotee.uniqueId, devotee.name, devotee.avatar, 'ritual');

    const ttsText = params.readTts === false
      ? ''
      : planSpeech(`Lời cầu nguyện của thí chủ ${devotee.name}: ${wish}. Nam mô A Di Đà Phật.`, 1);

    const event = pushEventLog({
      type: 'sendPrayer',
      ttsPriority: 1,
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      hallStatus,
      wish,
      merit,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  offerGift(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const coins = Math.min(1000000, Math.max(1, Math.floor(Number(params.coins)) || 10));
    const giftType = ['lotus', 'fruit', 'lamp', 'dragon'].includes(params.giftType)
      ? params.giftType
      : (coins >= 100 ? 'dragon' : coins >= 20 ? 'fruit' : coins >= 5 ? 'lamp' : 'lotus');

    const giftLabels = {
      lotus: 'Đài Hoa Sen Vàng',
      fruit: 'Mâm Ngũ Quả Cát Tường',
      lamp: 'Đèn Lưu Ly Trí Tuệ',
      dragon: 'Đại Lễ Kim Long Chầu Phật'
    };
    const giftName = params.giftName || giftLabels[giftType];
    // Khớp bảng quy tắc README: 1–4 xu +20/xu, 5–99 xu +30/xu, ≥100 xu +50/xu
    const multiplier = coins >= 100 ? 50 : coins >= 5 ? 30 : 20;
    const merit = Math.max(20, coins * multiplier);

    state.offerings[giftType] = (state.offerings[giftType] || 0) + 1;
    state.totalIncense += 3;
    state.activeIncenseSticks = Math.min(36, state.activeIncenseSticks + 3);

    const wish = params.wish || `Dâng cúng ${giftName} lên Tam Bảo`;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 3, 1, wish);
    hallRecordGift(devotee.uniqueId, coins);
    hallEngage(devotee.uniqueId, devotee.name, devotee.avatar, 'gift');
    const hallStatus = hallStatusOf(devotee.uniqueId);
    const giftEntry = pushGiftFeed(devotee, giftName, coins, merit, giftType);

    const ttsText = params.readTts === false
      ? ''
      : planSpeech(
        `Công đức vô lượng! Cảm tạ thí chủ ${devotee.name} đã phát tâm dâng cúng ${giftName}, tích thêm ${merit} điểm công đức. Nguyện cầu chư Phật gia hộ cho thí chủ vạn sự cát tường như ý.`,
        3,
        `Công đức vô lượng! Cảm tạ thí chủ ${devotee.name} dâng ${giftName}.`,
        { jump: true }
      );

    const event = pushEventLog({
      type: giftType === 'dragon' ? 'grandCeremony' : 'offerGift',
      ttsPriority: 3,
      ttsJump: true,
      giftAnnounce: giftEntry,
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      hallStatus,
      giftType,
      giftName,
      coins,
      merit,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  drawFortune(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const topic = sanitizeWishText(params.topic) || 'Gia đạo, Tài lộc và Bình an';
    const fortune = FORTUNE_DECK[Math.floor(Math.random() * FORTUNE_DECK.length)];
    const merit = 10;

    state.fortuneCount += 1;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 0, `Xin xăm: Quẻ số ${fortune.number} (${fortune.rank})`);
    const hallStatus = hallEngage(devotee.uniqueId, devotee.name, devotee.avatar, 'ritual');

    const ttsText = params.readTts === false
      ? ''
      : planSpeech(
        `Thí chủ ${devotee.name} vừa gieo được ${fortune.ttsSummary}`,
        2,
        `Thí chủ ${devotee.name} gieo được quẻ số ${fortune.number}, ${fortune.rank}.`
      );

    const event = pushEventLog({
      type: 'drawFortune',
      ttsPriority: 2,
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      hallStatus,
      topic,
      fortune,
      merit,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    saveState();
    broadcastNotification('temple.event', { event, state: getPublicState() });
    return { event, state: getPublicState() };
  },

  grandCeremony(params = {}) {
    return this.offerGift({
      ...params,
      giftType: 'dragon',
      coins: Math.max(100, Number(params.coins) || 199),
      giftName: params.giftName || 'Đại Lễ Hào Quang Vạn Trượng'
    });
  },

  updateSettings(params = {}) {
    if (params.ttsEnabled !== undefined && typeof params.ttsEnabled !== 'boolean') {
      throw new Error('Trạng thái bật/tắt TTS không hợp lệ');
    }
    if (params.ttsVoice !== undefined && !zeroTts.voices.includes(params.ttsVoice)) {
      throw new Error('Giọng đọc TTS không có trong danh sách hỗ trợ');
    }
    if (params.ttsVolume !== undefined &&
        (typeof params.ttsVolume !== 'number' || !Number.isFinite(params.ttsVolume) || params.ttsVolume < 0 || params.ttsVolume > 1)) {
      throw new Error('Âm lượng TTS phải nằm trong khoảng 0 đến 1');
    }
    if (params.musicVolume !== undefined &&
        (typeof params.musicVolume !== 'number' || !Number.isFinite(params.musicVolume) || params.musicVolume < 0 || params.musicVolume > 1)) {
      throw new Error('Âm lượng nhạc nền phải nằm trong khoảng 0 đến 1');
    }
    if (params.sfxVolume !== undefined &&
        (typeof params.sfxVolume !== 'number' || !Number.isFinite(params.sfxVolume) || params.sfxVolume < 0 || params.sfxVolume > 1)) {
      throw new Error('Âm lượng hiệu ứng phải nằm trong khoảng 0 đến 1');
    }
    for (const key of ['bgMusicEnabled', 'sfxEnabled']) {
      if (params[key] !== undefined && typeof params[key] !== 'boolean') {
        throw new Error(`Giá trị ${key} phải là true/false`);
      }
    }
    if (params.sfx !== undefined) {
      if (!params.sfx || typeof params.sfx !== 'object' || Array.isArray(params.sfx)) {
        throw new Error('Cài đặt hiệu ứng âm thanh không hợp lệ');
      }
      const sfx = { ...state.settings.sfx };
      for (const key of Object.keys(DEFAULT_STATE.settings.sfx)) {
        if (params.sfx[key] !== undefined) {
          if (typeof params.sfx[key] !== 'boolean') throw new Error(`Hiệu ứng ${key} phải là true/false`);
          sfx[key] = params.sfx[key];
        }
      }
      params = { ...params, sfx };
    }
    if (params.bgPlaylist !== undefined) {
      // Nhận danh sách id (hoặc object có id) theo thứ tự phát; server tự tra đường dẫn từ thư viện nhạc
      if (!Array.isArray(params.bgPlaylist)) throw new Error('Danh sách nhạc nền không hợp lệ');
      const ids = params.bgPlaylist.map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean);
      if (ids.length > MAX_PLAYLIST) throw new Error(`Chỉ phát tối đa ${MAX_PLAYLIST} bài nhạc nền`);
      if (new Set(ids).size !== ids.length) throw new Error('Một bài chỉ được chọn 1 lần trong danh sách phát');
      const library = getMusicLibrary();
      const resolved = ids.map((id) => {
        const track = library.find((t) => t.id === id);
        if (!track) throw new Error(`Không tìm thấy bài nhạc "${id}" trong thư viện`);
        return { id: track.id, name: track.name, url: track.url };
      });
      params = { ...params, bgPlaylist: resolved };
    }
    if (params.autoSimIntervalMs !== undefined &&
        (typeof params.autoSimIntervalMs !== 'number' || !Number.isFinite(params.autoSimIntervalMs) || params.autoSimIntervalMs < 2000)) {
      throw new Error('Chu kỳ giả lập phải là số mili-giây >= 2000');
    }
    // Chỉ nhận các khóa cài đặt hợp lệ, tránh client ghi đè rác vào state/merit-state.json
    const ALLOWED_KEYS = [
      'ttsEnabled', 'ttsVoice', 'ttsVolume',
      'musicVolume', 'bgMusicEnabled', 'bgPlaylist',
      'sfxEnabled', 'sfxVolume', 'sfx',
      'smokeDensity', 'autoSim', 'autoSimIntervalMs'
    ];
    const patch = {};
    for (const key of ALLOWED_KEYS) {
      if (params[key] !== undefined) patch[key] = params[key];
    }
    state.settings = {
      ...state.settings,
      ...patch
    };
    if (typeof params.autoSim === 'boolean') {
      configureAutoSim(params.autoSim);
    }
    saveState();
    broadcastNotification('temple.state', getPublicState());
    return getPublicState();
  },

  resetMerit() {
    state.totalIncense = 9;
    state.totalMerit = 0;
    state.woodenFishHits = 0;
    state.bellRings = 0;
    state.lanternCount = 0;
    state.fortuneCount = 0;
    state.activeIncenseSticks = 3;
    state.offerings = { lotus: 1, fruit: 1, lamp: 1, dragon: 0 };
    state.devotees = {};
    state.recentEvents = [];
    hall.clear();
    hallWaiting.clear();
    giftSession.clear();
    engagement.clear();
    giftFeed.length = 0;
    saveState();
    broadcastNotification('temple.state', getPublicState());
    return getPublicState();
  }
};

// ============================================================================
// 4B. ĐẠO TRÀNG — MỖI NGƯỜI XEM TƯƠNG TÁC CÓ 1 PHẬT TỬ RIÊNG TRONG CHÁNH ĐIỆN
// ============================================================================
// Ai bình luận / thả tim / tặng quà / follow sẽ được "mời vào" đạo tràng và ngồi 1 chỗ có tên.
// Không lưu xuống đĩa (chỉ sống trong phiên live).
//
// Sơ đồ ghế (dùng chung cho màn 2.5D và 3D):
//   - Ghế 0..7  : HÀNG ĐẦU GIỮ CHỖ cho top 8 người tặng quà nhiều xu nhất trong buổi live.
//                 Ghế 0 = chính giữa sát bàn thờ (hạng 1), càng lớn càng ra xa. Không bị mời ra khi im lặng/đầy chỗ.
//   - Ghế 8..39 : chỗ thường, ghế 8 là chỗ dễ thấy nhất; im quá 10 phút tự rời.
// Khi đông người (> 40):
//   - Người mới chỉ được thay chỗ của người thường đã ngồi >= 90 giây VÀ im lặng >= 60 giây (ít tương tác nhất).
//   - Không ai nhường được -> vào HÀNG CHỜ ngoài sân (không đá người đang tích cực).
//   - Mỗi 5 giây mời tối đa 3 người chờ vào chỗ trống, ưu tiên người vừa tương tác gần nhất;
//     chờ quá 3 phút không tương tác thì rời hàng chờ.
// Hạng đài: 'normal' (đệm thường) | 'lotus' (đã tặng quà) | 'goldLotus' (tặng >= 100 xu trong buổi).
const HALL_SEATS = 40;
const HALL_VIP_SEATS = 8;
const HALL_IDLE_MS = 10 * 60 * 1000;
const GOLD_LOTUS_COINS = 100;
const HALL_MIN_STAY_MS = 90 * 1000;
const HALL_ACTIVE_GRACE_MS = 60 * 1000;
const HALL_WAIT_IDLE_MS = 3 * 60 * 1000;
const HALL_WAITING_MAX = 300;
const HALL_WAITING_SHOWN = 16;
const HALL_SEATINGS_PER_TICK = 3;
const hall = new Map(); // uid -> { uid, name, avatar, seat, joinedAt, lastActive }
const hallWaiting = new Map(); // uid -> { uid, name, avatar, since, lastActive } — hàng chờ ngoài sân
const giftSession = new Map(); // uid -> { coins, firstGiftAt } — tổng xu đã tặng trong buổi live

function hallTier(uid) {
  const coins = giftSession.get(uid)?.coins || 0;
  if (coins >= GOLD_LOTUS_COINS) return 'goldLotus';
  if (coins > 0) return 'lotus';
  return 'normal';
}

function getHallRoster() {
  return Array.from(hall.values()).map(({ uid, name, avatar, seat }) => ({
    uid,
    name,
    avatar,
    seat,
    tier: hallTier(uid),
    giftCoins: giftSession.get(uid)?.coins || 0,
    vipRank: seat < HALL_VIP_SEATS ? seat + 1 : 0
  }));
}

// Hàng chờ hiển thị: những người vừa tương tác gần nhất (màn 3D cho họ đứng ngoài sân)
function getHallWaiting() {
  return Array.from(hallWaiting.values())
    .sort((a, b) => b.lastActive - a.lastActive)
    .slice(0, HALL_WAITING_SHOWN)
    .map(({ uid, name, avatar }) => ({ uid, name, avatar, tier: hallTier(uid) }));
}

function getHallPayload() {
  return { hall: getHallRoster(), waiting: getHallWaiting(), waitingCount: hallWaiting.size };
}

let hallBroadcastTimer = null;
function scheduleHallBroadcast() {
  if (hallBroadcastTimer) return;
  hallBroadcastTimer = setTimeout(() => {
    hallBroadcastTimer = null;
    broadcastNotification('hall.roster', getHallPayload());
  }, 250);
}

const isVipSeat = (seat) => seat >= 0 && seat < HALL_VIP_SEATS;

// Tìm 1 chỗ thường: ưu tiên ghế trống; hết ghế thì mời 1 người thường đã ngồi đủ lâu và đang im lặng ra.
// Không bao giờ đụng hàng giữ chỗ, không đá người vừa vào hoặc đang tích cực. Trả về -1 nếu không có chỗ.
// CHEN HÀNG (force = người tặng quà): nếu vẫn không có chỗ, người CHƯA tặng quà im lặng lâu nhất
// nhường ghế (bất kể vừa vào hay đang tích cực) và ra hàng chờ ngoài sân — không bị mất hẳn.
function takeRegularSeat(exceptUid, { force = false } = {}) {
  const taken = new Set(Array.from(hall.values(), (m) => m.seat));
  for (let i = HALL_VIP_SEATS; i < HALL_SEATS; i++) {
    if (!taken.has(i)) return i;
  }
  const now = Date.now();
  let quietest = null;
  for (const m of hall.values()) {
    if (m.uid === exceptUid || isVipSeat(m.seat)) continue;
    if (now - m.joinedAt < HALL_MIN_STAY_MS || now - m.lastActive < HALL_ACTIVE_GRACE_MS) continue;
    if (!quietest || m.lastActive < quietest.lastActive) quietest = m;
  }
  if (quietest) {
    hall.delete(quietest.uid);
    return quietest.seat;
  }
  if (!force) return -1;
  let bumped = null;
  for (const m of hall.values()) {
    if (m.uid === exceptUid || isVipSeat(m.seat) || giftSession.has(m.uid)) continue;
    if (!bumped || m.lastActive < bumped.lastActive) bumped = m;
  }
  if (!bumped) return -1; // cả 32 chỗ thường đều là người đã tặng quà
  hall.delete(bumped.uid);
  addToWaiting(bumped.uid, bumped.name, bumped.avatar, bumped.lastActive);
  return bumped.seat;
}

const isGifter = (uid) => giftSession.has(uid);

function addToWaiting(uid, name, avatar, lastActive = Date.now()) {
  const w = hallWaiting.get(uid);
  if (w) {
    w.lastActive = lastActive;
    if (name) w.name = name;
    if (avatar) w.avatar = avatar;
    return w;
  }
  const entry = { uid, name: name || 'Thí Chủ', avatar: avatar || '', since: Date.now(), lastActive };
  hallWaiting.set(uid, entry);
  if (hallWaiting.size > HALL_WAITING_MAX) {
    // Bỏ người chờ im lặng lâu nhất
    let quietest = null;
    for (const x of hallWaiting.values()) if (!quietest || x.lastActive < quietest.lastActive) quietest = x;
    hallWaiting.delete(quietest.uid);
  }
  return entry;
}

function seatMember(uid, name, avatar, seat, lastActive = Date.now()) {
  hallWaiting.delete(uid);
  const member = { uid, name: name || 'Thí Chủ', avatar: avatar || '', seat, joinedAt: Date.now(), lastActive };
  hall.set(uid, member);
  scheduleHallBroadcast();
  broadcastNotification('hall.action', { uid, action: 'join' });
  return member;
}

// Xếp lại hàng đầu theo tổng xu tặng trong buổi: top 8 có mặt trong đạo tràng ngồi ghế 0..7
function rebalanceVipSeats() {
  // Người tặng quà đang ở hàng chờ cũng được xét: đủ hạng thì vào thẳng hàng đầu
  for (const w of Array.from(hallWaiting.values())) {
    if ((giftSession.get(w.uid)?.coins || 0) > 0) {
      hall.set(w.uid, { uid: w.uid, name: w.name, avatar: w.avatar, seat: -3, joinedAt: Date.now(), lastActive: w.lastActive });
    }
  }
  const ranked = Array.from(hall.values())
    .filter((m) => (giftSession.get(m.uid)?.coins || 0) > 0)
    .sort((a, b) => {
      const ga = giftSession.get(a.uid);
      const gb = giftSession.get(b.uid);
      return gb.coins - ga.coins || ga.firstGiftAt - gb.firstGiftAt;
    })
    .slice(0, HALL_VIP_SEATS);
  const vipUids = new Set(ranked.map((m) => m.uid));
  let changed = false;

  // 1. Ai rơi khỏi top 8 thì xuống chỗ thường
  for (const m of hall.values()) {
    if (isVipSeat(m.seat) && !vipUids.has(m.uid)) {
      m.seat = -1;
      changed = true;
    }
  }
  // 2. Top 8 vào đúng ghế theo hạng (tạm bỏ ghế cũ trước để không trùng chỗ)
  const promoted = [];
  ranked.forEach((m, rank) => {
    if (m.seat !== rank) {
      if (!isVipSeat(m.seat)) promoted.push(m.uid);
      m.seat = -2;
      changed = true;
    }
  });
  ranked.forEach((m, rank) => {
    if (m.seat === -2) m.seat = rank;
  });
  // Người chờ tặng quà nhưng chưa đủ hạng hàng đầu -> trở lại hàng chờ (seat -3 chưa được xếp)
  for (const m of Array.from(hall.values())) {
    if (m.seat === -3) {
      hall.delete(m.uid);
    } else if (vipUids.has(m.uid) && hallWaiting.has(m.uid)) {
      hallWaiting.delete(m.uid);
      broadcastNotification('hall.action', { uid: m.uid, action: 'join' });
    }
  }
  // 3. Người vừa rời hàng đầu nhận chỗ thường; hết chỗ thì ra hàng chờ (không mất hẳn)
  for (const m of Array.from(hall.values())) {
    if (m.seat === -1) {
      const seat = takeRegularSeat(m.uid, { force: true }); // người rời top 8 cũng là người đã tặng quà
      if (seat === -1) {
        hall.delete(m.uid);
        addToWaiting(m.uid, m.name, m.avatar, m.lastActive);
      } else {
        m.seat = seat;
      }
    }
  }
  if (changed) scheduleHallBroadcast();
  for (const uid of promoted) {
    broadcastNotification('hall.action', { uid, action: 'promote', text: '' });
  }
}

function hallTouch(uid, name, avatar) {
  if (!uid) return null;
  const now = Date.now();
  const existing = hall.get(uid);
  if (!existing && hallWaiting.has(uid)) {
    // Đang chờ: chỉ cập nhật lần tương tác (để được ưu tiên mời vào); thử lấy chỗ ngay nếu có
    addToWaiting(uid, name, avatar, now);
    const seat = takeRegularSeat(uid, { force: isGifter(uid) });
    if (seat !== -1) {
      const member = seatMember(uid, name || hallWaiting.get(uid)?.name, avatar, seat, now);
      if (isGifter(uid)) rebalanceVipSeats();
      return member;
    }
    return null;
  }
  if (existing) {
    existing.lastActive = now;
    let changed = false;
    if (name && existing.name !== name) { existing.name = name; changed = true; }
    if (avatar && existing.avatar !== avatar) { existing.avatar = avatar; changed = true; }
    if (changed) scheduleHallBroadcast();
    return existing;
  }

  const seat = takeRegularSeat(uid, { force: isGifter(uid) });
  if (seat === -1) {
    // Đạo tràng đầy người đang tích cực -> xếp hàng chờ ngoài sân
    const isNew = !hallWaiting.has(uid);
    addToWaiting(uid, name, avatar, now);
    if (giftSession.has(uid)) rebalanceVipSeats();
    if (isNew) scheduleHallBroadcast();
    return null;
  }
  const member = seatMember(uid, name, avatar, seat, now);
  // Người từng tặng quà trong buổi quay lại -> lấy lại hàng đầu nếu đủ hạng
  if (giftSession.has(uid)) rebalanceVipSeats();
  return member;
}

// ----------------------------------------------------------------------------
// BẢNG THÔNG BÁO DÂNG LỄ: các món quà gần nhất trong buổi live (màn 3D hiện bảng + băng rôn,
// thông báo quà luôn chen trước các thông báo khác). Không lưu xuống đĩa.
// ----------------------------------------------------------------------------
const GIFT_FEED_MAX = 8;
const giftFeed = [];
function pushGiftFeed(devotee, giftName, coins, merit, giftType) {
  const entry = {
    id: `gift_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    at: Date.now(),
    uid: devotee.uniqueId,
    user: devotee.name,
    avatar: devotee.avatar || '',
    giftName,
    giftType,
    coins,
    merit,
    sessionCoins: giftSession.get(devotee.uniqueId)?.coins || coins,
    tier: hallTier(devotee.uniqueId),
    vipRank: (() => {
      const m = hall.get(devotee.uniqueId);
      return m && m.seat < HALL_VIP_SEATS ? m.seat + 1 : 0;
    })(),
    // big = quà lớn (>= 100 xu): băng rôn to + thời gian hiện lâu hơn
    big: coins >= GOLD_LOTUS_COINS
  };
  giftFeed.unshift(entry);
  if (giftFeed.length > GIFT_FEED_MAX) giftFeed.length = GIFT_FEED_MAX;
  return entry;
}

// Gọi sau mỗi lần tặng quà (Rituals.offerGift)
function hallRecordGift(uid, coins) {
  if (!uid || !(coins > 0)) return;
  const entry = giftSession.get(uid) || { coins: 0, firstGiftAt: Date.now() };
  const before = hallTier(uid);
  entry.coins += coins;
  giftSession.set(uid, entry);
  if (giftSession.size > 2000) giftSession.delete(giftSession.keys().next().value);
  rebalanceVipSeats();
  if (hallTier(uid) !== before) scheduleHallBroadcast(); // đổi đệm -> đài sen / đài sen vàng
}

function hallTick() {
  const now = Date.now();
  let changed = false;
  for (const [uid, m] of hall) {
    // Người đang giữ chỗ hàng đầu không bị mời ra dù im lặng
    if (!isVipSeat(m.seat) && now - m.lastActive > HALL_IDLE_MS) { hall.delete(uid); changed = true; }
  }
  for (const [uid, w] of hallWaiting) {
    // Người giả lập sim_join_ rời chùa sau 45s nếu không tương tác để luân phiên người ra người vào
    const timeout = uid.startsWith('sim_join_') ? 45000 : HALL_WAIT_IDLE_MS;
    if (now - w.lastActive > timeout) { hallWaiting.delete(uid); changed = true; }
  }
  // Mời người chờ vào (người vừa tương tác gần nhất trước), tối đa vài người mỗi lượt cho mượt
  // Người tặng quà được mời vào trước, sau đó tới người vừa tương tác gần nhất
  const queue = Array.from(hallWaiting.values())
    .sort((a, b) => (isGifter(b.uid) - isGifter(a.uid)) || (b.lastActive - a.lastActive));
  let seated = 0;
  for (const w of queue) {
    if (seated >= HALL_SEATINGS_PER_TICK) break;
    const seat = takeRegularSeat(w.uid, { force: isGifter(w.uid) });
    if (seat === -1) {
      if (isGifter(w.uid)) continue;
      break;
    }
    seatMember(w.uid, w.name, w.avatar, seat, w.lastActive);
    seated += 1;
    changed = true;
  }
  if (changed) scheduleHallBroadcast();
}
setInterval(hallTick, 5000).unref?.();

function hallAction(uid, action, text = '', who = {}) {
  if (!uid) return;
  const member = hall.get(uid);
  const isVip = member && member.seat >= 0 && member.seat < HALL_VIP_SEATS;
  if (!isVip && !takeActionToken(action === 'say' ? 'say' : 'other')) return; // quá tải -> bỏ bớt
  const status = hallStatusOf(uid);
  const payload = { uid, action, text: String(text || '').slice(0, 80) };
  if (status === 'guest') {
    // Khách chưa có ghế: màn 3D hiện họ đứng ở sân trước cổng vài giây
    Object.assign(payload, { guest: true, name: who.name || 'Thí Chủ', avatar: who.avatar || '' });
  }
  broadcastNotification('hall.action', payload);
}

// ----------------------------------------------------------------------------
// QUY TẮC XUẤT HIỆN NHÂN VẬT (khi đông người)
// ----------------------------------------------------------------------------
// Tầng 1 — Khách xem: chỉ vào live / chỉ thả tim -> KHÔNG có nhân vật riêng.
//          Vào live: thỉnh thoảng được chọn đi ngang sân kèm tên ('hall.arrive', tối đa 1 người / 3 giây).
// Tầng 2 — Khách hành hương: làm nghi thức / bình luận nhưng chưa đủ điều kiện có ghế
//          -> sự kiện mang hallStatus 'guest': màn 3D cho đi từ cổng vào làm lễ rồi đi ra (không ngồi);
//             bình luận/lệnh của khách hiện ở sân trước cổng ('hall.action' có guest: true).
// Tầng 3 — Phật tử Đạo Tràng (có ghế): tặng quà bất kỳ (vào ngay, ngồi đài sen) HOẶC tương tác
//          >= 3 lần trong 5 phút (thả tim tính tối đa 1 lần / phút). Hết ghế -> hàng chờ ngoài sân.
const SEAT_MIN_INTERACTIONS = 3;
const SEAT_WINDOW_MS = 5 * 60 * 1000;
const LIKE_COUNT_EVERY_MS = 60 * 1000;
const engagement = new Map(); // uid -> { times: number[], lastLikeCountedAt }

function hallStatusOf(uid) {
  if (hall.has(uid)) return 'seated';
  if (hallWaiting.has(uid)) return 'waiting';
  return 'guest';
}

// kind: 'comment' | 'ritual' | 'like' | 'gift'
function hallEngage(uid, name, avatar, kind) {
  if (!uid) return 'guest';
  const now = Date.now();
  if (hall.has(uid) || hallWaiting.has(uid)) {
    hallTouch(uid, name, avatar);
    return hallStatusOf(uid);
  }
  let e = engagement.get(uid);
  if (!e) {
    e = { times: [], lastLikeCountedAt: 0 };
    engagement.set(uid, e);
    if (engagement.size > 5000) engagement.delete(engagement.keys().next().value);
  }
  e.times = e.times.filter((t) => now - t < SEAT_WINDOW_MS);
  if (kind === 'like') {
    if (now - e.lastLikeCountedAt >= LIKE_COUNT_EVERY_MS) {
      e.lastLikeCountedAt = now;
      e.times.push(now);
    }
  } else {
    e.times.push(now);
  }
  if (kind === 'gift' || e.times.length >= SEAT_MIN_INTERACTIONS) {
    engagement.delete(uid);
    hallTouch(uid, name, avatar); // có ghế ngay, hoặc vào hàng chờ nếu đầy
  }
  return hallStatusOf(uid);
}

// ----------------------------------------------------------------------------
// ĐIỀU PHỐI GIỌNG ĐỌC: không để hàng đợi TTS dồn ứ khi nhiều người tương tác liên tục.
// Server ước lượng độ dài hàng đợi (giây); câu ưu tiên thấp được rút gọn hoặc bỏ qua khi hàng đợi dài.
// Ưu tiên: 3 tặng quà > 2 xin xăm > 1 cầu nguyện / thỉnh chuông > 0 thắp hương.
// ----------------------------------------------------------------------------
const TTS_MAX_BACKLOG_SEC = [20, 28, 40, 90]; // theo ưu tiên 0..3
let ttsBusyUntil = 0;

function estimateSpeechSec(text) {
  return 1.2 + String(text || '').length / 14;
}

// Trả về câu sẽ đọc ('' = không đọc). shortText: bản rút gọn dùng khi hàng đợi đã dài.
// jump = CHEN HÀNG (tặng quà): luôn đọc, client chèn lên đầu hàng đợi (ngay sau câu đang đọc dở).
// Khi hàng đợi đã rất dài thì dùng bản rút gọn để người phía sau không phải đợi quá lâu.
function planSpeech(fullText, priority, shortText = '', { jump = false } = {}) {
  if (!fullText) return '';
  const now = Date.now();
  if (jump) {
    const backlogNow = Math.max(0, (ttsBusyUntil - now) / 1000);
    const text = backlogNow > 45 && shortText ? shortText : fullText;
    ttsBusyUntil = Math.max(ttsBusyUntil, now) + (estimateSpeechSec(text) + 0.25) * 1000;
    return text;
  }
  const backlog = Math.max(0, (ttsBusyUntil - now) / 1000);
  const limit = TTS_MAX_BACKLOG_SEC[priority] ?? 12;
  for (const text of [fullText, shortText]) {
    if (!text) continue;
    if (backlog + estimateSpeechSec(text) <= limit) {
      ttsBusyUntil = now + (backlog + estimateSpeechSec(text) + 0.25) * 1000;
      return text;
    }
  }
  return '';
}

// Giới hạn số bong bóng / động tác phát ra mỗi giây để màn hình không rối khi bình luận dồn dập.
// Người ngồi hàng đầu (đã tặng quà) luôn được hiển thị.
const ACTION_RATE = { say: 3, other: 6 }; // mỗi giây
const actionBuckets = { say: { tokens: 3, at: Date.now() }, other: { tokens: 6, at: Date.now() } };
function takeActionToken(kind) {
  const b = actionBuckets[kind];
  const rate = ACTION_RATE[kind];
  const now = Date.now();
  b.tokens = Math.min(rate, b.tokens + ((now - b.at) / 1000) * rate);
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

// Người vừa vào live (tầng 1): chọn mẫu tối đa 1 người / 3 giây để đi ngang sân kèm tên
const ARRIVE_EVERY_MS = 3000;
let lastArriveAt = 0;
let arrivalsSinceLast = 0;
function hallArrive(uid, name, avatar) {
  if (!uid || hall.has(uid) || hallWaiting.has(uid)) return;
  arrivalsSinceLast += 1;
  const now = Date.now();
  if (now - lastArriveAt < ARRIVE_EVERY_MS) return;
  lastArriveAt = now;
  // Người mới vào live được xếp vào khu vực đứng chờ 2 bên Đạo Tràng
  addToWaiting(uid, sanitizeUserName(name), avatar || '', now);
  scheduleHallBroadcast();
  broadcastNotification('hall.arrive', {
    uid,
    name: sanitizeUserName(name),
    avatar: avatar || '',
    // số người vào live kể từ lần chọn trước (để hiện "+N người vừa vào chùa")
    count: arrivalsSinceLast
  });
  arrivalsSinceLast = 0;
}

// Bình luận thường (+1 CĐ) không phát temple.event -> gom lại phát temple.state tối đa 1 lần / 2 giây
let stateBroadcastTimer = null;
function scheduleStateBroadcast() {
  if (stateBroadcastTimer) return;
  stateBroadcastTimer = setTimeout(() => {
    stateBroadcastTimer = null;
    broadcastNotification('temple.state', getPublicState());
  }, 2000);
}

// Lệnh ngắn điều khiển Phật tử của chính mình (không đọc TTS, không chiếm sân khấu chính)
const HALL_COMMANDS = [
  { action: 'bow', re: /(^|\s)(lạy|lay|lễ phật|le phat|đảnh lễ|danh le)(\s|$)/ },
  { action: 'greet', re: /(^|\s)(chào|chao|hello|hi|xin chào|xin chao)(\s|$)/ },
  { action: 'chant', re: /(niệm phật|niem phat|a di đà|a di da|nam mô|nam mo|mô phật|mo phat)/ }
];
const SHORT_COMMAND_MAX_WORDS = 4;

// ============================================================================
// 5. TIKTOK LIVE CONNECTOR & COMMENT PARSER
// ============================================================================
let tiktokConn = null;

const commentCooldownMap = new Map();

function parseViewerComment(commentText, user, uniqueId, avatar) {
  const raw = String(commentText || '').trim();
  if (!raw || isBlockedSpamOrToxic(raw)) {
    return null;
  }

  const cleanWish = sanitizeWishText(raw);
  if (!cleanWish || cleanWish.length < 3) {
    return null;
  }

  const cleanUser = sanitizeUserName(user);
  const lower = cleanWish.toLowerCase();
  const userKey = uniqueId || user || '';
  const now = Date.now();

  // Chống spam: nghi thức lớn (có TTS) 3.5 giây/người; lệnh/bong bóng nhẹ 1.2 giây/người
  const passCooldown = (ms) => {
    if (!userKey) return true;
    const lastTs = commentCooldownMap.get(userKey) || 0;
    if (now - lastTs < ms) return false;
    commentCooldownMap.delete(userKey); // xóa rồi set lại để Map giữ thứ tự "mới dùng gần nhất"
    commentCooldownMap.set(userKey, now);
    if (commentCooldownMap.size > 600) {
      commentCooldownMap.delete(commentCooldownMap.keys().next().value);
    }
    return true;
  };
  const isRitual =
    /xin xăm|xin xam|gieo quẻ|gieo que|rút quẻ|rut que|quẻ|chuông|chuong|gõ mõ|go mo|tụng kinh|thắp hương|thap huong|dâng hương|dang huong|bái phật|bai phat/.test(lower) ||
    /(^|\s)que(\s|$)/.test(lower);
  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  const command = !isRitual && wordCount <= SHORT_COMMAND_MAX_WORDS
    ? HALL_COMMANDS.find((c) => c.re.test(lower))
    : null;

  if (!isRitual && (command || !isPrayerText(lower))) {
    // Lệnh ngắn hoặc bình luận thường: chỉ Phật tử của người đó cử động / hiện bong bóng, +1 Công Đức
    if (!passCooldown(1200)) return null;
    const dev = recordDevotee(cleanUser, uniqueId, avatar, 1, 0, 0);
    hallEngage(dev.uniqueId, dev.name, dev.avatar, 'comment');
    hallAction(dev.uniqueId, command ? command.action : 'say', cleanWish, dev);
    saveState();
    scheduleStateBroadcast(); // để Bảng Công Đức / tổng công đức cập nhật cả khi chỉ bình luận thường
    return { hall: { uid: dev.uniqueId, action: command ? command.action : 'say', text: cleanWish } };
  }

  if (!passCooldown(3500)) return null;

  // 1. Xin xăm / Gieo quẻ
  if (
    lower.includes('xin xăm') ||
    lower.includes('xin xam') ||
    lower.includes('gieo quẻ') ||
    lower.includes('gieo que') ||
    lower.includes('rút quẻ') ||
    lower.includes('rut que') ||
    lower.includes('quẻ') ||
    /(^|\s)que(\s|$)/.test(lower) // không bắt nhầm "quen", "quét"...
  ) {
    return Rituals.drawFortune({ user: cleanUser, uniqueId, avatar, topic: cleanWish });
  }

  // 2. Thỉnh chuông
  if (lower.includes('chuông') || lower.includes('chuong') || lower.includes('thỉnh chuông')) {
    return Rituals.ringBell({ user: cleanUser, uniqueId, avatar, count: 1, wish: cleanWish, readTts: true });
  }

  // 3. Gõ mõ
  if (lower.includes('gõ mõ') || lower.includes('go mo') || lower.includes('tụng kinh')) {
    return Rituals.strikeWoodenFish({ user: cleanUser, uniqueId, avatar, count: 3 });
  }

  // 4. Thắp hương / Bái Phật
  if (
    lower.includes('thắp hương') ||
    lower.includes('thap huong') ||
    lower.includes('dâng hương') ||
    lower.includes('dang huong') ||
    lower.includes('bái phật') ||
    lower.includes('bai phat')
  ) {
    return Rituals.burnIncense({ user: cleanUser, uniqueId, avatar, count: 3, wish: cleanWish });
  }

  // 5. Lời cầu nguyện dài -> Thả đèn hoa đăng + đọc TTS
  return Rituals.sendPrayer({ user: cleanUser, uniqueId, avatar, wish: cleanWish });
}

function isPrayerText(lower) {
  return (
    lower.includes('cầu') ||
    lower.includes('cau ') ||
    lower.includes('nguyện') ||
    lower.includes('nguyen') ||
    lower.includes('nam mô') ||
    lower.includes('nam mo') ||
    lower.includes('mô phật') ||
    lower.includes('mo phat') ||
    lower.includes('a di đà') ||
    lower.includes('a di da') ||
    lower.includes('bình an') ||
    lower.includes('tài lộc') ||
    lower.includes('chúc')
  );
}

const giftComboTracker = new Map();

async function resolveTikTokUsername(rawInput) {
  let input = String(rawInput || '').trim();
  if (!input) {
    throw new Error('Vui lòng nhập @username hoặc link TikTok Live cần kết nối');
  }
  if (input.startsWith('http://') || input.startsWith('https://') || input.includes('tiktok.com/')) {
    const urlToFetch = input.startsWith('http') ? input : `https://${input}`;
    const directMatch = urlToFetch.match(/tiktok\.com\/@([^/?#]+)/i);
    if (directMatch && directMatch[1]) {
      return directMatch[1];
    }
    try {
      const resp = await fetch(urlToFetch, { redirect: 'follow' });
      const finalUrl = resp.url || '';
      const resolvedMatch = finalUrl.match(/tiktok\.com\/@([^/?#]+)/i);
      if (resolvedMatch && resolvedMatch[1]) {
        return resolvedMatch[1];
      }
    } catch (e) {
      console.warn('[TikTok URL Resolve Warning]', e.message);
    }
  }
  return input.replace(/^@/, '').split(/[/?#]/)[0].trim();
}

function extractUserFromEvent(data) {
  const u = data?.user || data || {};
  const uniqueId = u.uniqueId || u.displayId || data?.uniqueId || '';
  const user = u.nickname || uniqueId || data?.nickname || 'Thí Chủ';
  const avatar =
    u.profilePictureUrl ||
    u.avatarLarge?.urlList?.[0] ||
    u.avatarThumb?.urlList?.[0] ||
    u.avatarMedium?.urlList?.[0] ||
    data?.profilePictureUrl ||
    '';
  return { user, uniqueId, avatar };
}

async function connectTikTokLive(usernameOrUrl) {
  const cleanUser = await resolveTikTokUsername(usernameOrUrl);
  if (!cleanUser) {
    throw new Error('Không tìm thấy @username hợp lệ từ dữ liệu nhập vào');
  }

  if (tiktokConn) {
    try {
      await tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }

  state.tiktok = {
    connected: false,
    connecting: true,
    username: cleanUser,
    roomId: null,
    viewerCount: 0,
    lastError: null
  };
  broadcastNotification('temple.state', getPublicState());

  const conn = new TikTokLiveConnection(cleanUser, {
    processInitialData: true,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false
  });
  tiktokConn = conn;
  // Sự kiện từ kết nối cũ (đã bị thay thế) không được ghi đè trạng thái của kết nối mới
  const isCurrent = () => tiktokConn === conn;
  const on = (evt, handler) => conn.on(evt, (...args) => {
    if (isCurrent()) handler(...args);
  });

  on(ControlEvent.CONNECTED, (roomState) => {
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || conn.roomId || null;
    state.tiktok.lastError = null;
    console.log(`[TikTok Live] Đã kết nối phòng @${cleanUser} (roomId: ${state.tiktok.roomId})`);
    broadcastNotification('temple.state', getPublicState());
  });

  on(ControlEvent.DISCONNECTED, () => {
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    console.log(`[TikTok Live] Đã ngắt kết nối @${cleanUser}`);
    broadcastNotification('temple.state', getPublicState());
  });

  on(ControlEvent.ERROR, (err) => {
    state.tiktok.lastError = err?.message || String(err);
    console.warn('[TikTok Live Warning]', state.tiktok.lastError);
    broadcastNotification('temple.state', getPublicState());
  });

  on(WebcastEvent.ROOM_USER, (data) => {
    const viewerCount = Number(data?.total ?? data?.viewerCount ?? 0);
    if (viewerCount > 0) {
      state.tiktok.viewerCount = viewerCount;
      broadcastNotification('temple.viewerCount', { viewerCount });
    }
  });

  on(WebcastEvent.MEMBER, (data) => {
    // Chỉ cập nhật avatar cho người đã có trên bảng; KHÔNG cộng công đức / tạo mục mới cho mỗi lượt vào phòng
    // (trước đây mỗi người xem lướt qua đều +1 CĐ, làm Bảng Vàng phình to vô hạn và sai lệch)
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const existing = uniqueId && state.devotees[uniqueId.slice(0, 40)];
    if (existing && avatar) existing.avatar = avatar;
    // Tầng 1: người chỉ vào xem live không có ghế; thỉnh thoảng được chọn đi ngang sân kèm tên
    hallArrive(existing?.uniqueId || uniqueId, user, avatar);
  });

  on(WebcastEvent.CHAT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const commentText = data?.content || data?.comment || '';
    console.log(`[TikTok Chat] ${user}: ${commentText}`);
    parseViewerComment(commentText, user, uniqueId, avatar);
  });

  on(WebcastEvent.LIKE, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const likeCount = Math.min(15, Math.max(1, Number(data?.count ?? data?.likeCount ?? 1)));
    Rituals.strikeWoodenFish({ user, uniqueId, avatar, count: likeCount });
  });

  const handleSocialEvent = (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    Rituals.ringBell({
      user,
      uniqueId,
      avatar,
      count: 1,
      wish: 'Hữu duyên tương ngộ nơi cửa Phật, cầu bình an may mắn',
      readTts: false
    });
  };
  on(WebcastEvent.FOLLOW, handleSocialEvent);
  on(WebcastEvent.SHARE, handleSocialEvent);
  on(WebcastEvent.SOCIAL, (data) => {
    const action = String(data?.action || '');
    const disp = String(data?.common?.displayText?.displayType || data?.displayType || '').toLowerCase();
    if (action === '1' || action === '3' || disp.includes('follow') || disp.includes('share')) {
      handleSocialEvent(data);
    }
  });

  on(WebcastEvent.GIFT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const giftObj = data?.gift || data?.giftDetails || {};
    const giftId = String(data?.giftId || giftObj?.id || 'rose');
    const groupId = String(data?.groupId || `${uniqueId}_${giftId}`);
    const repeatCount = Math.max(1, Number(data?.repeatCount || data?.comboCount || 1));

    const giftType = data?.giftType ?? giftObj?.type;
    const isStreakable = Number(giftType) === 1;
    const repeatEnd = Boolean(data?.repeatEnd);

    let deltaCount = repeatCount;
    if (isStreakable) {
      // Quà combo: TikTok gửi nhiều sự kiện với repeatCount tăng dần, chỉ cộng phần chênh lệch.
      // Sự kiện trùng lặp (repeatCount không tăng) phải bỏ qua, không được cộng thêm 1 lần nữa.
      const prevCount = giftComboTracker.get(groupId) || 0;
      if (repeatCount <= prevCount) {
        if (repeatEnd) giftComboTracker.delete(groupId);
        return;
      }
      deltaCount = repeatCount - prevCount;
      if (repeatEnd) {
        giftComboTracker.delete(groupId);
      } else {
        giftComboTracker.set(groupId, repeatCount);
        if (giftComboTracker.size > 500) {
          const firstKey = giftComboTracker.keys().next().value;
          giftComboTracker.delete(firstKey);
        }
      }
    }

    const diamondCount = Math.max(1, Number(giftObj?.diamondCount || data?.diamondCount || 1));
    const totalCoins = diamondCount * deltaCount;
    const rawGiftName = giftObj?.name || data?.giftName || giftObj?.describe || 'Hoa Hồng Tâm Thành';
    const displayGiftName = deltaCount > 1 ? `${deltaCount}x ${rawGiftName}` : rawGiftName;

    console.log(`[TikTok Gift] ${user} gửi ${displayGiftName} (${totalCoins} xu)`);

    Rituals.offerGift({
      user,
      uniqueId,
      avatar,
      coins: totalCoins,
      giftName: displayGiftName,
      wish: `Thành tâm dâng ${displayGiftName} kính lễ Đức Phật A Di Đà`
    });
  });

  try {
    const roomState = await conn.connect();
    if (!isCurrent()) return state.tiktok;
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || conn.roomId || null;
    broadcastNotification('temple.state', getPublicState());
    return state.tiktok;
  } catch (err) {
    if (!isCurrent()) throw err;
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    state.tiktok.lastError = err?.message || 'Không thể kết nối phòng Live (kiểm tra tài khoản đang phát Live chưa)';
    broadcastNotification('temple.state', getPublicState());
    throw new Error(state.tiktok.lastError);
  }
}

function disconnectTikTokLive() {
  if (tiktokConn) {
    const old = tiktokConn;
    tiktokConn = null;
    Promise.resolve()
      .then(() => old.disconnect())
      .catch(() => {});
  }
  state.tiktok.connected = false;
  state.tiktok.connecting = false;
  state.tiktok.viewerCount = 0;
  broadcastNotification('temple.state', getPublicState());
  return state.tiktok;
}

// ============================================================================
// 6. AUTO-SIMULATION ENGINE (CHẾ ĐỘ TỰ ĐỘNG GIẢ LẬP ĐÔNG NGƯỜI XEM)
// ============================================================================
let autoSimTimer = null;
const SIM_DEVOTEES = [
  { user: 'Ngọc Anh Nguyễn', uniqueId: 'ngocanh.98', wish: 'Con thành tâm cầu cho bố mẹ luôn mạnh khỏe, bình an' },
  { user: 'Trần Minh Quân', uniqueId: 'minhquan_bds', wish: 'Cầu tháng mới công việc thuận buồm xuôi gió, tài lộc hanh thông' },
  { user: 'Diệu Thảo Tâm An', uniqueId: 'tam_an_99', wish: 'Nam Mô A Di Đà Phật, nguyện cầu thế giới hòa bình chúng sinh an lạc' },
  { user: 'Lê Hoàng Nam', uniqueId: 'hoangnam.dev', wish: 'Cầu thi cử đỗ đạt điểm cao, sự nghiệp rộng mở' },
  { user: 'Phạm Thanh Hà', uniqueId: 'thanhha.lotus', wish: 'Cầu gia đạo êm ấm, con cái ngoan ngoãn học giỏi' },
  { user: 'Vũ Đức Thịnh', uniqueId: 'ducthinh88', wish: 'Con xin gieo một quẻ cầu tài lộc đầu năm' },
  { user: 'Hoàng Bảo Ngọc', uniqueId: 'baongoc.hb', wish: 'Cầu cho mẹ mau khỏe lại' },
  { user: 'Đỗ Gia Huy', uniqueId: 'giahuy_do', wish: 'Cầu năm nay đi làm thuận lợi' },
  { user: 'Bùi Thu Trang', uniqueId: 'thutrang.bui', wish: 'Cầu gia đình luôn hạnh phúc' },
  { user: 'Ngô Minh Khang', uniqueId: 'khang.ngo', wish: 'Cầu thi đậu đại học' }
];
const SIM_SHORT_COMMENTS = ['lạy', 'chào cả nhà', 'a di đà phật', 'niệm phật', 'lạy phật', 'chùa đẹp quá', 'hi mọi người'];
const SIM_JOIN_NAMES = ['Lan Anh', 'Minh Tuấn', 'Thảo Vy', 'Quốc Bảo', 'Ngọc Hân', 'Đức Anh', 'Kim Ngân', 'Hải Đăng', 'Phương Thảo', 'Gia Bảo', 'Tâm An', 'Thiện Nhân'];

function runSingleSimulationStep() {
  const pick = SIM_DEVOTEES[Math.floor(Math.random() * SIM_DEVOTEES.length)];
  // Tầng 1: vài người xem mới vào live (không bình luận) -> đi ngang sân kèm tên
  const joins = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < joins; i++) {
    const name = SIM_JOIN_NAMES[Math.floor(Math.random() * SIM_JOIN_NAMES.length)];
    setTimeout(() => hallArrive(`sim_join_${Math.random().toString(36).slice(2, 8)}`, name, ''), 300 + i * 3100);
  }
  // Phần lớn người xem thật chỉ gõ lệnh ngắn -> mô phỏng vài lệnh/bong bóng trước mỗi nghi thức
  const chatters = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < chatters; i++) {
    const who = SIM_DEVOTEES[Math.floor(Math.random() * SIM_DEVOTEES.length)];
    const text = SIM_SHORT_COMMENTS[Math.floor(Math.random() * SIM_SHORT_COMMENTS.length)];
    setTimeout(() => parseViewerComment(text, who.user, who.uniqueId, ''), 600 + i * 1700);
  }
  const roll = Math.random();
  if (roll < 0.30) {
    Rituals.burnIncense({ user: pick.user, uniqueId: pick.uniqueId, count: 3, wish: pick.wish });
  } else if (roll < 0.55) {
    Rituals.sendPrayer({ user: pick.user, uniqueId: pick.uniqueId, wish: pick.wish });
  } else if (roll < 0.75) {
    Rituals.drawFortune({ user: pick.user, uniqueId: pick.uniqueId, topic: pick.wish });
  } else if (roll < 0.90) {
    Rituals.offerGift({ user: pick.user, uniqueId: pick.uniqueId, giftType: 'lotus', coins: 15, giftName: 'Hoa Sen Vàng Tinh Khiết' });
  } else {
    Rituals.ringBell({ user: pick.user, uniqueId: pick.uniqueId, count: 1, wish: pick.wish, readTts: true });
  }
}

function configureAutoSim(enabled) {
  state.settings.autoSim = Boolean(enabled);
  if (autoSimTimer) {
    clearInterval(autoSimTimer);
    autoSimTimer = null;
  }
  if (state.settings.autoSim) {
    runSingleSimulationStep();
    autoSimTimer = setInterval(runSingleSimulationStep, state.settings.autoSimIntervalMs || 9500);
  }
}

// ============================================================================
// 7. JSON-RPC 2.0 DISPATCHER
// ============================================================================
async function handleRpcCall(method, params = {}) {
  switch (method) {
    case 'temple.getState':
      return getPublicState();
    case 'temple.burnIncense':
      return Rituals.burnIncense(params);
    case 'temple.strikeWoodenFish':
      return Rituals.strikeWoodenFish(params);
    case 'temple.ringBell':
      return Rituals.ringBell(params);
    case 'temple.sendPrayer':
      return Rituals.sendPrayer(params);
    case 'temple.offerGift':
      return Rituals.offerGift(params);
    case 'temple.drawFortune':
      return Rituals.drawFortune(params);
    case 'temple.grandCeremony':
      return Rituals.grandCeremony(params);
    case 'temple.updateSettings':
      return Rituals.updateSettings(params);
    case 'temple.resetMerit':
      return Rituals.resetMerit();
    case 'temple.comment':
      return parseViewerComment(params.comment, params.user, params.uniqueId, params.avatar);
    case 'temple.speak': {
      const res = await zeroTts.synthesize(params.text, params.voice);
      if (res.ok && params.broadcast !== false) {
        broadcastNotification('tts.play', {
          text: params.text,
          voice: res.voice,
          audio: res.audio,
          url: res.audio || res.url
        });
      }
      return res;
    }
    case 'temple.ttsStatus':
      return zeroTts.getStatus();
    case 'live.connect':
      return await connectTikTokLive(params.username);
    case 'live.disconnect':
      return disconnectTikTokLive();
    case 'live.simulateJoin':
      // Giả lập 1 người xem vừa vào live (sự kiện MEMBER của TikTok) để thử hall.arrive
      hallArrive(params.uniqueId || `sim_join_${Date.now().toString(36)}`, params.user || 'Thí Chủ', params.avatar || '');
      return { ok: true };
    case 'live.simulateLeave': {
      // Cho 1 người trong hàng chờ hoặc đạo tràng ra về (bước ra cửa)
      let targetUid = params.uniqueId;
      if (!targetUid && hallWaiting.size > 0) {
        targetUid = hallWaiting.keys().next().value;
      }
      if (targetUid && hallWaiting.has(targetUid)) {
        hallWaiting.delete(targetUid);
        scheduleHallBroadcast();
        return { ok: true, uid: targetUid, from: 'waiting' };
      }
      if (!targetUid && hall.size > 0) {
        for (const [uid, m] of hall) {
          if (!isVipSeat(m.seat)) { targetUid = uid; break; }
        }
      }
      if (targetUid && hall.has(targetUid)) {
        hall.delete(targetUid);
        scheduleHallBroadcast();
        return { ok: true, uid: targetUid, from: 'hall' };
      }
      return { ok: false, message: 'Không có ai để rời chùa' };
    }
    case 'live.setAutoSim':
      configureAutoSim(Boolean(params.enabled));
      saveState();
      broadcastNotification('temple.state', getPublicState());
      return getPublicState();
    default:
      throw new Error(`Không tìm thấy phương thức JSON-RPC: ${method}`);
  }
}

// ============================================================================
// 8. EXPRESS + WEBSOCKET SERVER
// ============================================================================
const app = express();
// Chặn website lạ (mở trong trình duyệt của máy stream) gọi ngầm vào /rpc, /ws.
// Request không có Origin (curl, TikFinity, Streamer.bot, webhook) và trang chạy trên localhost vẫn hoạt động.
function isAllowedOrigin(origin, host) {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    if (u.host === host) return true;
    return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch (_) {
    return false;
  }
}
app.use((req, res, next) => {
  if (!isAllowedOrigin(req.headers.origin, req.headers.host)) {
    return res.status(403).json({ error: 'Origin không được phép' });
  }
  next();
});
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/tts-cache', express.static(TTS_CACHE_DIR, { maxAge: '7d' }));
app.use('/music', express.static(MUSIC_DIR, { maxAge: '1d' }));
// Chuẩn hóa đường dẫn: Chuyển hướng 301 từ /temple3d.html về / (View 3D chính thức)
app.get('/temple3d.html', (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, '/' + query);
});

app.use(express.static(path.join(__dirname, 'public')));
// Three.js cho Chánh Điện 3D, phục vụ từ node_modules (không phụ thuộc CDN khi đang live)
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three', 'build'), { maxAge: '7d' }));
// Addons của Three.js (RoomEnvironment...) cho trang Chánh Điện 3D — nạp qua importmap "three"
app.use('/vendor/three-addons', express.static(path.join(__dirname, 'node_modules', 'three', 'examples', 'jsm'), { maxAge: '7d' }));

function getTtsDependencyStatus() {
  return (typeof zeroTts !== 'undefined' && zeroTts)
    ? zeroTts.getStatus()
    : { ready: false, status: 'uninitialized' };
}

app.get('/health', (_req, res) => {
  const ttsStatus = getTtsDependencyStatus();
  res.status(200).json({
    status: 'ok',
    service: 'live-gateway',
    ready: true,
    uptime: process.uptime(),
    timestamp: Date.now(),
    dependencies: {
      tts: ttsStatus
    }
  });
});

app.get('/ready', (_req, res) => {
  const ttsStatus = getTtsDependencyStatus();
  if (ttsStatus.ready) {
    return res.status(200).json({
      status: 'ready',
      service: 'live-gateway',
      ready: true,
      dependencies: {
        tts: ttsStatus
      }
    });
  }
  return res.status(503).json({
    status: 'unavailable',
    service: 'live-gateway',
    ready: false,
    error: `TTS Service dependency is not ready (status: ${ttsStatus.status || 'offline'})`,
    dependencies: {
      tts: ttsStatus
    }
  });
});

app.get('/temple3d.html', (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, '/' + query);
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ============================================================================
// THƯ VIỆN NHẠC NỀN (tải lên từ trang Admin, lưu ở data/music/)
// ============================================================================
const MAX_PLAYLIST = 3;
const MAX_LIBRARY = 30;
const DEFAULT_TRACK = { id: 'default', name: 'Nam Mô A Di Đà Phật (mặc định)', url: '/assets/bg_chant.m4a', builtin: true };
const MUSIC_TYPES = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/webm': 'webm',
  'audio/flac': 'flac'
};
const MUSIC_EXTS = new Set(Object.values(MUSIC_TYPES));

function readUploadedTracks() {
  try {
    const list = JSON.parse(fs.readFileSync(MUSIC_LIBRARY_FILE, 'utf8'));
    return Array.isArray(list) ? list.filter((t) => t && t.id && t.file && fs.existsSync(path.join(MUSIC_DIR, t.file))) : [];
  } catch (_) {
    return [];
  }
}

function writeUploadedTracks(list) {
  fs.writeFileSync(MUSIC_LIBRARY_FILE, JSON.stringify(list, null, 2), 'utf8');
}

function getMusicLibrary() {
  return [DEFAULT_TRACK, ...readUploadedTracks()];
}

function cleanTrackName(raw, fallback) {
  const name = String(raw || '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return name || fallback;
}

// Tải lên 1 file nhạc: POST /api/music?name=<tên hiển thị>, body = nội dung file (Content-Type: audio/*),
// header X-File-Name = tên file gốc (encodeURIComponent) để đoán đuôi file khi trình duyệt không gửi đúng MIME.
app.post('/api/music', express.raw({ type: () => true, limit: '40mb' }), (req, res) => {
  try {
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length < 1024) {
      return res.status(400).json({ ok: false, error: 'File nhạc trống hoặc quá nhỏ' });
    }
    const uploaded = readUploadedTracks();
    if (uploaded.length >= MAX_LIBRARY) {
      return res.status(400).json({ ok: false, error: `Thư viện đã đủ ${MAX_LIBRARY} bài, hãy xóa bớt trước khi tải thêm` });
    }
    let originalName = '';
    try {
      originalName = decodeURIComponent(String(req.headers['x-file-name'] || ''));
    } catch (_) {}
    const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    let ext = MUSIC_TYPES[mime];
    if (!ext) {
      const fromName = path.extname(originalName).slice(1).toLowerCase();
      ext = MUSIC_EXTS.has(fromName) ? fromName : fromName === 'mp4' ? 'm4a' : '';
    }
    if (!ext) {
      return res.status(400).json({ ok: false, error: 'Chỉ nhận file âm thanh mp3, m4a, aac, ogg, wav, webm, flac' });
    }
    const id = `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const file = `${id}.${ext}`;
    fs.writeFileSync(path.join(MUSIC_DIR, file), body);
    const track = {
      id,
      name: cleanTrackName(req.query?.name, cleanTrackName(path.basename(originalName, path.extname(originalName)), 'Nhạc nền')),
      file,
      url: `/music/${file}`,
      size: body.length,
      uploadedAt: new Date().toISOString()
    };
    writeUploadedTracks([...uploaded, track]);
    res.json({ ok: true, track, library: getMusicLibrary() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Không lưu được file nhạc' });
  }
});

app.get('/api/music', (_req, res) => {
  res.json({ ok: true, library: getMusicLibrary(), maxPlaylist: MAX_PLAYLIST });
});

// Xóa 1 bài khỏi thư viện (bài mặc định không xóa được); nếu đang nằm trong danh sách phát thì gỡ ra luôn
app.delete('/api/music/:id', (req, res) => {
  const id = String(req.params.id || '');
  const uploaded = readUploadedTracks();
  const track = uploaded.find((t) => t.id === id);
  if (!track) return res.status(404).json({ ok: false, error: 'Không tìm thấy bài nhạc' });
  try {
    fs.unlinkSync(path.join(MUSIC_DIR, track.file));
  } catch (_) {}
  writeUploadedTracks(uploaded.filter((t) => t.id !== id));
  const playlist = (state.settings.bgPlaylist || []).filter((t) => t.id !== id);
  if (playlist.length !== (state.settings.bgPlaylist || []).length) {
    state.settings = { ...state.settings, bgPlaylist: playlist };
    saveState();
    broadcastNotification('temple.state', getPublicState());
  }
  res.json({ ok: true, library: getMusicLibrary(), settings: state.settings });
});

// HTTP JSON-RPC 2.0 Endpoint
app.post('/rpc', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (!method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code: -32600, message: 'Invalid JSON-RPC Request: thiếu method' }
    });
  }
  try {
    const result = await handleRpcCall(method, params || {});
    res.json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      result
    });
  } catch (err) {
    res.status(200).json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      error: { code: -32000, message: err.message || 'Server error' }
    });
  }
});
// ZeroTTS HTTP Endpoint (Mai Chi default)
app.all('/api/tts', async (req, res) => {
  // Ép kiểu chuỗi: ?text[]=a hoặc body {text: 1} trước đây ném TypeError làm sập cả server
  const text = String(req.body?.text || req.query?.text || '').trim();
  const voice = String(req.body?.voice || req.query?.voice || state.settings.ttsVoice || 'maichi').trim();
  if (!text) {
    return res.status(400).json({ ok: false, error: 'Thiếu nội dung text cần đọc' });
  }
  try {
    const result = await zeroTts.synthesize(text, voice);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'TTS error' });
  }
});

app.get('/api/state', (_req, res) => {
  res.json(getPublicState());
});

const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  path: '/ws',
  verifyClient: ({ origin, req }) => isAllowedOrigin(origin, req.headers.host)
});

function broadcastNotification(method, params) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params
  });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  ws.send(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'temple.state',
      params: getPublicState()
    })
  );

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch (_) {
      return;
    }
    if (!msg || !msg.method) return;
    try {
      const result = await handleRpcCall(msg.method, msg.params || {});
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result
          })
        );
      }
    } catch (err) {
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32000, message: err.message || 'RPC Error' }
          })
        );
      }
    }
  });
});

const zeroTts = new ZeroTTSManager();

if (process.env.NO_SERVER_LISTEN !== '1') {
  server.listen(PORT, () => {
  console.log(`============================================================`);
  console.log(`🪷 CHÙA THIÊN MỤ — TIKTOK LIVE RPC ĐÃ KHỞI ĐỘNG`);
  console.log(`📺 Màn hình Live (9:16 OBS): http://localhost:${PORT}`);
  console.log(`🎛️ Bảng điều khiển RPC Admin: http://localhost:${PORT}/admin`);
  console.log(`🔌 JSON-RPC 2.0 Endpoint   : http://localhost:${PORT}/rpc (ws://localhost:${PORT}/ws)`);
  console.log(`============================================================`);

  // Khôi phục chế độ giả lập đã lưu trong merit-state.json (trước đây cờ được lưu nhưng timer không chạy lại)
  if (state.settings.autoSim) {
    configureAutoSim(true);
  }

  // Tự động kết nối tới @zenfacts_vn ngay khi khởi động server
  const defaultChannel = process.env.TIKTOK_USER || state.tiktok?.username || 'zenfacts_vn';
  if (defaultChannel) {
    connectTikTokLive(defaultChannel).catch((err) => {
      console.warn(`[Auto-Connect @${defaultChannel}] Chưa kết nối được ngay:`, err.message);
    });
  }
});
}

// Chỉ export khi được file khác import/require (ví dụ: bun test)
// Tránh export { app } khi chạy trực tiếp để Bun không kích hoạt nhầm Bun.serve()
const isDirectRun = typeof Bun !== 'undefined' ? import.meta.main : (require.main === module);

if (!isDirectRun) {
  module.exports = {
    app,
    server,
    handleRpcCall,
    ZeroTTSManager,
    zeroTts,
    broadcastNotification,
    getPublicState,
    Rituals
  };
}
