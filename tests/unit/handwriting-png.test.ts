import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { SNAPSHOT_WIDTH_PX, renderStrokesPng, snapshotSize } from "@/services/handwriting/render-png";

/** Reads the grayscale pixels back out of a PNG made by the renderer. */
function decode(png: Uint8Array): { width: number; height: number; pixels: Uint8Array } {
  const buffer = Buffer.from(png);
  expect([...buffer.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  expect(buffer[24]).toBe(8);
  expect(buffer[25]).toBe(0);
  const idatLength = buffer.readUInt32BE(33);
  const raw = inflateSync(buffer.subarray(41, 41 + idatLength));
  expect(raw.length).toBe((width + 1) * height);
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) pixels.set(raw.subarray(y * (width + 1) + 1, (y + 1) * (width + 1)), y * width);
  return { width, height, pixels };
}

const stroke = (points: number[][], width = 0.0032) => ({ tool: "pen" as const, width, points });

describe("handwriting snapshot PNG", () => {
  it("is a valid PNG at the shape of the writing area, white where nothing was drawn", () => {
    const image = decode(renderStrokesPng({ strokes: [], aspect: 2 }));
    expect(image.width).toBe(SNAPSHOT_WIDTH_PX);
    expect(image.height).toBe(SNAPSHOT_WIDTH_PX / 2);
    expect(image.pixels.every((value) => value === 255)).toBe(true);
    expect(snapshotSize(undefined)).toEqual({ width: SNAPSHOT_WIDTH_PX, height: 900 });
  });

  it("draws a stroke where it was written and leaves the rest white", () => {
    const image = decode(renderStrokesPng({ strokes: [stroke([[0.1, 0.5, 0.5, 0], [0.9, 0.5, 0.5, 100]])], aspect: 2 }));
    const at = (x: number, y: number) => image.pixels[Math.round(y * image.height) * image.width + Math.round(x * image.width)] as number;
    expect(at(0.5, 0.5)).toBeLessThan(120);
    expect(at(0.5, 0.1)).toBe(255);
    expect(at(0.02, 0.5)).toBe(255);
  });

  it("draws a single tap as a dot, ignores eraser strokes and clamps points outside the page", () => {
    const dot = decode(renderStrokesPng({ strokes: [stroke([[0.5, 0.5, 1, 0]], 0.01)], aspect: 1 }));
    expect(dot.pixels[Math.round(dot.height * 0.5) * dot.width + Math.round(dot.width * 0.5)]).toBeLessThan(120);

    const none = decode(renderStrokesPng({ strokes: [{ tool: "eraser", width: 0.01, points: [[0.1, 0.1, 1, 0], [0.9, 0.9, 1, 9]] }], aspect: 1 }));
    expect(none.pixels.every((value) => value === 255)).toBe(true);

    const wild = decode(renderStrokesPng({ strokes: [stroke([[-5, -5, 1, 0], [9, 9, 1, 5]])], aspect: 1 }));
    expect(wild.pixels.some((value) => value < 255)).toBe(true);
  });

  it("copes with a very fast, very long stroke and a huge or missing aspect", () => {
    const started = Date.now();
    renderStrokesPng({ strokes: [stroke([[0, 0, 1, 0], [1, 1, 1, 1], [0, 1, 1, 2], [1, 0, 1, 3]], 0.02)], aspect: 1 });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(snapshotSize(1000).height).toBeGreaterThanOrEqual(240);
    expect(snapshotSize(0.001).height).toBeLessThanOrEqual(3200);
  });
});
