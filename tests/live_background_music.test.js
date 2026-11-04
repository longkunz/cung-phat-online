import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test";
import fs from "fs";
import path from "path";

const nativeFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalAudio = globalThis.Audio;
const originalLocalStorage = globalThis.localStorage;

describe("Live Background Music Playback (Bug Diagnosis & Reproduction)", () => {
  let playCalls;
  let bgAudioInstance;
  let windowMock;

  afterAll(() => {
    globalThis.fetch = nativeFetch;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.Audio = originalAudio;
    globalThis.localStorage = originalLocalStorage;
  });

  function setupEnvironment({ fileExistsMap = {} } = {}) {
    playCalls = [];
    bgAudioInstance = null;

    class MockAudio {
      constructor(src) {
        this._src = src || "";
        this.volume = 1;
        this.loop = false;
        this.paused = true;
        bgAudioInstance = this;
      }
      get src() {
        return this._src;
      }
      set src(val) {
        this._src = val;
      }
      play() {
        playCalls.push({ src: this._src, volume: this.volume });
        this.paused = false;
        return Promise.resolve();
      }
      pause() {
        this.paused = true;
      }
      addEventListener() {}
      removeEventListener() {}
    }

    const fetchMock = mock(async (url, opts = {}) => {
      const cleanUrl = url.replace(/^\//, "");
      // Check physical file on disk or in mock map
      const fullPath = path.join(import.meta.dir, "..", "public", cleanUrl);
      const existsOnDisk = fs.existsSync(fullPath);
      const exists = fileExistsMap[url] !== undefined ? fileExistsMap[url] : existsOnDisk;
      if (exists) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => new ArrayBuffer(100),
        };
      }
      return {
        ok: false,
        status: 404,
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    });

    windowMock = {
      AudioContext: function () {
        return {
          state: "running",
          createGain: () => ({
            gain: { value: 1, setTargetAtTime: () => {} },
            connect: () => {},
          }),
          destination: {},
          decodeAudioData: async () => ({ duration: 5 }),
        };
      },
      fetch: fetchMock,
      location: { search: "?obs=1" },
    };

    globalThis.window = windowMock;
    globalThis.fetch = fetchMock;
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    globalThis.Audio = MockAudio;
    globalThis.document = {
      body: { appendChild: () => {} },
      head: { appendChild: () => {} },
      getElementById: () => null,
      querySelector: () => null,
      createElement: () => ({
        style: {},
        setAttribute: () => {},
        appendChild: () => {},
      }),
    };

    const code = fs.readFileSync(path.join(import.meta.dir, "../public/js/audio.js"), "utf8");
    const initFn = new Function("window", "localStorage", "Audio", "document", "fetch", code + "; return TempleAudioEngine;");
    const TempleAudioEngineClass = initFn(windowMock, globalThis.localStorage, MockAudio, globalThis.document, fetchMock);

    return { TempleAudioEngineClass, fetchMock };
  }

  test("1. DEFAULT_BG_CANDIDATES: first candidate must be an existing physical file", () => {
    // Assets that the engine defaults to must actually exist on disk!
    const defaultWav = path.join(import.meta.dir, "../public/assets/audio/bg/default.wav");

    // The primary file that startLocalBgAudio immediately assigns when !bgAudio.src
    // Must exist on disk so live doesn't produce 404
    expect(fs.existsSync(defaultWav)).toBe(true);

    const audioCode = fs.readFileSync(path.join(import.meta.dir, "../public/js/audio.js"), "utf8");
    const match = audioCode.match(/const DEFAULT_BG_CANDIDATES = \[\s*['"]([^'"]+)['"]/);
    expect(match).toBeTruthy();
    const primaryCandidate = match[1].replace(/^\//, "");
    const primaryPath = path.join(import.meta.dir, "..", "public", primaryCandidate);
    expect(fs.existsSync(primaryPath)).toBe(true);
  });

  test("2. startLocalBgAudio must not set a non-existent candidate src and fail playback", async () => {
    const { TempleAudioEngineClass } = setupEnvironment();
    const engine = new TempleAudioEngineClass();

    // Call ensureContext immediately as OBS or live user interaction does
    engine.ensureContext();

    // Must have triggered play
    expect(playCalls.length).toBeGreaterThan(0);
    // The played source MUST NOT be a 404 path
    const playedSrc = playCalls[0].src;
    const cleanPath = playedSrc.replace(/^\//, "");
    const physicalPath = path.join(import.meta.dir, "..", "public", cleanPath);
    expect(fs.existsSync(physicalPath)).toBe(true);
  });

  test("3. When candidate resolution finishes after initial start, it must resume/switch to valid audio", async () => {
    const { TempleAudioEngineClass } = setupEnvironment();
    const engine = new TempleAudioEngineClass();

    engine.ensureContext();
    const initialPlayCalls = playCalls.length;

    // Wait for setupLocalBgCandidates async loop to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(engine.bgAudio.src).toBeTruthy();
    const cleanPath = engine.bgAudio.src.replace(/^\//, "");
    expect(fs.existsSync(path.join(import.meta.dir, "..", "public", cleanPath))).toBe(true);
    // Must be playing valid audio (not paused due to src change without play())
    expect(engine.bgAudio.paused).toBe(false);
  });

  test("4. YouTube playback: when URL is set before player ready, it must play when ready", () => {
    const { TempleAudioEngineClass } = setupEnvironment();
    const engine = new TempleAudioEngineClass();

    // Unlock context (e.g. OBS mode or user unlock button)
    engine.ensureContext();

    // Server sends settings with YouTube URL
    engine.applySettings({
      bgMusicEnabled: true,
      youtubeUrl: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
    });

    expect(engine.youtubeVideoId).toBe("jfKfPfyJRdk");

    // Simulate YouTube iframe API becoming ready later
    let playerEventCallbacks = {};
    let playedVideo = false;
    let loadedVideoId = null;

    windowMock.YT = {
      Player: function (id, options) {
        playerEventCallbacks = options.events;
        return {
          playVideo: () => { playedVideo = true; },
          pauseVideo: () => {},
          setVolume: () => {},
          loadVideoById: (id) => { loadedVideoId = id; playedVideo = true; },
        };
      },
    };

    // Trigger API ready
    engine.ensureYouTubePlayer();
    // Simulate onReady event from YT player
    playerEventCallbacks.onReady({ target: engine.ytPlayer });

    // The YouTube video MUST be loaded and played
    expect(playedVideo).toBe(true);
  });

  test("5. YouTube playback: when YT.Player is initialized with empty ID, then setYouTubeUrl arrives before onReady", () => {
    const { TempleAudioEngineClass } = setupEnvironment();
    const engine = new TempleAudioEngineClass();

    engine.ensureContext();

    let playerEventCallbacks = {};
    let currentVideoIdInPlayer = null;
    let playedVideo = false;

    windowMock.YT = {
      Player: function (id, options) {
        playerEventCallbacks = options.events;
        currentVideoIdInPlayer = options.videoId;
        return {
          playVideo: () => {
            if (currentVideoIdInPlayer) playedVideo = true;
          },
          pauseVideo: () => {},
          setVolume: () => {},
          loadVideoById: (id) => {
            currentVideoIdInPlayer = id;
            playedVideo = true;
          },
        };
      },
    };

    // 1. YT API ready early before state arrives (videoId is undefined/empty)
    engine.ensureYouTubePlayer();
    expect(currentVideoIdInPlayer).toBeUndefined();

    // 2. State arrives with YouTube URL while player is still initializing (ytReady is false)
    engine.applySettings({
      bgMusicEnabled: true,
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    // 3. Now player finishes initializing and fires onReady
    playerEventCallbacks.onReady({ target: engine.ytPlayer });

    // Must have loaded the video ID and started playing
    expect(currentVideoIdInPlayer).toBe("dQw4w9WgXcQ");
    expect(playedVideo).toBe(true);
  });

  test("6. Idempotent music start: calling startMusic or ensuring context when enabled must guarantee playback attempt", () => {
    const { TempleAudioEngineClass } = setupEnvironment();
    const engine = new TempleAudioEngineClass();

    expect(engine.bgMusicEnabled).toBe(true);

    // Initial unlock
    engine.ensureContext();
    const countAfterEnsure = playCalls.length;
    expect(countAfterEnsure).toBeGreaterThan(0);

    // User or UI calls setMusicEnabled(true) or startMusic() explicitly
    engine.startMusic();
    expect(playCalls.length).toBeGreaterThan(countAfterEnsure);
  });

  test("7. Server fallback: GET /assets/audio/bg/default.mp3 seamlessly serves default.wav (200 OK)", async () => {
    const http = await import("http");
    process.env.NO_SERVER_LISTEN = "1";
    const { app } = await import("../server.js");
    const serverInstance = http.createServer(app);
    await new Promise((resolve) => serverInstance.listen(0, resolve));
    const port = serverInstance.address().port;

    try {
      const res = await nativeFetch(`http://127.0.0.1:${port}/assets/audio/bg/default.mp3`);
      expect(res.status).toBe(200);
      const buf = await res.arrayBuffer();
      // Should serve audio data from default.wav
      expect(buf.byteLength).toBeGreaterThan(1000);
    } finally {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  });
});
