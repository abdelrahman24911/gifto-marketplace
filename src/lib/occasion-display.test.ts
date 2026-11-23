import { describe, expect, it } from "vitest";

import {
  isSeedPlaceholderImage,
  occasionDisplayName,
} from "@/lib/occasion-display";

const ARABIC_NAMES: Record<string, string> = {
  "names.graduation": "التخرج",
  "names.ramadan-night": "ليالي رمضان",
  "names.ramdan-night": "ليالي رمضان",
};

const translate = (key: string) => ARABIC_NAMES[key] ?? key;

describe("occasionDisplayName", () => {
  it("uses localized names while keeping the stored name as a fallback", () => {
    expect(
      occasionDisplayName("graduation", "Graduation", translate),
    ).toBe("التخرج");
    expect(
      occasionDisplayName("ramadan-night", "Ramadan Night", translate),
    ).toBe("ليالي رمضان");
    expect(
      occasionDisplayName("new-moment", "New Moment", translate),
    ).toBe("New Moment");
  });

  it("corrects the Ramadan slug without changing other names", () => {
    expect(occasionDisplayName("ramadan-night", "Ramadan Night")).toBe(
      "Ramadan Night",
    );
    expect(occasionDisplayName("graduation", "Graduation")).toBe(
      "Graduation",
    );
  });

  it("still resolves the old Ramadan slug as an alias", () => {
    expect(occasionDisplayName("ramdan-night", "Ramdan Night")).toBe(
      "Ramadan Night",
    );
    expect(
      occasionDisplayName("ramdan-night", "Ramdan Night", translate),
    ).toBe("ليالي رمضان");
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
