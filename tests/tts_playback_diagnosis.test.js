import { describe, test, expect, mock } from "bun:test";
import fs from "fs";
import path from "path";

describe("TTS Playback & Fallback Removal Diagnosis", () => {
  function createAudioEngineEnvironment() {
    const speakMock = mock(() => {});
    const audioPlayMock = mock(() => Promise.resolve());
    
    // Setup browser mocks
    globalThis.window = {
      AudioContext: function() {
        return {
          state: "running",
          createGain: () => ({ gain: { value: 1, setTargetAtTime: () => {} }, connect: () => {} }),
          destination: {}
        };
      },
      speechSynthesis: {
        speak: speakMock,
        cancel: mock(() => {}),
        getVoices: () => [{ name: "Vietnamese", lang: "vi-VN" }]
      },
      SpeechSynthesisUtterance: function(text) {
        this.text = text;
        this.lang = "vi-VN";
      }
    };
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {}
    };
    globalThis.Audio = function(url) {
      this.url = url;
      this.volume = 1;
      this.play = audioPlayMock;
      this.pause = () => {};
      this.load = () => {};
      this.removeAttribute = () => {};
      this.getAttribute = () => this.url;
      this.addEventListener = () => {};
      this.removeEventListener = () => {};
      setTimeout(() => {
        if (this.onended) this.onended();
      }, 10);
    };

    globalThis.SpeechSynthesisUtterance = globalThis.window.SpeechSynthesisUtterance;
    globalThis.speechSynthesis = globalThis.window.speechSynthesis;

    // Load audio.js
    const code = fs.readFileSync(path.join(import.meta.dir, "../public/js/audio.js"), "utf8");
    const initFn = new Function("window", "localStorage", "Audio", code + "; return TempleAudioEngine;");
    const TempleAudioEngineClass = initFn(globalThis.window, globalThis.localStorage, globalThis.Audio);
    const engine = new TempleAudioEngineClass();
    
    return { engine, speakMock, audioPlayMock };
  }

  test("MUST NOT fallback to Web Speech API when ZeroTTS audio is unavailable (stay silent)", async () => {
    const { engine, speakMock } = createAudioEngineEnvironment();
    engine.ttsEnabled = true;

    // Simulate ZeroTTS returning error / unavailable
    engine.fetchZeroTtsAudio = async () => ({ ok: false, error: "ZeroTTS offline or timed out" });

    let started = false;
    let ended = false;

    await new Promise((resolve) => {
      engine.enqueueTts("Cảm tạ thí chủ dâng hương", {
        onStart: () => { started = true; },
        onEnd: () => {
          ended = true;
          resolve();
        }
      });
    });

    // Verify lifecycle callbacks ran so UI rituals don't freeze
    expect(started).toBe(true);
    expect(ended).toBe(true);

    // CRITICAL: Must be silent! Fallback TTS API must NOT be called!
    expect(speakMock).not.toHaveBeenCalled();
    expect(typeof engine.playWebSpeechFallback).toBe("undefined");
  });

  test("ZeroTTSManager disk caching: caches synthesized audio and serves hits without calling service", async () => {
    process.env.NO_SERVER_LISTEN = "1";
    process.env.NODE_ENV = "test";
    const http = await import("http");
    let synthCalls = 0;
    const testPort = 8094;
    const server = http.createServer((req, res) => {
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ready", voices: ["maichi"] }));
      } else if (req.method === "POST" && req.url === "/synthesize") {
        synthCalls++;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          audio: "data:audio/wav;base64,CACHE_TEST_AUDIO",
          durationSec: 1.5,
          voice: "maichi"
        }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((r) => server.listen(testPort, r));

    try {
      const { ZeroTTSManager } = await import("../server.js");
      const manager = new ZeroTTSManager(`http://localhost:${testPort}`);
      await manager.checkHealth();

      const uniqueText = `Câu kinh độc bản thử cache ${Date.now()}`;
      
      // Lần 1: Gọi qua HTTP microservice
      const res1 = await manager.synthesize(uniqueText, "maichi");
      expect(res1.ok).toBe(true);
      expect(res1.audio).toBe("data:audio/wav;base64,CACHE_TEST_AUDIO");
      expect(synthCalls).toBe(1);

      // Lần 2: Phục vụ tức thì từ cache đĩa, synthCalls không tăng
      const res2 = await manager.synthesize(uniqueText, "maichi");
      expect(res2.ok).toBe(true);
      expect(res2.cached).toBe(true);
      expect(res2.audio).toBe("data:audio/wav;base64,CACHE_TEST_AUDIO");
      expect(synthCalls).toBe(1);

      manager.destroy();
    } finally {
      await new Promise((r) => server.close(r));
    }
  }, 15000);
});
