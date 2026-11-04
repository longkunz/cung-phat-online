import { describe, test, expect, mock } from "bun:test";
import fs from "fs";
import path from "path";

describe("TTS Multiple Messages & Last Word Truncation Diagnosis", () => {
  function createAudioEngineEnvironment() {
    let pauseCalls = 0;
    let playCalls = 0;
    const instances = [];

    globalThis.window = {
      AudioContext: function() {
        return {
          state: "running",
          createGain: () => ({ gain: { value: 1, setTargetAtTime: () => {} }, connect: () => {} }),
          destination: {}
        };
      }
    };
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {}
    };

    globalThis.Audio = function(url) {
      this.url = url;
      this.volume = 1;
      this.paused = false;
      this.play = mock(() => {
        playCalls++;
        return Promise.resolve();
      });
      this.pause = mock(() => {
        pauseCalls++;
        this.paused = true;
      });
      this.load = () => {};
      instances.push(this);
    };

    const code = fs.readFileSync(path.join(import.meta.dir, "../public/js/audio.js"), "utf8");
    const initFn = new Function("window", "localStorage", "Audio", code + "; return TempleAudioEngine;");
    const TempleAudioEngineClass = initFn(globalThis.window, globalThis.localStorage, globalThis.Audio);
    const engine = new TempleAudioEngineClass();

    const ttsInstances = () => instances.filter(i => typeof i.url === "string" && i.url.length > 0);

    return {
      engine,
      getPauseCalls: () => pauseCalls,
      getPlayCalls: () => playCalls,
      getTtsInstances: ttsInstances
    };
  }

  test("MUST NOT call audio.pause() when audio.onended fires naturally (prevents hardware buffer cutoff)", async () => {
    const { engine, getPauseCalls, getTtsInstances } = createAudioEngineEnvironment();
    engine.ttsEnabled = true;

    // Simulate pre-resolved audio URL so fetch is skipped
    engine.fetchZeroTtsAudio = async () => ({ ok: true, audio: "data:audio/wav;base64,TEST" });

    const playPromise = new Promise((resolve) => {
      engine.enqueueTts("Nam mô A Di Đà Phật", {
        url: "data:audio/wav;base64,TEST",
        onEnd: resolve
      });
    });

    // Wait microtick for Audio instance to be created
    await new Promise((r) => setTimeout(r, 10));

    const instances = getTtsInstances();
    expect(instances.length).toBe(1);
    const audioInstance = instances[0];

    // Trigger onended as the browser would when track finishes
    audioInstance.onended();
    await playPromise;

    // CRITICAL: audio.pause() inside onended cuts off the trailing hardware buffer
    // in Chromium/OBS CEF, causing the last word to be dropped!
    expect(getPauseCalls()).toBe(0);
  });

  test("Queue spacing between multiple messages: enforces tail protection gap >= 350ms", async () => {
    const { engine, getTtsInstances } = createAudioEngineEnvironment();
    engine.ttsEnabled = true;

    const timestamps = [];
    const p1 = new Promise((resolve) => {
      engine.enqueueTts("Lời nhắn thứ nhất của thí chủ", {
        url: "data:audio/wav;base64,TEST1",
        onEnd: () => {
          timestamps.push({ event: "end1", time: Date.now() });
          resolve();
        }
      });
    });

    const p2 = new Promise((resolve) => {
      engine.enqueueTts("Lời nhắn thứ hai của thí chủ", {
        url: "data:audio/wav;base64,TEST2",
        onStart: () => {
          timestamps.push({ event: "start2", time: Date.now() });
          resolve();
        }
      });
    });

    await new Promise((r) => setTimeout(r, 10));
    const instances = getTtsInstances();
    expect(instances.length).toBe(1);

    // End message 1
    instances[0].onended();
    await p1;
    await p2;

    const end1 = timestamps.find(t => t.event === "end1");
    const start2 = timestamps.find(t => t.event === "start2");
    expect(end1).toBeDefined();
    expect(start2).toBeDefined();

    // Spacing between end of msg 1 and start of msg 2 must be >= 350ms to allow ear & audio buffer clear
    const gap = start2.time - end1.time;
    expect(gap).toBeGreaterThanOrEqual(350);
  });
});
