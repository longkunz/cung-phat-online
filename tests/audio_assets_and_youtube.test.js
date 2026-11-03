import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import fs from "fs";
import path from "path";
import http from "http";
import AudioModule from "../public/js/audio.js";
const { extractYouTubeId, TempleAudioEngine } = AudioModule;

describe("Tổ chức Assets Âm Thanh Thật & YouTube Background Player", () => {
  test("1. extractYouTubeId trích xuất chính xác Video ID từ mọi định dạng link", () => {
    const testCases = [
      { input: "dQw4w9WgXcQ", expected: "dQw4w9WgXcQ" },
      { input: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", expected: "dQw4w9WgXcQ" },
      { input: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s", expected: "dQw4w9WgXcQ" },
      { input: "https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ", expected: "dQw4w9WgXcQ" },
      { input: "https://youtu.be/dQw4w9WgXcQ?si=abcdef123", expected: "dQw4w9WgXcQ" },
      { input: "https://www.youtube.com/live/dQw4w9WgXcQ", expected: "dQw4w9WgXcQ" },
      { input: "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1", expected: "dQw4w9WgXcQ" },
      { input: "https://www.youtube.com/shorts/dQw4w9WgXcQ", expected: "dQw4w9WgXcQ" },
      { input: "", expected: "" },
      { input: null, expected: "" },
      { input: "not-a-valid-url", expected: "" },
    ];

    for (const { input, expected } of testCases) {
      expect(extractYouTubeId(input)).toBe(expected);
    }
  });

  test("2. Thư mục assets/audio được tổ chức chuẩn và có sẵn các file âm thanh thật", () => {
    const sfxDir = path.join(import.meta.dir, "..", "public", "assets", "audio", "sfx");
    const bgDir = path.join(import.meta.dir, "..", "public", "assets", "audio", "bg");

    expect(fs.existsSync(sfxDir)).toBe(true);
    expect(fs.existsSync(bgDir)).toBe(true);

    // Kiểm tra các file âm thanh pháp khí
    expect(fs.existsSync(path.join(sfxDir, "woodfish.wav"))).toBe(true);
    expect(fs.existsSync(path.join(sfxDir, "bell.wav"))).toBe(true);
    expect(fs.existsSync(path.join(sfxDir, "chime.wav"))).toBe(true);
    expect(fs.existsSync(path.join(sfxDir, "fortune.wav"))).toBe(true);

    // Kiểm tra file nhạc nền dự phòng
    expect(fs.existsSync(path.join(bgDir, "default.wav"))).toBe(true);
  });

  test("3. TempleAudioEngine áp dụng youtubeUrl và ducking", () => {
    const engine = new TempleAudioEngine();
    expect(engine.youtubeUrl).toBe("");

    engine.applySettings({
      youtubeUrl: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
      bgMusicEnabled: true,
      musicVolume: 0.8,
    });

    expect(engine.youtubeUrl).toBe("https://www.youtube.com/watch?v=jfKfPfyJRdk");
    expect(engine.youtubeVideoId).toBe("jfKfPfyJRdk");
    expect(engine.bgBaseVolume).toBe(0.8);
    expect(engine.getDuckedVolume()).toBeLessThan(0.8);
  });

  test("4. RPC temple.updateSettings nhận và xác thực youtubeUrl, loại bỏ /api/music", async () => {
    const { handleRpcCall, getPublicState } = await import("../server.js");
    
    // Gọi RPC cập nhật youtubeUrl
    const res = await handleRpcCall("temple.updateSettings", {
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      bgMusicEnabled: true,
      musicVolume: 0.75,
    });

    expect(res.settings.youtubeUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(res.settings.bgMusicEnabled).toBe(true);
    expect(res.settings.musicVolume).toBe(0.75);

    // Xác thực kiểu dữ liệu
    expect(handleRpcCall("temple.updateSettings", {
      youtubeUrl: 12345,
    })).rejects.toThrow("Link YouTube phải là chuỗi ký tự");
  });
});
