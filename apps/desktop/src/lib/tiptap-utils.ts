/**
 * Helpers purs pour manipuler les docs Tiptap/ProseMirror.
 *
 * Factorisé en P5.6 quand un 4e usage est apparu (atelier description) —
 * on respecte la règle de 3.
 */

import type { TiptapDoc } from "@/components/TiptapEditor";

/** Crée un doc Tiptap dont le content = exactement les paragraphes donnés. */
export function paragraphsToDoc(paragraphs: string[]): TiptapDoc {
  return {
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
}

/**
 * Renvoie un nouveau doc Tiptap = le doc actuel + les paragraphes donnés
 * concaténés à la fin. Robuste aux docs vides ou mal formés.
 */
export function appendParagraphsToDoc(
  doc: TiptapDoc | null | undefined,
  paragraphs: string[],
): TiptapDoc {
  const safe: TiptapDoc =
    doc && typeof doc === "object" && (doc as TiptapDoc).type === "doc"
      ? doc
      : { type: "doc", content: [] };
  const existing = Array.isArray(safe.content) ? safe.content : [];
  const newNodes = paragraphs.map((text) => ({
    type: "paragraph",
    content: [{ type: "text", text }],
  }));
  return { ...safe, type: "doc", content: [...existing, ...newNodes] };
}

/**
 * Extrait tout le texte d'un doc Tiptap récursivement (helpers `text`
 * dans les leaves). Sépare les blocs (paragraph, heading, blockquote,
 * listItem) par double-newline pour préserver les paragraphes.
 */
export function collectTextFromDoc(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const obj = node as Record<string, unknown>;
  let out = "";
  if (typeof obj.text === "string") out += obj.text;
  if (Array.isArray(obj.content)) {
    const isBlockNode =
      typeof obj.type === "string" &&
      ["paragraph", "heading", "blockquote", "listItem"].includes(obj.type);
    for (const child of obj.content) {
      out += collectTextFromDoc(child);
    }
    if (isBlockNode) out += "\n\n";
  }
  return out;
}
