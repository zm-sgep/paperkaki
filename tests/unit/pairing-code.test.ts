import { describe, expect, it } from "vitest";
import {
  PAIRING_CODE_TTL_MINUTES,
  PAIRING_MAX_WRONG_TRIES,
  formatPairingCode,
  normalisePairingCode,
  pairingCodeExpiry,
  pairingCodeState,
} from "@/domain/attempts";

const now = new Date("2026-09-30T02:00:00Z");
const fresh = { expiresAt: pairingCodeExpiry(now), usedAt: null, wrongTries: 0 };

describe("pairing code rules", () => {
  it("lives for ten minutes", () => {
    expect(PAIRING_CODE_TTL_MINUTES).toBe(10);
    expect(pairingCodeExpiry(now).toISOString()).toBe("2026-09-30T02:10:00.000Z");
    expect(pairingCodeState(fresh, new Date("2026-09-30T02:09:59Z"))).toBe("live");
    expect(pairingCodeState(fresh, new Date("2026-09-30T02:10:00Z"))).toBe("expired");
  });

  it("works once", () => {
    expect(pairingCodeState({ ...fresh, usedAt: now }, now)).toBe("used");
    // Used wins over expired: a spent code is spent.
    expect(pairingCodeState({ ...fresh, usedAt: now }, new Date("2026-09-30T05:00:00Z"))).toBe("used");
  });

  it("locks on the fifth wrong try", () => {
    expect(PAIRING_MAX_WRONG_TRIES).toBe(5);
    expect(pairingCodeState({ ...fresh, wrongTries: 4 }, now)).toBe("live");
    expect(pairingCodeState({ ...fresh, wrongTries: 5 }, now)).toBe("locked");
  });

  it("reads what a child types: six digits, spaces and dashes ignored", () => {
    expect(normalisePairingCode("123456")).toBe("123456");
    expect(normalisePairingCode(" 123 456 ")).toBe("123456");
    expect(normalisePairingCode("123-456")).toBe("123456");
    expect(normalisePairingCode("12345")).toBeNull();
    expect(normalisePairingCode("1234567")).toBeNull();
    expect(normalisePairingCode("12a456")).toBeNull();
    expect(normalisePairingCode("")).toBeNull();
    expect(formatPairingCode("012345")).toBe("012 345");
  });
});
