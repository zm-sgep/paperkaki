import { deflateSync } from "node:zlib";

/**
 * Synthetic "filled-in paper" pages for the fixture provider. A fixture page is a real PNG (ruled
 * lines and blocks, so it looks like a photographed page to the size and sharpness checks) with the
 * answers the "child" wrote stored in a text chunk. The fixture adapter reads that chunk instead of
 * calling a model, so tests need no recorded file per paper and no model.
 */

export type FixtureAnswer = { answerText: string; confident?: boolean; hasWorking?: boolean };

export type FixturePage = {
  /** The page number "printed in the footer". Leave out for a page whose footer cannot be read. */
  page?: number;
  /** Answers by printed question number. */
  answers?: Record<string, FixtureAnswer>;
  /** What the child wrote for every question not listed above, by kind of answer. Blank when absent. */
  defaults?: Partial<Record<"mcq" | "number" | "fraction" | "text", string>>;
};

const KEYWORD = "paperkaki-fixture";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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

export type FixturePageOptions = {
  width?: number;
  height?: number;
  /** A flat grey page: the sharpness check calls it blurry. */
  blurry?: boolean;
};

/** A deterministic, contrasty page image (portrait by default) carrying the fixture in a text chunk. */
export function encodeFixturePage(fixture: FixturePage, options: FixturePageOptions = {}): Uint8Array {
  const width = options.width ?? 360;
  const height = options.height ?? 510;
  const rows = Buffer.alloc((width + 1) * height);
  let seed = ((fixture.page ?? 0) + 1) * 2654435761;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let y = 0; y < height; y += 1) {
    const base = y * (width + 1);
    rows[base] = 0;
    const rule = y % 22 < 2;
    for (let x = 0; x < width; x += 1) {
      if (options.blurry) {
        rows[base + 1 + x] = 200;
        continue;
      }
      const block = ((x >> 3) + (y >> 3) * 7 + (next() & 3)) % 5 === 0;
      rows[base + 1 + x] = rule ? 40 : block ? 60 : 235;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // grayscale
  const text = Buffer.concat([Buffer.from(`${KEYWORD}\0`, "latin1"), Buffer.from(JSON.stringify(fixture), "latin1")]);
  return new Uint8Array(
    Buffer.concat([PNG_SIGNATURE, chunk("IHDR", header), chunk("tEXt", text), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]),
  );
}

/** The fixture stored in a page image, or null for any other image. */
export function readFixturePage(bytes: Uint8Array): FixturePage | null {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "tEXt") {
      const data = buffer.subarray(offset + 8, offset + 8 + length);
      const split = data.indexOf(0);
      if (split > 0 && data.toString("latin1", 0, split) === KEYWORD) {
        try {
          const parsed: unknown = JSON.parse(data.toString("latin1", split + 1));
          return typeof parsed === "object" && parsed !== null ? (parsed as FixturePage) : null;
        } catch {
          return null;
        }
      }
    }
    if (type === "IDAT" || type === "IEND") break;
    offset += 12 + length;
  }
  return null;
}
