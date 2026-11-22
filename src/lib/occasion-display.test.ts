import { describe, expect, it } from "vitest";

import { occasionDisplayName } from "@/lib/occasion-display";

describe("occasionDisplayName", () => {
  it("corrects the live Ramadan slug without changing other names", () => {
    expect(occasionDisplayName("ramdan-night", "Ramdan Night")).toBe(
      "Ramadan Night",
    );
    expect(occasionDisplayName("graduation", "Graduation")).toBe(
      "Graduation",
    );
  });

  it("keeps the stored name when there is no known correction", () => {
    expect(occasionDisplayName("new-moment", "New Moment")).toBe("New Moment");
  });
});
