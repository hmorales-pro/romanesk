import {
  useEditor,
  EditorContent,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  MessageSquare,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from "lucide-react";
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
  /**
   * P7.0 : affiche une toolbar (gras / italique / titres / listes /
   * citation / undo + boutons typographie française et dialogue).
   * Default `false` pour ne pas casser les usages existants (fiches).
   */
  toolbar?: boolean;
  /**
   * P7.0 : active les transforms typographie française (espaces
   * insécables avant `: ; ? !`, `--` → `—`, `...` → `…`, paire `« »`
   * via le bouton dialogue). Default `false`.
   */
  frenchTypography?: boolean;
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

const NBSP = "\u00A0";
// Caractères de ponctuation forte qui prennent un espace insécable AVANT
// en français : deux-points, point-virgule, point d'exclamation, point
// d'interrogation. Tiret cadratin et guillemets gérés par le bouton
// Dialogue de la toolbar.
const PUNCT_NBSP_BEFORE = new Set([":", ";", "?", "!"]);

export function TiptapEditor({
  value,
  onChange,
  placeholder,
  className,
  editable = true,
  toolbar = false,
  frenchTypography = false,
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

  // P7.0 : transforms typographie française. Listener keydown en phase
  // capture sur le DOM de l'éditeur — on intercepte avant ProseMirror.
  useEffect(() => {
    if (!editor || !frenchTypography) return;
    const dom = editor.view.dom;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const { state } = editor;
      const { from, empty } = state.selection;
      if (!empty) return;

      // 1) Ponctuation forte → NBSP avant.
      if (PUNCT_NBSP_BEFORE.has(e.key)) {
        const prev = state.doc.textBetween(Math.max(0, from - 1), from);
        if (prev && prev !== " " && prev !== NBSP && prev !== "\n") {
          e.preventDefault();
          editor
            .chain()
            .focus()
            .insertContentAt(from, NBSP + e.key)
            .run();
        }
        return;
      }

      // 2) `--` → `—`.
      if (e.key === "-") {
        const prev = state.doc.textBetween(Math.max(0, from - 1), from);
        if (prev === "-") {
          e.preventDefault();
          editor
            .chain()
            .focus()
            .deleteRange({ from: from - 1, to: from })
            .insertContentAt(from - 1, "—")
            .run();
        }
        return;
      }

      // 3) `...` → `…`.
      if (e.key === ".") {
        const prev2 = state.doc.textBetween(Math.max(0, from - 2), from);
        if (prev2 === "..") {
          e.preventDefault();
          editor
            .chain()
            .focus()
            .deleteRange({ from: from - 2, to: from })
            .insertContentAt(from - 2, "…")
            .run();
        }
        return;
      }
    };
    // Phase capture : on passe avant ProseMirror.
    dom.addEventListener("keydown", handler, true);
    return () => dom.removeEventListener("keydown", handler, true);
  }, [editor, frenchTypography]);

  // P11.y (hotfix freeze) — le MutationObserver pour teinter les
  // répliques de dialogue (P8.3) a été retiré. Suspect dans le freeze
  // observé au switch de chapitre : le combo MutationObserver +
  // ProseMirror peut entrer en cycle si Tiptap re-render à chaque
  // mutation DOM, et le démontage rapide ne cleanup pas toujours
  // correctement (l'observer peut tirer sur un editor.view détruit).
  // Si on veut récupérer la teinte dialogue plus tard, l'approche
  // canonique est un plugin ProseMirror Decoration qui pose la classe
  // au render sans modifier le DOM directement (zéro cycle possible).

  return (
    <div
      className={cn(
        // P8.2 — wrapper éditeur dans l'idiome papier de la charte :
        // filet 1 px (rule), radius 3 px, fond papier ; focus → bordeaux.
        "rounded-[3px] border border-rule bg-paper",
        "focus-within:border-bordeaux/40 focus-within:outline-none",
        className,
      )}
    >
      {toolbar && editor && (
        <TiptapToolbar editor={editor} frenchTypography={frenchTypography} />
      )}
      <EditorContent
        editor={editor}
        className={cn(
          "tiptap-content min-h-[160px] text-sm",
          toolbar ? "px-7 py-5" : "px-3 py-2",
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar (P7.0)
// ---------------------------------------------------------------------------

interface ToolbarProps {
  editor: Editor;
  frenchTypography: boolean;
}

function TiptapToolbar({ editor, frenchTypography }: ToolbarProps) {
  const insertDialogue = () => {
    // Insère un nouveau paragraphe « — » au début. Si une sélection
    // est active, transforme la sélection en réplique de dialogue.
    // La teinte bordeaux-deep est posée par un MutationObserver à
    // l'extérieur (cf. dialogueClassObserver dans TiptapEditor) qui
    // détecte les <p> commençant par cadratin et leur ajoute .dialogue.
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "paragraph",
          content: [{ type: "text", text: "— " }],
        })
        .run();
    } else {
      const text = editor.state.doc.textBetween(from, to, "\n");
      editor
        .chain()
        .focus()
        .deleteSelection()
        .insertContent({
          type: "paragraph",
          content: [{ type: "text", text: `— ${text}` }],
        })
        .run();
    }
  };

  const insertGuillemets = () => {
    // « ... » avec espaces insécables. Sur sélection : wrappe.
    // Sans sélection : insère « | » et place le curseur entre.
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      editor
        .chain()
        .focus()
        .insertContent("«\u00A0\u00A0»")
        .run();
      const pos = editor.state.selection.from - 2;
      editor.commands.setTextSelection({ from: pos, to: pos });
    } else {
      const text = editor.state.doc.textBetween(from, to, "\n");
      editor
        .chain()
        .focus()
        .deleteSelection()
        .insertContent(`«\u00A0${text}\u00A0»`)
        .run();
    }
  };

  return (
    // P8.2 — toolbar éditoriale (charte § 05 — Démonstration). Mono 11 px,
    // séparateurs en filet vertical 1 px, hover paper, active bordeaux.
    <div className="flex flex-wrap items-center gap-1 border-b border-rule bg-[color-mix(in_oklab,var(--paper-deep)_70%,var(--paper))] px-3 py-2 font-mono text-[11px] tracking-[0.04em] text-ink-soft">
      <ToolbarBtn
        title="Annuler (Cmd/Ctrl-Z)"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Undo2 className="size-3.5" aria-hidden />
      </ToolbarBtn>
      <ToolbarBtn
        title="Refaire (Cmd/Ctrl-Shift-Z)"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <Redo2 className="size-3.5" aria-hidden />
      </ToolbarBtn>
      <ToolbarSep />
      <ToolbarBtn
        title="Gras (Cmd/Ctrl-B)"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-3.5" aria-hidden />
      </ToolbarBtn>
      <ToolbarBtn
        title="Italique (Cmd/Ctrl-I)"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-3.5" aria-hidden />
      </ToolbarBtn>
      <ToolbarBtn
        title="Barré"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="size-3.5" aria-hidden />
      </ToolbarBtn>
      <ToolbarSep />
      <ToolbarBtn
        title="Titre 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
      >
        <Heading1 className="size-3.5" aria-hidden />
      </ToolbarBtn>
      <ToolbarBtn
        title="Titre 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      >
        <Heading2 className="size-3.5" aria-hidden />
      </ToolbarBtn>
      <ToolbarBtn
        title="Titre 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
      >
        <Heading3 className="size-3.5" aria-hidden />
      </ToolbarBtn>
      <ToolbarSep />
      <ToolbarBtn
        title="Liste à puces"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-3.5" aria-hidden />
      </ToolbarBtn>
      <ToolbarBtn
        title="Liste numérotée"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-3.5" aria-hidden />
      </ToolbarBtn>
      <ToolbarBtn
        title="Citation"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-3.5" aria-hidden />
      </ToolbarBtn>
      {frenchTypography && (
        <>
          <ToolbarSep />
          <ToolbarBtn
            title="Guillemets français « ... »"
            onClick={insertGuillemets}
          >
            <span className="text-xs font-semibold">«»</span>
          </ToolbarBtn>
          <ToolbarBtn
            title="Réplique de dialogue (— ...)"
            onClick={insertDialogue}
          >
            <MessageSquare className="size-3.5" aria-hidden />
          </ToolbarBtn>
        </>
      )}
    </div>
  );
}

interface BtnProps {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}

function ToolbarBtn({ title, onClick, disabled, active, children }: BtnProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-[3px] px-2 py-1.5",
        "transition-colors hover:bg-paper hover:text-ink",
        "disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-soft",
        active &&
          "bg-[color-mix(in_oklab,var(--bordeaux)_12%,transparent)] text-bordeaux",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarSep() {
  return <span className="mx-1 h-4 w-px bg-rule" aria-hidden />;
}
