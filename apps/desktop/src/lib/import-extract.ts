/**
 * Extraction du texte d'un fichier importé (P7.4).
 *
 * Formats supportés :
 * - .md / .txt / .markdown : lecture directe via FileReader.
 * - .docx : mammoth.js (lazy import) → texte brut.
 * - .pdf : pdfjs-dist (lazy import) → concat de chaque page.
 *
 * Les libs lourdes (mammoth ~600 KB, pdfjs ~3 MB) sont en dynamic import
 * pour ne pas plomber le bundle initial. Première utilisation = fetch
 * du chunk depuis Vite.
 */

export type SupportedFormat = "text" | "docx" | "pdf";

export function detectFormat(file: File): SupportedFormat | null {
  const name = file.name.toLowerCase();
  if (/\.(md|txt|markdown)$/.test(name) || file.type === "text/plain") {
    return "text";
  }
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  return null;
}

export async function extractText(file: File): Promise<string> {
  const fmt = detectFormat(file);
  if (!fmt) {
    throw new Error(
      `Format non supporté : ${file.name}. Formats acceptés : .md, .txt, .docx, .pdf.`,
    );
  }
  switch (fmt) {
    case "text":
      return file.text();
    case "docx":
      return extractDocx(file);
    case "pdf":
      return extractPdf(file);
  }
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.default.extractRawText({ arrayBuffer });
  return result.value;
}

async function extractPdf(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  // Vite résout le `?url` en URL absolue de l'asset. Le worker tourne
  // dans un thread dédié, indispensable pour les PDFs > quelques pages.
  const workerModule = await import(
    /* @vite-ignore */ "pdfjs-dist/build/pdf.worker.min.mjs?url"
  );
  pdfjsLib.GlobalWorkerOptions.workerSrc = (
    workerModule as { default: string }
  ).default;

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = (content.items as { str?: string }[])
      .map((it) => (typeof it.str === "string" ? it.str : ""))
      .join(" ");
    parts.push(pageText.trim());
  }
  return parts.filter(Boolean).join("\n\n");
}
