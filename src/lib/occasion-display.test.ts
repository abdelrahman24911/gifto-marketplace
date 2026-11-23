import { describe, expect, it } from "vitest";

import {
  isSeedPlaceholderImage,
  occasionDisplayName,
} from "@/lib/occasion-display";

const ARABIC_NAMES: Record<string, string> = {
  "names.graduation": "التخرج",
  "names.ramdan-night": "ليالي رمضان",
};

const translate = (key: string) => ARABIC_NAMES[key] ?? key;

describe("occasionDisplayName", () => {
  it("uses localized names while keeping the stored name as a fallback", () => {
    expect(
      occasionDisplayName("graduation", "Graduation", translate),
    ).toBe("التخرج");
    expect(
      occasionDisplayName("ramdan-night", "Ramdan Night", translate),
    ).toBe("ليالي رمضان");
    expect(
      occasionDisplayName("new-moment", "New Moment", translate),
    ).toBe("New Moment");
  });

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

describe("isSeedPlaceholderImage", () => {
  it("recognizes the seeded demo banner path only", () => {
    expect(
      isSeedPlaceholderImage(
        "6e2c1f3f-0000-4000-8000-000000000000/demo-banner.jpg",
      ),
    ).toBe(true);
    expect(isSeedPlaceholderImage("demo-banner.jpg")).toBe(true);
    expect(isSeedPlaceholderImage("vendors/nile/gift-box.webp")).toBe(false);
    expect(isSeedPlaceholderImage(null)).toBe(false);
  });
});
