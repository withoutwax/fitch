import { describe, expect, it } from "vitest";
import { CONSENT_VERSION, hasRequiredConsent, parseConsent } from "./consent";

const ok = { version: CONSENT_VERSION, terms: true, privacy: true, activity: true, age: true };

describe("consent", () => {
  it("needs terms, privacy, age and activity in the current version", () => {
    expect(hasRequiredConsent(parseConsent(ok))).toBe(true);
    expect(hasRequiredConsent(parseConsent({ ...ok, terms: false }))).toBe(false);
    expect(hasRequiredConsent(parseConsent({ ...ok, privacy: false }))).toBe(false);
    expect(hasRequiredConsent(parseConsent({ ...ok, age: false }))).toBe(false);
    expect(hasRequiredConsent(parseConsent({ ...ok, activity: false }))).toBe(false);
    expect(hasRequiredConsent(parseConsent({ ...ok, version: "old" }))).toBe(false);
  });
  it("treats missing or malformed consent as none", () => {
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent({ terms: true })).toBeNull();
    expect(hasRequiredConsent(null)).toBe(false);
  });
});
