import { describe, expect, it } from "vitest";

import { defineLivdCatalog, type LivdEntry } from "../../src/index.js";

/**
 * The exact shape of what a LIVD catalog hands back: a key the catalog was not given is absent,
 * never present and `undefined`, so a caller that reads `in` or `Object.keys` sees only what was
 * declared. And a vendor code with several LOINCs answers with every row's attributes as soon as
 * any one row carries any one of the three. Every code below is synthetic.
 */

describe("the identity a catalog's warning names", () => {
  it.each([
    [{ publisher: "Synthetic Diagnostics" }, ["declared", "publisher"]],
    [{ publicationVersion: "v9" }, ["declared", "publicationVersion"]],
    [
      { publisher: "Synthetic Diagnostics", publicationVersion: "v9" },
      ["declared", "publisher", "publicationVersion"],
    ],
  ])("holds only what %j declared", (publication, keys) => {
    const catalog = defineLivdCatalog([{ vendorCode: "SYN1", loinc: "0000-0" }], publication);
    const warning = catalog.warnings?.[0];
    expect(warning?.code).toBe("ASTM_LIVD_CATALOG_NO_LOINC_VERSION");
    expect(Object.keys(warning?.catalog ?? {})).toEqual(keys);
  });
});

describe("a catalog defined with no publication", () => {
  it("has no publication key at all", () => {
    const catalog = defineLivdCatalog([{ vendorCode: "SYN1", loinc: "0000-0" }]);
    expect(Object.hasOwn(catalog, "publication")).toBe(false);
  });
});

describe("a vendor code with two LOINCs", () => {
  const rowA: LivdEntry = { vendorCode: "SYN2", loinc: "0000-1" };
  const rowB: LivdEntry = { vendorCode: "SYN2", loinc: "0000-2" };

  it.each([
    ["a specimen description", { vendorSpecimenDescription: "synthetic serum" }],
    ["a result description", { vendorResultDescription: "synthetic analyte" }],
    ["a representative unit", { representativeUnit: "U/L" }],
  ])("lists every row's attributes when only one row carries %s", (_label, attribute) => {
    const catalog = defineLivdCatalog([{ ...rowA, ...attribute }, rowB]);
    const answer = catalog.lookup("SYN2");
    expect(answer).toStrictEqual({
      status: "ambiguous",
      candidates: ["0000-1", "0000-2"],
      candidateDetails: [
        { loinc: "0000-1", ...attribute, unitQualified: "representativeUnit" in attribute },
        { loinc: "0000-2", unitQualified: false },
      ],
      reason: "no-reported-units",
    });
  });

  it("lists each candidate with only the attributes its row carries", () => {
    const catalog = defineLivdCatalog([
      {
        ...rowA,
        loincLongName: "Synthetic analyte A",
        vendorSpecimenDescription: "synthetic serum",
        vendorResultDescription: "synthetic analyte A",
        representativeUnit: "U/L",
      },
      { ...rowB, representativeUnit: "mg/dL" },
    ]);
    const answer = catalog.lookup("SYN2");
    if (answer.status !== "ambiguous") return expect.unreachable("expected an ambiguous answer");
    expect(answer.candidateDetails?.map((c) => Object.keys(c))).toEqual([
      [
        "loinc",
        "loincLongName",
        "vendorSpecimenDescription",
        "vendorResultDescription",
        "representativeUnit",
        "unitQualified",
      ],
      ["loinc", "representativeUnit", "unitQualified"],
    ]);
  });

  it("answers with no details when neither row carries an attribute", () => {
    expect(defineLivdCatalog([rowA, rowB]).lookup("SYN2")).toStrictEqual({
      status: "ambiguous",
      candidates: ["0000-1", "0000-2"],
    });
  });
});
