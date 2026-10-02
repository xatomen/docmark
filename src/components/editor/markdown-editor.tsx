"use client";

import { useEffect, useRef, useState } from "react";
import { history, historyKeymap, indentWithTab, isolateHistory } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { tags } from "@lezer/highlight";
import {
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { createBlockDirectiveInsertion, PAGE_BREAK_DIRECTIVE, TOC_DIRECTIVE } from "@/lib/editor/block-directive";
import { isStructuralInsertionBlocked } from "@/lib/editor/editor-context";

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      color: "var(--foreground)",
      backgroundColor: "var(--background)",
      fontSize: "0.875rem",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: '"Cascadia Code", Consolas, monospace',
      lineHeight: "1.75rem",
    },
    ".cm-content": {
      padding: "1.25rem",
      caretColor: "var(--accent)",
    },
    ".cm-line": {
      padding: "0",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--accent)",
    },
    "&.cm-focused": {
      outline: "2px solid var(--accent)",
      outlineOffset: "-2px",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent)",
    },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in srgb, var(--subtle) 70%, transparent)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--subtle)",
      borderRight: "1px solid var(--border)",
    },
    ".cm-lineNumbers": {
      color: "var(--muted)",
      minWidth: "2.75rem",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 0.65rem 0 0.4rem",
      textAlign: "right",
      color: "var(--muted)",
    },
    ".cm-placeholder": {
      color: "var(--muted)",
    },
  },
  { dark: false },
);

const docmarkHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "var(--accent)", fontWeight: "700" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--accent)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--muted)" },
  { tag: tags.monospace, color: "var(--accent)" },
  { tag: tags.quote, color: "var(--muted)", fontStyle: "italic" },
  { tag: tags.meta, color: "var(--muted)" },
]);

export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [structuralInsertionBlocked, setStructuralInsertionBlocked] = useState(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => () => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
  }, []);

  async function copyMarkdown() {
    try {
      const source = viewRef.current?.state.doc.toString() ?? value;
      await navigator.clipboard.writeText(source);
      setCopyFeedback("Copied Markdown");
    } catch {
      setCopyFeedback("Copy failed. Clipboard access is unavailable.");
    }
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setCopyFeedback(""), 2400);
  }

  function insertDirective(directive: string) {
    const view = viewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    if (isStructuralInsertionBlocked(view.state, selection.to)) return;
    const source = view.state.doc.toString();
    const insertion = createBlockDirectiveInsertion(source, selection.from, selection.to, directive);
    view.dispatch({
      changes: { from: insertion.from, insert: insertion.insert },
      selection: EditorSelection.cursor(insertion.from + insertion.cursor),
      scrollIntoView: true,
      annotations: isolateHistory.of("full"),
    });
    view.focus();
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        markdown(),
        lineNumbers(),
        syntaxHighlighting(docmarkHighlightStyle),
        history(),
        keymap.of([...historyKeymap, indentWithTab]),
        indentUnit.of("  "),
        EditorState.tabSize.of(2),
        placeholder("Start writing Markdown..."),
        EditorView.lineWrapping,
        editorTheme,
        EditorView.contentAttributes.of({
          "aria-label": "Markdown source editor",
          "aria-describedby": "editor-hint",
          spellcheck: "false",
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
          if (update.docChanged || update.selectionSet) {
            const position = update.state.selection.main.to;
            const blocked = isStructuralInsertionBlocked(update.state, position);
            setStructuralInsertionBlocked((current) => current === blocked ? current : blocked);
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    setStructuralInsertionBlocked(isStructuralInsertionBlocked(state, state.selection.main.to));

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // EditorView is intentionally created once per mount; external value changes
    // are synchronized through transactions in the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (value !== currentValue) {
      view.dispatch({
        changes: { from: 0, to: currentValue.length, insert: value },
      });
    }
  }, [value]);

  const buttonClassName = "rounded border border-border px-2.5 py-1.5 text-xs text-foreground enabled:hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="editor-toolbar flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void copyMarkdown()} className={buttonClassName} title="Copy the current Markdown source">
            Copy Markdown
          </button>
          <button type="button" aria-label="Insert table of contents" onClick={() => insertDirective(TOC_DIRECTIVE)} disabled={structuralInsertionBlocked} className={buttonClassName} title="Insert a table of contents directive at the cursor">
            Insert TOC
          </button>
          <button type="button" aria-label="Insert page break" onClick={() => insertDirective(PAGE_BREAK_DIRECTIVE)} disabled={structuralInsertionBlocked} className={buttonClassName} title="Insert a page break directive at the cursor">
            Page Break
          </button>
        </div>
        <span role="status" aria-live="polite" className="min-h-4 text-xs text-muted">
          {copyFeedback || (structuralInsertionBlocked ? "Block actions are unavailable in code or Front Matter." : "")}
        </span>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden" />
    </div>
  );
}
