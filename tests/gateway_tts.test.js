import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import http from "http";

describe("Live Gateway TTS Microservice Integration (Seams B & C)", () => {
  let mockTtsServer;
  let mockTtsPort = 8099;
  let ttsHealthy = true;
  let lastSynthesizeBody = null;

  beforeAll(async () => {
    // Start a mock TTS HTTP service
    mockTtsServer = http.createServer((req, res) => {
      if (req.method === "GET" && req.url === "/health") {
        if (!ttsHealthy) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "error", error: "TTS offline" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "ready",
          voices: ["maichi", "baotrang"],
          model: "zeroweight-ai/ZeroTTS",
          sampleRate: 48000,
          uptimeSec: 42.0
        }));
      } else if (req.method === "GET" && req.url === "/voices") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          default: "maichi",
          voices: ["maichi", "baotrang"]
        }));
      } else if (req.method === "POST" && req.url === "/synthesize") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
          lastSynthesizeBody = JSON.parse(body || "{}");
          if (!ttsHealthy) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "TTS service offline" }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            ok: true,
            audio: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQAAAAA=",
            durationSec: 1.25,
            voice: lastSynthesizeBody.voice || "maichi"
          }));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise(resolve => mockTtsServer.listen(mockTtsPort, resolve));
  });

  afterAll(async () => {
    await new Promise(resolve => mockTtsServer.close(resolve));
  });

  test("ZeroTTSManager communicates with standalone TTS service over HTTP", async () => {
    process.env.TTS_SERVICE_URL = `http://localhost:${mockTtsPort}`;
    process.env.NO_SERVER_LISTEN = "1";

    const { ZeroTTSManager } = await import("../server.js");
    const manager = new ZeroTTSManager(`http://localhost:${mockTtsPort}`);
    
    // Check health polling
    await manager.checkHealth();
    expect(manager.ready).toBe(true);
    expect(manager.status).toBe("ready");
    expect(manager.voices).toContain("maichi");

    // Check synthesis
    const synthRes = await manager.synthesize("Nam mô A Di Đà Phật", "maichi");
    expect(synthRes.ok).toBe(true);
    expect(synthRes.audio).toContain("data:audio/wav;base64,");
    expect(synthRes.durationSec).toBe(1.25);
    expect(lastSynthesizeBody.text).toBe("Nam mô A Di Đà Phật");
    
    manager.destroy();
  });

  test("RPC temple.speak receives in-memory Data URI and broadcasts tts.play event", async () => {
    process.env.TTS_SERVICE_URL = `http://localhost:${mockTtsPort}`;
    process.env.NO_SERVER_LISTEN = "1";

    const { handleRpcCall, zeroTts } = await import("../server.js");
    if (zeroTts) {
      zeroTts.baseUrl = `http://localhost:${mockTtsPort}`;
      await zeroTts.checkHealth();
    }

    const res = await handleRpcCall("temple.speak", {
      text: "Cảm tạ thí chủ",
      voice: "maichi"
    });

    expect(res.ok).toBe(true);
    expect(res.audio).toContain("data:audio/wav;base64,");
  });

  test("Soft dependency: when TTS service is down, rituals succeed and speak fails cleanly", async () => {
    ttsHealthy = false;
    process.env.TTS_SERVICE_URL = `http://localhost:${mockTtsPort}`;

    const { handleRpcCall, zeroTts } = await import("../server.js");
    if (zeroTts) {
      zeroTts.baseUrl = `http://localhost:${mockTtsPort}`;
      await zeroTts.checkHealth();
      expect(zeroTts.ready).toBe(false);
    }

    // temple.speak returns non-fatal failure instead of throwing
    const speakRes = await handleRpcCall("temple.speak", { text: "Thử khi offline" });
    expect(speakRes.ok).toBe(false);

    // temple.burnIncense still succeeds normally
    const incenseRes = await handleRpcCall("temple.burnIncense", {
      user: "Thí Chủ",
      count: 3
    });
    expect(incenseRes.event).toBeDefined();
    expect(incenseRes.event.type).toBe("burnIncense");
    expect(incenseRes.state).toBeDefined();

    // temple.strikeWoodenFish still succeeds normally
    const fishRes = await handleRpcCall("temple.strikeWoodenFish", {
      user: "Thí Chủ",
      count: 1
    });
    expect(fishRes.event).toBeDefined();
    expect(fishRes.event.type).toBe("strikeWoodenFish");

    // Auto-recovery
    ttsHealthy = true;
    if (zeroTts) {
      await zeroTts.checkHealth();
      expect(zeroTts.ready).toBe(true);
      expect(zeroTts.status).toBe("ready");
    }
  });

  test("Timeout guard: health check aborts on stalled response", async () => {
    let stallServer;
    const stallPort = 8098;
    stallServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
    });
    await new Promise(resolve => stallServer.listen(stallPort, resolve));

    try {
      const { ZeroTTSManager } = await import("../server.js");
      const manager = new ZeroTTSManager(`http://localhost:${stallPort}`);

      const t0 = Date.now();
      await manager.checkHealth();
      const elapsedHealth = Date.now() - t0;
      expect(manager.ready).toBe(false);
      expect(manager.status).toBe("offline");
      expect(elapsedHealth).toBeLessThan(4500);

      manager.destroy();
    } finally {
      await new Promise(resolve => stallServer.close(resolve));
    }
  }, 10000);

  test("Timeout guard: synthesize aborts on stalled response", async () => {
    let stallServer;
    const stallPort = 8097;
    stallServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
    });
    await new Promise(resolve => stallServer.listen(stallPort, resolve));

    try {
      const { ZeroTTSManager } = await import("../server.js");
      const manager = new ZeroTTSManager(`http://localhost:${stallPort}`);

      manager.ready = true;
      const t1 = Date.now();
      const synthRes = await manager.synthesize("Thử timeout");
      const elapsedSynth = Date.now() - t1;
      expect(synthRes.ok).toBe(false);
      expect(synthRes.error).toContain("timeout");
      expect(elapsedSynth).toBeLessThan(7500);

      manager.destroy();
    } finally {
      await new Promise(resolve => stallServer.close(resolve));
    }
  }, 10000);
});
