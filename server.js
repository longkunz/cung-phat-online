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

fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });

// ============================================================================
// 1. BỘ 18 QUẺ LINH XĂM CHÙA LINH ỨNG (FORTUNE STICKS DECK)
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
// 2. ZEROTTS PYTHON WORKER MANAGER (VOICE: MAI CHI)
// ============================================================================
class ZeroTTSManager {
  constructor() {
    this.proc = null;
    this.ready = false;
    this.status = 'starting';
    this.voice = 'maichi';
    this.voices = ['maichi'];
    this.model = 'zeroweight-ai/ZeroTTS';
    this.pending = new Map();
    this.inflight = new Map();
    this.reqCounter = 0;
    this.buffer = '';
    this.restartAttempts = 0;
    this.restartTimer = null;
    this.startWorker();
  }

  resolvePythonBin() {
    const isWindows = process.platform === 'win32';
    const venvPy = path.join(__dirname, '.venv', isWindows ? 'Scripts' : 'bin', isWindows ? 'python.exe' : 'python');
    if (fs.existsSync(venvPy)) return venvPy;
    return isWindows ? 'python' : 'python3';
  }

  startWorker() {
    const pyBin = this.resolvePythonBin();
    const scriptPath = path.join(__dirname, 'tts_worker.py');
    console.log(`[ZeroTTS] Khởi chạy worker với ${pyBin} (Giọng mặc định: Mai Chi)...`);

    this.status = 'loading';
    this.buffer = '';
    const proc = spawn(pyBin, [scriptPath], {
      cwd: __dirname,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.proc = proc;

    // Không có listener 'error' thì lỗi spawn (vd. không tìm thấy python) sẽ làm sập cả server
    proc.on('error', (err) => {
      console.error('[ZeroTTS] Không khởi chạy được worker:', err.message);
      this.handleWorkerExit(proc, null);
    });
    // Ghi vào stdin khi worker đã chết gây EPIPE -> phải bắt lỗi để không crash
    proc.stdin.on('error', (err) => {
      console.warn('[ZeroTTS] Lỗi ghi stdin worker:', err.message);
    });

    proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      let lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        this.handleWorkerLine(line.trim());
      }
    });

    proc.stderr.on('data', (chunk) => {
      const msg = chunk.toString('utf8').trim();
      if (msg) console.log(`[ZeroTTS stderr] ${msg}`);
    });

    proc.on('exit', (code) => {
      console.warn(`[ZeroTTS] Worker thoát với mã ${code}`);
      this.handleWorkerExit(proc, code);
    });
  }

  handleWorkerExit(proc, code) {
    if (this.proc !== proc) return; // đã xử lý (error + exit có thể cùng bắn)
    this.proc = null;
    this.ready = false;
    this.status = 'stopped';
    for (const [, item] of this.pending) {
      clearTimeout(item.timer);
      item.resolve({ ok: false, error: 'ZeroTTS worker exited' });
    }
    this.pending.clear();
    broadcastNotification('tts.status', this.getStatus());

    // Tự khởi động lại worker với backoff (tối đa 60s) thay vì mất TTS vĩnh viễn
    if (!this.restartTimer) {
      const delay = Math.min(60000, 2000 * 2 ** this.restartAttempts);
      this.restartAttempts += 1;
      console.warn(`[ZeroTTS] Thử khởi động lại worker sau ${Math.round(delay / 1000)}s...`);
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        this.startWorker();
      }, delay);
    }
  }

  handleWorkerLine(line) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'status') {
        this.status = msg.status;
        this.model = msg.model || this.model;
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'ready') {
        this.ready = true;
        this.status = 'ready';
        this.restartAttempts = 0;
        this.voice = msg.voice || 'maichi';
        this.voices = msg.voices || ['maichi'];
        this.model = msg.model || this.model;
        console.log(`[ZeroTTS] Sẵn sàng sau ${msg.loadSec}s! Giọng: ${this.voice} (${this.voices.join(', ')})`);
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'result' && msg.id != null) {
        const entry = this.pending.get(msg.id);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(msg.id);
          entry.resolve(msg);
        }
      } else if (msg.type === 'error') {
        console.error('[ZeroTTS Error]', msg.error);
        this.status = 'error';
        broadcastNotification('tts.status', this.getStatus());
      }
    } catch (err) {
      console.log('[ZeroTTS stdout]', line);
    }
  }

  getStatus() {
    return {
      ready: this.ready,
      status: this.status,
      engine: 'ZeroTTS (zeroweight-ai/ZeroTTS)',
      voice: state.settings.ttsVoice || this.voice || 'maichi',
      voices: this.voices,
      model: this.model
    };
  }

  synthesize(text, voiceOverride) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return Promise.resolve({ ok: false, error: 'Empty text' });
    const voice = String(voiceOverride || state.settings.ttsVoice || 'maichi').trim().toLowerCase();
    const dedupKey = `${voice}::${cleanText}`;

    if (this.inflight.has(dedupKey)) {
      return this.inflight.get(dedupKey);
    }

    const promise = new Promise((resolve) => {
      if (!this.proc || !this.ready) {
        return resolve({ ok: false, error: `ZeroTTS đang ở trạng thái: ${this.status}` });
      }
      const id = ++this.reqCounter;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'ZeroTTS synthesis timeout' });
      }, 30000);

      this.pending.set(id, { resolve, timer });
      const payload = JSON.stringify({ id, text: cleanText, voice }) + '\n';
      this.proc.stdin.write(payload);
    }).finally(() => {
      this.inflight.delete(dedupKey);
    });

    this.inflight.set(dedupKey, promise);
    return promise;
  }
}

// ============================================================================
// 3. TRẠNG THÁI CHÙA ONLINE & BẢNG VÀNG CÔNG ĐỨC
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
    sfxEnabled: true,
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
        settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
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

    const ttsText = params.readTts === false
      ? ''
      : `Nam mô A Di Đà Phật. Cảm tạ thí chủ ${devotee.name} đã thành tâm thắp ${count} nén hương thơm. ${wish}.`;

    const event = pushEventLog({
      type: 'burnIncense',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
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

    const event = pushEventLog({
      type: 'strikeWoodenFish',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
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

    const ttsText = params.readTts
      ? `Thí chủ ${devotee.name} thỉnh Đại Hồng Chung cầu nguyện: ${wish}.`
      : '';

    const event = pushEventLog({
      type: 'ringBell',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
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

    const ttsText = params.readTts === false
      ? ''
      : `Lời cầu nguyện của thí chủ ${devotee.name}: ${wish}. Nam mô A Di Đà Phật.`;

    const event = pushEventLog({
      type: 'sendPrayer',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
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

    const ttsText = params.readTts === false
      ? ''
      : `Công đức vô lượng! Cảm tạ thí chủ ${devotee.name} đã phát tâm dâng cúng ${giftName}, tích thêm ${merit} điểm công đức. Nguyện cầu chư Phật gia hộ cho thí chủ vạn sự cát tường như ý.`;

    const event = pushEventLog({
      type: giftType === 'dragon' ? 'grandCeremony' : 'offerGift',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
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

    const ttsText = params.readTts === false
      ? ''
      : `Thí chủ ${devotee.name} vừa gieo được ${fortune.ttsSummary}`;

    const event = pushEventLog({
      type: 'drawFortune',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
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
    if (params.autoSimIntervalMs !== undefined &&
        (typeof params.autoSimIntervalMs !== 'number' || !Number.isFinite(params.autoSimIntervalMs) || params.autoSimIntervalMs < 2000)) {
      throw new Error('Chu kỳ giả lập phải là số mili-giây >= 2000');
    }
    // Chỉ nhận các khóa cài đặt hợp lệ, tránh client ghi đè rác vào state/merit-state.json
    const ALLOWED_KEYS = ['ttsEnabled', 'ttsVoice', 'ttsVolume', 'musicVolume', 'bgMusicEnabled', 'sfxEnabled', 'smokeDensity', 'autoSim', 'autoSimIntervalMs'];
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
    saveState();
    broadcastNotification('temple.state', getPublicState());
    return getPublicState();
  }
};

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

  // Chống 1 người spam bình luận liên tục làm nghẽn hàng đợi TTS (cooldown 3.5 giây/người)
  const userKey = uniqueId || user || '';
  const now = Date.now();
  if (userKey) {
    const lastTs = commentCooldownMap.get(userKey) || 0;
    if (now - lastTs < 3500) {
      return null;
    }
    commentCooldownMap.set(userKey, now);
    if (commentCooldownMap.size > 600) {
      const oldestKey = commentCooldownMap.keys().next().value;
      commentCooldownMap.delete(oldestKey);
    }
  }

  const cleanUser = sanitizeUserName(user);
  const lower = cleanWish.toLowerCase();

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
    lower.includes('bai phat') ||
    lower.includes('lạy phật') ||
    lower.includes('lay phat')
  ) {
    return Rituals.burnIncense({ user: cleanUser, uniqueId, avatar, count: 3, wish: cleanWish });
  }

  // 5. Cầu nguyện / Thả đèn hoa đăng
  if (
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
  ) {
    return Rituals.sendPrayer({ user: cleanUser, uniqueId, avatar, wish: cleanWish });
  }

  return Rituals.burnIncense({ user: cleanUser, uniqueId, avatar, count: 1, wish: cleanWish });
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
    const { uniqueId, avatar } = extractUserFromEvent(data);
    const existing = uniqueId && state.devotees[uniqueId.slice(0, 40)];
    if (existing && avatar) existing.avatar = avatar;
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
  { user: 'Vũ Đức Thịnh', uniqueId: 'ducthinh88', wish: 'Con xin gieo một quẻ cầu tài lộc đầu năm' }
];

function runSingleSimulationStep() {
  const pick = SIM_DEVOTEES[Math.floor(Math.random() * SIM_DEVOTEES.length)];
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
          url: res.url
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
app.use(express.static(path.join(__dirname, 'public')));
// Three.js cho chế độ 2.5D, phục vụ từ node_modules (không phụ thuộc CDN khi đang live)
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three', 'build'), { maxAge: '7d' }));

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
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

server.listen(PORT, () => {
  console.log(`============================================================`);
  console.log(`🪷 CHÙA ONLINE TIKTOK LIVE RPC ĐÃ KHỞI ĐỘNG`);
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
