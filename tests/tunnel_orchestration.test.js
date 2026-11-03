import { describe, test, expect } from "bun:test";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

describe("Cloudflare Tunnel & Docker Protection Orchestration", () => {
  const projectRoot = path.resolve(__dirname, "..");
  const tunnelComposePath = path.join(projectRoot, "docker-compose.tunnel.yml");
  const nginxConfPath = path.join(projectRoot, "deploy", "cloudflare", "nginx.conf");
  const envExamplePath = path.join(projectRoot, ".env.tunnel.example");
  const genHtpasswdPath = path.join(projectRoot, "scripts", "gen-htpasswd.js");
  const htpasswdPath = path.join(projectRoot, "deploy", "cloudflare", ".htpasswd");

  test("docker-compose.tunnel.yml syntax is valid and defines 4 services with multi-layer defense", () => {
    expect(fs.existsSync(tunnelComposePath)).toBe(true);

    const composeConfig = execSync("docker compose -f docker-compose.tunnel.yml config", {
      cwd: projectRoot,
      encoding: "utf-8",
    });

    // All 4 services defined
    expect(composeConfig).toContain("tts-service:");
    expect(composeConfig).toContain("live-gateway:");
    expect(composeConfig).toContain("proxy-guard:");
    expect(composeConfig).toContain("cloudflared:");

    // Health dependencies chain: cloudflared -> proxy-guard -> live-gateway -> tts-service
    expect(composeConfig).toMatch(/proxy-guard:\s+condition:\s*service_healthy/i);
    expect(composeConfig).toMatch(/live-gateway:\s+condition:\s*service_healthy/i);
    expect(composeConfig).toMatch(/tts-service:\s+condition:\s*service_healthy/i);

    // Port security protection: live-gateway MUST bind strictly to 127.0.0.1
    expect(composeConfig).toMatch(/host_ip:\s*127\.0\.0\.1/);
    expect(composeConfig).toContain("target: 3000");

    // Internal bridge network
    expect(composeConfig).toMatch(/chua-online-network/);
  });

  test("Nginx proxy guard config enforces admin basic auth, rpc rate limit, and websocket upgrade", () => {
    expect(fs.existsSync(nginxConfPath)).toBe(true);
    const nginxConf = fs.readFileSync(nginxConfPath, "utf-8");

    // Real IP restoration from Cloudflare
    expect(nginxConf).toContain("real_ip_header CF-Connecting-IP;");
    expect(nginxConf).toContain("set_real_ip_from 173.245.48.0/20;");

    // Dual stack listen 80 and [::]:80
    expect(nginxConf).toContain("listen 80;");
    expect(nginxConf).toContain("listen [::]:80;");

    // Rate limiting zone for RPC
    expect(nginxConf).toContain("limit_req_zone $binary_remote_addr zone=rpc_limit:10m rate=10r/s;");
    expect(nginxConf).toMatch(/limit_req zone=rpc_limit burst=20 nodelay;/);

    // Admin authentication protection
    expect(nginxConf).toContain('auth_basic "Khu Vuc Quan Tri Chanh Dien";');
    expect(nginxConf).toContain("auth_basic_user_file /etc/nginx/.htpasswd;");

    // WebSocket upgrade and long keepalive timeout
    expect(nginxConf).toContain("proxy_set_header Upgrade $http_upgrade;");
    expect(nginxConf).toContain('proxy_set_header Connection "upgrade";');
    expect(nginxConf).toContain("proxy_read_timeout 86400s;");
  });

  test("Environment templates and htpasswd generator script are present and functional", () => {
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const envContent = fs.readFileSync(envExamplePath, "utf-8");
    expect(envContent).toContain("TUNNEL_TOKEN=");
    expect(envContent).toContain("ADMIN_USER=");
    expect(envContent).toContain("ADMIN_PASSWORD=");

    expect(fs.existsSync(genHtpasswdPath)).toBe(true);
    expect(fs.existsSync(htpasswdPath)).toBe(true);
    const htpasswdContent = fs.readFileSync(htpasswdPath, "utf-8");
    expect(htpasswdContent).toContain("{SHA}");
  });
});
