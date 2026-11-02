import { describe, test, expect } from "bun:test";
import path from "path";

describe("Local Dev Scripts & Runner Orchestration (Seam 3)", () => {
  test("resolvePython resolves python from env or venv or system", async () => {
    const runAll = await import("../scripts/run-all.js");
    expect(typeof runAll.resolvePython).toBe("function");

    // Custom env override
    process.env.PYTHON = "custom-python";
    expect(runAll.resolvePython()).toBe("custom-python");
    delete process.env.PYTHON;

    // Normal resolution
    const resolved = runAll.resolvePython();
    expect(typeof resolved).toBe("string");
    expect(resolved.length).toBeGreaterThan(0);
  });

  test("resolveGatewayCmd supports bun and node with fallback and override", async () => {
    const runAll = await import("../scripts/run-all.js");
    expect(typeof runAll.resolveGatewayCmd).toBe("function");

    process.env.GATEWAY_RUNNER = "node";
    expect(runAll.resolveGatewayCmd()).toBe("node");
    delete process.env.GATEWAY_RUNNER;

    const cmd = runAll.resolveGatewayCmd();
    expect(["bun", "node"]).toContain(cmd);
  });

  test("buildGatewayArgs generates correct arguments for bun and node in dev and prod", async () => {
    const runAll = await import("../scripts/run-all.js");
    expect(typeof runAll.buildGatewayArgs).toBe("function");

    // Bun dev & prod
    expect(runAll.buildGatewayArgs("bun", true)).toEqual(["--watch", "server.js"]);
    expect(runAll.buildGatewayArgs("bun", false)).toEqual(["run", "server.js"]);

    // Node dev & prod
    expect(runAll.buildGatewayArgs("node", true)).toEqual(["--watch", "server.js"]);
    expect(runAll.buildGatewayArgs("node", false)).toEqual(["server.js"]);
  });

  test("createLogLinePrefixer formats lines with color prefix without chunk tearing", async () => {
    const runAll = await import("../scripts/run-all.js");
    expect(typeof runAll.createLogLinePrefixer).toBe("function");

    const collected = [];
    const prefixer = runAll.createLogLinePrefixer("[Gateway]", "\x1b[36m", (line) => {
      collected.push(line);
    });

    // Feed fragmented chunks
    prefixer.feed("Line 1 starts ");
    prefixer.feed("and ends here\nLine 2 single\n");
    prefixer.feed("Line 3 without ending newline");
    prefixer.flush();

    expect(collected.length).toBe(3);
    expect(collected[0]).toContain("[Gateway]");
    expect(collected[0]).toContain("Line 1 starts and ends here");
    expect(collected[1]).toContain("Line 2 single");
    expect(collected[2]).toContain("Line 3 without ending newline");
  });
});
