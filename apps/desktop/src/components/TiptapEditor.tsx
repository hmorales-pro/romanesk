import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * Document ProseMirror sérialisé (alias du type Tiptap `JSONContent` quand
 * il représente un nœud `doc` racine).
 */
export type TiptapDoc = JSONContent;

/**
 * Valeur acceptable en entrée :
 * - un doc ProseMirror (`{ type: "doc", ... }`) → utilisé tel quel
 * - une string plain text (fiches legacy pré-J8) → wrappée dans un paragraphe
 * - `null` / `undefined` → doc vide
 */
export type TiptapValue = TiptapDoc | string | null | undefined;

interface Props {
  value: TiptapValue;
  onChange: (json: TiptapDoc) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
}

function normalize(value: TiptapValue): JSONContent {
  if (!value) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  if (typeof value === "string") {
    return {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: value.length > 0 ? [{ type: "text", text: value }] : undefined,
        },
      ],
    };
  }
  return value;
}

export function TiptapEditor({
  value,
  onChange,
  placeholder,
  className,
  editable = true,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: placeholder ?? "Commence à écrire…",
      }),
    ],
    content: normalize(value),
    editable,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getJSON());
    },
    // Évite le warning Next/SSR pendant que le bundler garde la trace
    // ; sans effet en environnement Tauri (purement client).
    immediatelyRender: false,
  });

  // Si la prop `value` change depuis l'extérieur (ex. user clique
  // « Annuler » → on rebascule sur la valeur DB d'origine), on met
  // à jour le contenu de l'éditeur sans déclencher onChange.
  useEffect(() => {
    if (!editor) return;
    const next = normalize(value);
    const current = editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      // Sur Tiptap 2.x, la signature est `setContent(content, emitUpdate?: boolean)`
      // (objet d'options seulement à partir de Tiptap 3). On passe `false`
      // pour ne pas re-déclencher `onUpdate` → évite une boucle
      // `value → setContent → onUpdate → onChange → value`.
      editor.commands.setContent(next, false);
    }
  }, [value, editor]);

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background px-3 py-2",
        "focus-within:ring-2 focus-within:ring-ring focus-within:outline-none",
        className,
      )}
    >
      <EditorContent
        editor={editor}
        className="min-h-[160px] text-sm tiptap-content"
      />
    </div>
  );
}
