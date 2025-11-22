import { describe, it, expect } from "vitest";
import { profileSchema } from "../src/utils/validation";

const baseProfile = {
  firstName: "Ana",
  lastName: "Mora",
  mobileNumber: "+14155551212",
  country: "us",
  city: "Seattle",
  timeZone: "America/Los_Angeles",
  title: "Engineer"
};

describe("profile schema", () => {
  it("normalizes case and trims values", () => {
    const parsed = profileSchema.parse({
      ...baseProfile,
      firstName: "  Ana ",
      country: " united states "
    });
    expect(parsed.firstName).toBe("Ana");
    expect(parsed.country).toBe("US");
  });

  it("rejects invalid mobile numbers", () => {
    expect(() =>
      profileSchema.parse({
        ...baseProfile,
        mobileNumber: "123456"
      })
    ).toThrow();
  });

  it("rejects invalid time zones", () => {
    expect(() =>
      profileSchema.parse({
        ...baseProfile,
        timeZone: "Invalid/Zone"
      })
    ).toThrow();
  });
});
