import { describe, expect, it } from "vitest";

import { findCzechRhymes, normalizeCzechWord } from "../lib/czech-rhymes";

describe("český hledač rýmů", () => {
  it("normalizuje české diakritické znaky", () => {
    expect(normalizeCzechWord("LÁSKA!")).toBe("laska");
  });

  it("najde přesný rým pro běžné slovo", () => {
    expect(findCzechRhymes("noc").map((suggestion) => suggestion.word)).toContain("moc");
  });
});
