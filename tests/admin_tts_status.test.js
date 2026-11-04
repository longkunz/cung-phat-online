import { describe, expect, test } from "bun:test";
import fs from "fs";
import path from "path";

describe("Admin Dashboard TTS Status Feedback Loop", () => {
  test("Trang admin.html nạp script mà không gặp lỗi và cập nhật ttsServiceStatus từ 'Đang kiểm tra dịch vụ TTS...' sang trạng thái thật", async () => {
    const adminHtml = fs.readFileSync(path.join(import.meta.dir, "..", "public", "admin.html"), "utf8");
    const audioJs = fs.readFileSync(path.join(import.meta.dir, "..", "public", "js", "audio.js"), "utf8");

    // Trích xuất mã JavaScript trong thẻ <script> cuối cùng của admin.html
    const scriptMatches = [...adminHtml.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)];
    expect(scriptMatches.length).toBeGreaterThan(0);
    const inlineScript = scriptMatches[scriptMatches.length - 1][1];

    // Tạo môi trường giả lập DOM cho admin.html
    const elementStore = new Map();
    function createMockElement(id = "") {
      return {
        id,
        textContent: id === "ttsServiceStatus" ? "Đang kiểm tra dịch vụ TTS..." : "",
        value: id === "ttsVolume" ? "95" : (id === "musicVolume" ? "65" : (id === "sfxVolume" ? "80" : "")),
        checked: true,
        disabled: false,
        style: {},
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
          contains: () => false
        },
        dataset: {},
        children: [],
        options: [],
        innerHTML: "",
        replaceChildren(...nodes) { this.children = nodes; },
        addEventListener: () => {},
        querySelectorAll: () => [],
        onclick: null,
        onsubmit: null,
        pause: () => {},
        removeAttribute: () => {},
        load: () => {},
        play: async () => {},
      };
    }

    const mockHead = {
      appendChild: () => {}
    };

    const mockDocument = {
      head: mockHead,
      createElement(tag) {
        return createMockElement(tag);
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      getElementById(id) {
        if (!elementStore.has(id)) {
          elementStore.set(id, createMockElement(id));
        }
        return elementStore.get(id);
      }
    };

    // Giả lập fetch('/api/state') trả về dịch vụ TTS sẵn sàng
    const mockState = {
      totalIncense: 100,
      totalMerit: 500,
      tts: {
        ready: true,
        status: "ready",
        voice: "maichi",
        voices: ["baotrang", "giahuy", "hamy", "huuduc", "kimoanh", "maichi", "quangminh", "tiendat"]
      },
      settings: {
        ttsEnabled: true,
        ttsVoice: "maichi",
        ttsVolume: 0.95
      }
    };

    const mockFetch = async (url) => {
      if (url === "/api/state") {
        return {
          ok: true,
          json: async () => mockState
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    // Chuẩn bị global context
    const fakeGlobal = {
      window: {},
      document: mockDocument,
      fetch: mockFetch,
      setInterval: () => {},
      setTimeout: () => {},
      clearTimeout: () => {},
      Option: function(text, value) { return { text, value }; },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
      },
      console: console
    };
    fakeGlobal.window = fakeGlobal;

    // Chạy audio.js trước
    const runAudio = new Function("window", "document", "localStorage", audioJs);
    runAudio(fakeGlobal.window, fakeGlobal.document, fakeGlobal.localStorage);

    // Bắt lỗi khi chạy inline script của admin.html
    let scriptError = null;
    try {
      const runner = new Function(
        "window", "document", "fetch", "setInterval", "setTimeout", "clearTimeout", "Option", "localStorage", "console", "TempleAudioEngine",
        `
        with (window) {
          ${inlineScript}
        }
        `
      );
      runner(
        fakeGlobal.window,
        fakeGlobal.document,
        fakeGlobal.fetch,
        fakeGlobal.setInterval,
        fakeGlobal.setTimeout,
        fakeGlobal.clearTimeout,
        fakeGlobal.Option,
        fakeGlobal.localStorage,
        fakeGlobal.console,
        fakeGlobal.window.TempleAudioEngine
      );
    } catch (err) {
      scriptError = err;
    }

    // Nếu script lỗi, scriptError sẽ mang lỗi
    expect(scriptError).toBeNull();

    // Chờ microtasks / Promise của refreshStatus chạy xong
    await new Promise(resolve => setTimeout(resolve, 50));

    const statusEl = mockDocument.getElementById("ttsServiceStatus");
    // User symptom: Vẫn kẹt ở 'Đang kiểm tra dịch vụ TTS...' thay vì cập nhật trạng thái
    expect(statusEl.textContent).not.toBe("Đang kiểm tra dịch vụ TTS...");
    expect(statusEl.textContent).toBe("Dịch vụ TTS: Sẵn sàng");
  });
});
