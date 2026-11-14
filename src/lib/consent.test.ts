import { describe, expect, it } from "vitest";
import { CONSENT_VERSION, hasRequiredConsent, parseConsent } from "./consent";

const ok = { version: CONSENT_VERSION, terms: true, privacy: true, activity: false, age: true };

describe("consent", () => {
  it("needs terms, privacy and age in the current version; activity is optional", () => {
    expect(hasRequiredConsent(parseConsent(ok))).toBe(true);
    expect(hasRequiredConsent(parseConsent({ ...ok, terms: false }))).toBe(false);
    expect(hasRequiredConsent(parseConsent({ ...ok, privacy: false }))).toBe(false);
    expect(hasRequiredConsent(parseConsent({ ...ok, age: false }))).toBe(false);
    expect(hasRequiredConsent(parseConsent({ ...ok, version: "old" }))).toBe(false);
  });
  it("treats missing or malformed consent as none", () => {
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent({ terms: true })).toBeNull();
    expect(hasRequiredConsent(null)).toBe(false);
  });
});
