import { describe, expect, it } from "vitest";

import { maskEmail, maskName, maskPhone } from "./mask-contact";

describe("maskName", () => {
  it("keeps the first name and the last initial", () => {
    expect(maskName("Abdelrahman Osama")).toBe("Abdelrahman O.");
    expect(maskName("Mona Ahmed Ali")).toBe("Mona A.");
  });

  it("reduces a single name to its initial", () => {
    expect(maskName("Mona")).toBe("M…");
    expect(maskName("")).toBe("—");
    expect(maskName("   ")).toBe("—");
  });
});

describe("maskPhone", () => {
  it("keeps only the last two digits", () => {
    expect(maskPhone("01012345678")).toBe("•••••••••78");
    expect(maskPhone("+20 100 234 5678")).toBe("••••••••••78");
  });

  it("handles short or empty values", () => {
    expect(maskPhone("12")).toBe("••");
    expect(maskPhone("")).toBe("—");
  });
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("abdelrahman@example.com")).toBe("a•••@example.com");
  });

  it("handles missing or malformed values", () => {
    expect(maskEmail("not-an-email")).toBe("•••");
    expect(maskEmail("@example.com")).toBe("•••");
    expect(maskEmail("a@")).toBe("•••");
  });
});
