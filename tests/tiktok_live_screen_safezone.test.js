import { describe, it, expect } from "bun:test";
import fs from "fs";
import path from "path";

describe("TikTok Live Screen & Safe Zone Compliance", () => {
  const cssPath = path.resolve(import.meta.dir, "../public/css/temple3d.css");
  const htmlPath = path.resolve(import.meta.dir, "../public/index.html");
  const jsPath = path.resolve(import.meta.dir, "../public/js/temple3d.js");

  const css = fs.readFileSync(cssPath, "utf-8");
  const html = fs.readFileSync(htmlPath, "utf-8");
  const js = fs.readFileSync(jsPath, "utf-8");

  it("Canvas & Stage conform to TikTok vertical format 9:16 (1080x1920), not 16:9 landscape", () => {
    // 16:9 is landscape (1920x1080); TikTok mobile is vertical 9:16 (1080x1920)
    expect(html).toContain('width="1080" height="1920"');
    expect(css).toMatch(/aspect-ratio:\s*9\s*\/\s*16/);
    expect(css).toMatch(/width:\s*1080px/);
    expect(css).toMatch(/height:\s*1920px/);
    expect(js).toContain("const STAGE_W = 1080;");
    expect(js).toContain("const STAGE_H = 1920;");
  });

  // Mobile Safe Zone requirements:
  // On 19.5:9 (iPhone) & 20:9 (Android) phones, TikTok Live zooms 9:16 video to fit height,
  // cropping ~9% - 10% from BOTH left and right edges (approx 97px - 108px).
  // Additionally, TikTok mobile overlays action buttons on the right side (~120-160px).
  // Elements with margin < 96px from screen edges WILL be cropped or covered on mobile!
  const MIN_MOBILE_SAFE_MARGIN_LEFT = 96;  // Minimum pixels from left edge (1080px canvas)
  const MIN_MOBILE_SAFE_MARGIN_RIGHT = 96; // Minimum pixels from right edge (1080px canvas)

  it("Left panel (.guide-scroll) respects mobile safe area margins to prevent edge clipping", () => {
    const guideMatch = css.match(/\.guide-scroll\s*\{[^}]*left:\s*([0-9.]+)px/);
    expect(guideMatch).not.toBeNull();
    const leftPx = parseFloat(guideMatch[1]);
    expect(leftPx).toBeGreaterThanOrEqual(MIN_MOBILE_SAFE_MARGIN_LEFT);
  });

  it("Right top panel (.gift-board) respects mobile safe area margins to prevent edge clipping", () => {
    const giftMatch = css.match(/\.gift-board\s*\{[^}]*right:\s*([0-9.]+)px/);
    expect(giftMatch).not.toBeNull();
    const rightPx = parseFloat(giftMatch[1]);
    expect(rightPx).toBeGreaterThanOrEqual(MIN_MOBILE_SAFE_MARGIN_RIGHT);
  });

  it("Right bottom panel (.merit-scroll) respects mobile safe area margins to prevent edge clipping", () => {
    const meritMatch = css.match(/\.merit-scroll\s*\{[^}]*right:\s*([0-9.]+)px/);
    expect(meritMatch).not.toBeNull();
    const rightPx = parseFloat(meritMatch[1]);
    expect(rightPx).toBeGreaterThanOrEqual(MIN_MOBILE_SAFE_MARGIN_RIGHT);
  });

  it("Maintains adequate center aisle clearance (>= 320px) for 3D Buddha, aisle walkway, and prayer bubbles", () => {
    const guideLeftMatch = css.match(/\.guide-scroll\s*\{[^}]*left:\s*([0-9.]+)px/);
    const guideWidthMatch = css.match(/\.guide-scroll\s*\{[^}]*width:\s*([0-9.]+)px/);
    const giftRightMatch = css.match(/\.gift-board\s*\{[^}]*right:\s*([0-9.]+)px/);
    const giftWidthMatch = css.match(/\.gift-board\s*\{[^}]*width:\s*([0-9.]+)px/);

    expect(guideLeftMatch).not.toBeNull();
    expect(guideWidthMatch).not.toBeNull();
    expect(giftRightMatch).not.toBeNull();
    expect(giftWidthMatch).not.toBeNull();

    const leftEdge = parseFloat(guideLeftMatch[1]) + parseFloat(guideWidthMatch[1]);
    const rightEdge = 1080 - (parseFloat(giftRightMatch[1]) + parseFloat(giftWidthMatch[1]));
    const centerAisleWidth = rightEdge - leftEdge;

    // Center aisle must accommodate central devotee path and speech bubbles (max-width: 330px)
    expect(centerAisleWidth).toBeGreaterThanOrEqual(320);
  });

  it("Panels start below top TikTok header zone (top >= 180px)", () => {
    const guideTopMatch = css.match(/\.guide-scroll\s*\{[^}]*top:\s*([0-9.]+)px/);
    const giftTopMatch = css.match(/\.gift-board\s*\{[^}]*top:\s*([0-9.]+)px/);

    expect(guideTopMatch).not.toBeNull();
    expect(giftTopMatch).not.toBeNull();

    expect(parseFloat(guideTopMatch[1])).toBeGreaterThanOrEqual(180);
    expect(parseFloat(giftTopMatch[1])).toBeGreaterThanOrEqual(180);
  });
});
