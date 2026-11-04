import { describe, test, expect } from 'bun:test';
const { handleRpcCall, state } = require('../server.js');

describe('TikTok Live Connection Feedback Loop', () => {
  test('connectTikTokLive gracefully detects offline streamer without burning signature quotas', async () => {
    // Current bug: when an offline user like 'zenfacts_vn' is connected,
    // it skips isLive check and hits EulerStream sign server directly, getting rate limited or crashing.
    // It should check isLive or catch cleanly with an informative Vietnamese message.
    try {
      await handleRpcCall('live.connect', { username: 'zenfacts_vn' });
      // If by some miracle it connected, it would be connected
      expect(state.tiktok.connected).toBe(true);
    } catch (err) {
      // Must give a clear, informative message that the user is offline
      // NOT a raw SignatureRateLimitError or undefined or [object Object]
      expect(err.message).toMatch(/(không phát trực tiếp|offline|chưa phát live)/i);
      expect(state.tiktok.connected).toBe(false);
      expect(state.tiktok.connecting).toBe(false);
      expect(state.tiktok.lastError).toBeTruthy();
      expect(state.tiktok.lastError).not.toContain('undefined');
      expect(state.tiktok.lastError).not.toContain('[object Object]');
    }
  });

  test('connectTikTokLive configures signApiKey when provided in environment', async () => {
    // The connector must support SIGN_API_KEY or TIKTOK_SIGN_API_KEY from .env
    const prevKey = process.env.SIGN_API_KEY;
    process.env.SIGN_API_KEY = 'test_api_key_12345';
    try {
      const serverCode = await Bun.file('server.js').text();
      expect(serverCode).toMatch(/signApiKey\s*:\s*(process\.env\.(SIGN_API_KEY|TIKTOK_SIGN_API_KEY)|signApiKey)/);
    } finally {
      if (prevKey !== undefined) {
        process.env.SIGN_API_KEY = prevKey;
      } else {
        delete process.env.SIGN_API_KEY;
      }
    }
  });

  test('admin.html surfaces state.tiktok status and lastError to the user', async () => {
    const adminHtml = await Bun.file('public/admin.html').text();
    // The admin page must display TikTok connection status and error feedback to the user
    expect(adminHtml).toMatch(/id="ttStatus"/i);
    expect(adminHtml).toMatch(/renderTikTokStatus/);
  });

  test('temple.updateSettings saves tiktokUsername and signApiKey directly without .env', async () => {
    const res = await handleRpcCall('temple.updateSettings', {
      tiktokUsername: 'kenh_chua_online',
      signApiKey: 'test_key_xyz'
    });
    expect(res.settings.tiktokUsername).toBe('kenh_chua_online');
    expect(res.settings.signApiKey).toBe('test_key_xyz');
    expect(state.settings.tiktokUsername).toBe('kenh_chua_online');
    expect(state.tiktok.username).toBe('kenh_chua_online');
  });

  test('connectTikTokLive persists connected username into settings', async () => {
    try {
      await handleRpcCall('live.connect', { username: '@kenh_moi_phat_live' });
    } catch (_) {
      // Offline or rate-limited error is fine, but the username must be remembered in settings
    }
    expect(state.settings.tiktokUsername).toBe('kenh_moi_phat_live');
    expect(state.tiktok.username).toBe('kenh_moi_phat_live');
  });

  test('server startup does not auto-connect to TikTok live without user clicking connect', async () => {
    const serverCode = await Bun.file('server.js').text();
    const listenIndex = serverCode.indexOf('server.listen(');
    expect(listenIndex).toBeGreaterThan(0);
    const listenBlock = serverCode.slice(listenIndex);
    expect(listenBlock).not.toMatch(/connectTikTokLive\(/);
  });
});
