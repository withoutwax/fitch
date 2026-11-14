import { describe, expect, it } from "vitest";
import { decodeFields, docId } from "./firestoreRest";

describe("Firestore REST decoding", () => {
  it("decodes scalars, arrays and maps", () => {
    expect(
      decodeFields({
        title: { stringValue: "Weakening" },
        number: { integerValue: "3" },
        ratio: { doubleValue: 0.5 },
        done: { booleanValue: true },
        none: { nullValue: null },
        premises: { arrayValue: { values: [{ stringValue: "P ∧ Q" }] } },
        empty: { arrayValue: {} },
        lines: { arrayValue: { values: [{ mapValue: { fields: { depth: { integerValue: "1" } } } }] } },
      }),
    ).toEqual({ title: "Weakening", number: 3, ratio: 0.5, done: true, none: null, premises: ["P ∧ Q"], empty: [], lines: [{ depth: 1 }] });
  });

  it("takes the id from the document name", () => {
    expect(docId({ name: "projects/x/databases/(default)/documents/problems/weakening" })).toBe("weakening");
  });
});
