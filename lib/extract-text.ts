export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Reads .txt, .md and .docx and text-based .pdf uploads. Scanned PDFs have no text layer and are rejected. */
export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (name.endsWith(".pdf")) {
    // import the lib file directly: pdf-parse's index runs a debug routine when it has no parent module
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    return (await pdfParse(buf)).text;
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer: buf })).value;
  }
  if (name.endsWith(".txt") || name.endsWith(".md")) return buf.toString("utf8");
  throw new Error("Unsupported file type. Upload .txt, .md, .docx or .pdf");
}
