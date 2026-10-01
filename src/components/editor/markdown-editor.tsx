"use client";

import { useEffect, useRef } from "react";
import { history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { tags } from "@lezer/highlight";
import {
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";

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
      display: "none",
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

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        markdown(),
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
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;

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

  return <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden" />;
}
