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

export function googleDocumentId(url: string) {
  const match = url.trim().match(/^https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}
