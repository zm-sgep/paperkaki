import { deflateSync } from "node:zlib";

/**
 * Draws a child's saved working (the stroke document, docs/ARCHITECTURE.md section 10) as a PNG, on
 * the server, from the data that was saved. No browser or canvas library is involved, so the snapshot
 * is the same wherever it is made and a device cannot upload a picture that differs from the strokes.
 *
 * Plain grayscale: dark ink on white, round line ends, soft edges. Strokes are page-relative
 * (x and y run 0 to 1), so the image is drawn at the shape of the writing area when it is known.
 */

export type SnapshotStroke = {
  tool: "pen" | "eraser";
  /** Pen width as a fraction of the writing area's width. */
  width: number;
  /** [x, y, pressure, t] */
  points: readonly (readonly number[])[];
};

export type SnapshotInput = { strokes: readonly SnapshotStroke[]; aspect?: number | undefined };

export const SNAPSHOT_WIDTH_PX = 1200;
const DEFAULT_ASPECT = 4 / 3;
const MIN_HEIGHT_PX = 240;
const MAX_HEIGHT_PX = 3200;
const INK = 0x2a;
const MIN_LINE_PX = 1.6;
/** Long segments are drawn in short pieces so that a fast stroke never scans a huge box. */
const PIECE_PX = 24;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function radiusAt(width: number, pressure: number): number {
  return Math.max(MIN_LINE_PX, width * SNAPSHOT_WIDTH_PX * (0.55 + 0.9 * clamp(pressure, 0, 1))) / 2;
}

/** Darkens the pixels a round-ended segment reaches. Coverage falls off over the last pixel, for soft edges. */
function stamp(pixels: Uint8Array, w: number, h: number, ax: number, ay: number, ar: number, bx: number, by: number, br: number): void {
  const reach = Math.max(ar, br) + 1;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
  const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + reach));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach));
  const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + reach));
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = lengthSquared === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1);
      const distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      const radius = ar + (br - ar) * t;
      const coverage = clamp(radius + 0.5 - distance, 0, 1);
      if (coverage <= 0) continue;
      const value = Math.round(255 - coverage * (255 - INK));
      const index = y * w + x;
      if (value < (pixels[index] as number)) pixels[index] = value;
    }
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Size of the snapshot for a writing area's shape. */
export function snapshotSize(aspect: number | undefined): { width: number; height: number } {
  const shape = aspect !== undefined && Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_ASPECT;
  return { width: SNAPSHOT_WIDTH_PX, height: Math.round(clamp(SNAPSHOT_WIDTH_PX / shape, MIN_HEIGHT_PX, MAX_HEIGHT_PX)) };
}

export function renderStrokesPng(input: SnapshotInput): Uint8Array {
  const { width, height } = snapshotSize(input.aspect);
  const pixels = new Uint8Array(width * height).fill(255);

  for (const stroke of input.strokes) {
    if (stroke.tool !== "pen") continue;
    const points = stroke.points.filter((p) => p.length >= 2);
    const at = (i: number) => {
      const p = points[i] as readonly number[];
      return { x: clamp(p[0] as number, 0, 1) * width, y: clamp(p[1] as number, 0, 1) * height, r: radiusAt(stroke.width, p[2] ?? 0.5) };
    };
    if (points.length === 1) {
      const a = at(0);
      stamp(pixels, width, height, a.x, a.y, a.r, a.x, a.y, a.r);
      continue;
    }
    for (let i = 1; i < points.length; i += 1) {
      const a = at(i - 1);
      const b = at(i);
      const pieces = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / PIECE_PX));
      for (let k = 0; k < pieces; k += 1) {
        const t0 = k / pieces;
        const t1 = (k + 1) / pieces;
        stamp(
          pixels,
          width,
          height,
          a.x + (b.x - a.x) * t0,
          a.y + (b.y - a.y) * t0,
          a.r + (b.r - a.r) * t0,
          a.x + (b.x - a.x) * t1,
          a.y + (b.y - a.y) * t1,
          a.r + (b.r - a.r) * t1,
        );
      }
    }
  }

  // One filter byte (0, "none") in front of every row.
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0;
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}
