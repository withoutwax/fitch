import { describe, expect, it } from "vitest";
import { canSeeSolutions, parseRole } from "./roles";

describe("roles", () => {
  it("treats a missing or unknown role as student", () => {
    expect(parseRole(undefined)).toBe("student");
    expect(parseRole("superuser")).toBe("student");
    expect(parseRole("teacher")).toBe("teacher");
    expect(parseRole("admin")).toBe("admin");
  });

  it("lets only teachers and admins see solutions", () => {
    expect(canSeeSolutions("admin")).toBe(true);
    expect(canSeeSolutions("teacher")).toBe(true);
    expect(canSeeSolutions("student")).toBe(false);
    expect(canSeeSolutions(null)).toBe(false);
  });
});
