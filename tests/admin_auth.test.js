import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import http from "http";

describe("Admin Authentication via .env (Seam: adminAuthMiddleware)", () => {
  let serverInstance;
  let serverPort;

  beforeAll(async () => {
    process.env.NO_SERVER_LISTEN = "1";
    process.env.ADMIN_USER = "testadmin";
    process.env.ADMIN_PASSWORD = "testpassword123";

    const { app } = await import("../server.js");
    serverInstance = http.createServer(app);
    await new Promise((resolve) => serverInstance.listen(0, resolve));
    serverPort = serverInstance.address().port;
  });

  afterAll(async () => {
    delete process.env.ADMIN_USER;
    delete process.env.ADMIN_PASSWORD;
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  });

  test("GET /admin without Authorization header returns 401 and Basic realm", async () => {
    const res = await fetch(`http://localhost:${serverPort}/admin`);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Basic");
  });

  test("GET /admin with invalid credentials returns 401", async () => {
    const creds = Buffer.from("testadmin:wrongpass").toString("base64");
    const res = await fetch(`http://localhost:${serverPort}/admin`, {
      headers: {
        Authorization: `Basic ${creds}`,
      },
    });
    expect(res.status).toBe(401);
  });

  test("GET /admin with correct .env credentials returns 200 and loads admin page", async () => {
    const creds = Buffer.from("testadmin:testpassword123").toString("base64");
    const res = await fetch(`http://localhost:${serverPort}/admin`, {
      headers: {
        Authorization: `Basic ${creds}`,
      },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Bảng Điều Khiển JSON-RPC 2.0");
  });
});
