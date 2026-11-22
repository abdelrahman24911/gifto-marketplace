import { describe, expect, it } from "vitest";

import { extractRecoveryToken } from "./recovery-token";

describe("extractRecoveryToken", () => {
  const code = "a".repeat(64);
  const link = `https://gifto.example/orders/recover/confirm?order=11111111-1111-1111-1111-111111111111#token=${code}`;

  it("returns a raw code unchanged", () => {
    expect(extractRecoveryToken(code)).toBe(code);
    expect(extractRecoveryToken(`  ${code}  `)).toBe(code);
  });

  it("extracts the code from a full recovery link (fragment or query)", () => {
    expect(extractRecoveryToken(link)).toBe(code);
    expect(
      extractRecoveryToken(
        `https://gifto.example/orders/recover/confirm?order=11111111-1111-1111-1111-111111111111&token=${code}`,
      ),
    ).toBe(code);
  });

  it("returns anything else trimmed, so validation still rejects it", () => {
    expect(extractRecoveryToken("not-a-code")).toBe("not-a-code");
    expect(extractRecoveryToken("")).toBe("");
  });
});
