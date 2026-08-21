import { describe, expect, it } from "vitest";
import { annotateSongSections, cleanImportedText, googleDocumentId } from "../lib/text-import";

describe("import textů", () => {
  it("vyčistí HTML do čitelného textu", () => {
    expect(cleanImportedText("<p>První řádek</p><p>Druhý řádek</p>", "text.html")).toBe("První řádek\nDruhý řádek");
  });

  it("získá identifikátor veřejného Google Dokumentu", () => {
    expect(googleDocumentId("https://docs.google.com/document/d/abc_123-xyz/edit")).toBe("abc_123-xyz");
  });

  it("označí běžné sekce písně", () => {
    expect(annotateSongSections("Verse 1\nNoc je tichá\nRefrén:\nSvětla hoří")).toBe("[Sloka 1]\nNoc je tichá\n[Refrén]\nSvětla hoří");
  });
});
