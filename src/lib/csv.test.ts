import { describe, expect, it } from "vitest";

import { csvCell, egpDecimal, toCsv } from "./csv";

describe("csvCell", () => {
  it("leaves plain values untouched", () => {
    expect(csvCell("GFT-123")).toBe("GFT-123");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes values containing a comma", () => {
    expect(csvCell("Cairo, Egypt")).toBe('"Cairo, Egypt"');
  });

  it("doubles embedded quotes and wraps the value", () => {
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
  });

  it("quotes values containing a newline", () => {
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });
});

describe("toCsv", () => {
  it("joins headers and rows with CRLF and a trailing newline", () => {
    expect(
      toCsv(
        ["Order", "Commission"],
        [["GFT-1", "10.00"]],
      ),
    ).toBe("Order,Commission\r\nGFT-1,10.00\r\n");
  });

  it("returns just the header line when there are no rows", () => {
    expect(toCsv(["Order"], [])).toBe("Order\r\n");
  });
});

describe("egpDecimal", () => {
  it("formats minor units as decimal EGP", () => {
    expect(egpDecimal(12345)).toBe("123.45");
    expect(egpDecimal(0)).toBe("0.00");
    expect(egpDecimal(-500)).toBe("-5.00");
    expect(egpDecimal(100)).toBe("1.00");
  });
});
