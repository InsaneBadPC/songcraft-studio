import { describe, expect, it } from "vitest";
import { cleanImportedText, googleDocumentId } from "../lib/text-import";

describe("import textů", () => {
  it("vyčistí HTML do čitelného textu", () => {
    expect(cleanImportedText("<p>První řádek</p><p>Druhý řádek</p>", "text.html")).toBe("První řádek\nDruhý řádek");
  });

  it("získá identifikátor veřejného Google Dokumentu", () => {
    expect(googleDocumentId("https://docs.google.com/document/d/abc_123-xyz/edit")).toBe("abc_123-xyz");
  });
});
