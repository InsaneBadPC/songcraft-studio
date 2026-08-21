export function cleanImportedText(content: string, fileName = "") {
  const isHtml = /\.html?$/i.test(fileName) || /<\/?(?:p|div|br|h\d|li|body|html)[\s>]/i.test(content);
  const plain = isHtml
    ? content
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|div|h[1-6]|li)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
    : content;
  return plain.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const SECTION_NAMES: Record<string, string> = {
  verse: "Sloka", sloka: "Sloka", chorus: "Refrén", refrain: "Refrén", refrén: "Refrén", refren: "Refrén",
  bridge: "Bridge", intro: "Intro", outro: "Outro", "pre-chorus": "Pre-refrén", prerefrén: "Pre-refrén", "pre-refrén": "Pre-refrén",
  interlude: "Mezihra", mezihra: "Mezihra", hook: "Hook",
};

export function annotateSongSections(content: string) {
  return content.split("\n").map((line) => {
    const trimmed = line.trim();
    const match = trimmed.match(/^\[?\s*(verse|sloka|chorus|refrain|refr[ée]n|bridge|intro|outro|pre-chorus|pre-refr[ée]n|interlude|mezihra|hook)\s*(\d+)?\s*\]?[:\-]?\s*$/i);
    if (!match) return line;
    const key = match[1].toLocaleLowerCase("cs-CZ");
    const label = SECTION_NAMES[key] ?? match[1];
    return `[${label}${match[2] ? ` ${match[2]}` : ""}]`;
  }).join("\n");
}

export function splitImportedSongContent(content: string) {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length < 2) {
    return { stylePrompt: null, lyrics: annotateSongSections(content) };
  }

  const first = paragraphs.shift() ?? "";
  const stylePrompt = first.replace(/^(?:styl(?:ový)?\s*prompt|style\s*prompt|styl)\s*[:\-]\s*/i, "").trim();
  return { stylePrompt: stylePrompt || null, lyrics: annotateSongSections(paragraphs.join("\n\n")) };
}

export function googleDocumentId(url: string) {
  const match = url.trim().match(/^https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}
