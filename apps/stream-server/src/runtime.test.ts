import { describe, expect, it } from "vitest";
import { normalizeHistoryInterval, normalizeVerificationRequest } from "./runtime.js";

describe("operations runtime input boundaries", () => {
  it("normalizes malformed history intervals to a safe bounded value", () => {
    expect(normalizeHistoryInterval(null)).toBe(100);
    expect(normalizeHistoryInterval("not-a-number")).toBe(100);
    expect(normalizeHistoryInterval("1")).toBe(50);
    expect(normalizeHistoryInterval("100.6")).toBe(101);
    expect(normalizeHistoryInterval("5000")).toBe(1_000);
  });

  it("trims valid verification fields and drops unknown properties", () => {
    expect(normalizeVerificationRequest({
      incidentId: " INC-01 ",
      requestedBy: " 김현수 ",
      assignee: " 이민호 ",
      checks: [" 안전 조건 확인 "],
      unexpected: "ignored",
    })).toEqual({
      incidentId: "INC-01",
      requestedBy: "김현수",
      assignee: "이민호",
      checks: ["안전 조건 확인"],
    });
  });

  it("rejects blank fields and excessive checklist items", () => {
    expect(normalizeVerificationRequest({
      incidentId: " ",
      requestedBy: "김현수",
      assignee: "이민호",
      checks: ["안전 조건 확인"],
    })).toBeNull();

    expect(normalizeVerificationRequest({
      incidentId: "INC-01",
      requestedBy: "김현수",
      assignee: "이민호",
      checks: Array.from({ length: 11 }, (_, index) => `확인 ${index + 1}`),
    })).toBeNull();
  });
});
