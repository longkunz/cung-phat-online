import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import http from "http";
import { execSync } from "child_process";
import path from "path";

describe("Orchestration & Health Checks (Seam 1 & 2)", () => {
  let serverInstance;
  let serverPort;
  let app;
  let zeroTts;

  beforeAll(async () => {
    process.env.NO_SERVER_LISTEN = "1";
    process.env.TTS_SERVICE_URL = "http://localhost:8008";
    const serverModule = await import("../server.js");
    app = serverModule.app;
    zeroTts = serverModule.zeroTts;

    serverInstance = http.createServer(app);
    await new Promise((resolve) => serverInstance.listen(0, resolve));
    serverPort = serverInstance.address().port;
  });

  afterAll(async () => {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  });

  test("GET /health returns 200 with service info and dependency health status", async () => {
    const res = await fetch(`http://localhost:${serverPort}/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("live-gateway");
    expect(body.ready).toBe(true);
    expect(typeof body.uptime).toBe("number");
    expect(body.dependencies).toBeDefined();
    expect(body.dependencies.tts).toBeDefined();
    expect(body.dependencies.tts.serviceUrl).toBeDefined();
  });

  test("GET /ready returns 200 when TTS dependency is ready and 503 when offline", async () => {
    // 1. Simulate TTS ready
    zeroTts.ready = true;
    zeroTts.status = "ready";

    const readyRes = await fetch(`http://localhost:${serverPort}/ready`);
    expect(readyRes.status).toBe(200);
    const readyBody = await readyRes.json();
    expect(readyBody.ready).toBe(true);
    expect(readyBody.service).toBe("live-gateway");

    // 2. Simulate TTS offline / not ready
    zeroTts.ready = false;
    zeroTts.status = "offline";

    const unreadyRes = await fetch(`http://localhost:${serverPort}/ready`);
    expect(unreadyRes.status).toBe(503);
    const unreadyBody = await unreadyRes.json();
    expect(unreadyBody.ready).toBe(false);
    expect(unreadyBody.error).toBeDefined();

    // Restore
    zeroTts.ready = true;
    zeroTts.status = "ready";
  });

  test("docker-compose.yml defines bridge network, generous start_period, restart recovery, and healthchecks", () => {
    const projectRoot = path.resolve(__dirname, "..");
    // Validate syntax with docker compose config
    const composeConfig = execSync("docker compose config", {
      cwd: projectRoot,
      encoding: "utf-8",
    });

    // Check compose structure
    expect(composeConfig).toContain("services:");
    expect(composeConfig).toContain("live-gateway:");
    expect(composeConfig).toContain("tts-service:");
    // Check internal bridge network
    expect(composeConfig).toMatch(/networks:/i);
    // Check service_healthy condition and restart: true recovery
    expect(composeConfig).toMatch(/condition:\s*service_healthy/i);
    expect(composeConfig).toMatch(/restart:\s*true/i);
    // Check start_period and start_interval for slow model downloads
    expect(composeConfig).toMatch(/start_period:\s*(?:1[2-9]\d|2\d\d|3\d\d|[2-5]m)/i);
    expect(composeConfig).toMatch(/start_interval:\s*5s/i);
    // Check model cache volume
    expect(composeConfig).toContain("/root/.cache/zerotts-local");
  });
});
