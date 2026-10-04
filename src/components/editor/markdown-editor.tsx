"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Dropdown, Label, Popover, Tooltip } from "@heroui/react";
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
import { Bold, Code, Copy, Heading as HeadingIcon, Italic, Link as LinkIcon, List, ListOrdered, Minus, Plus, Table } from "lucide-react";
import { createBlockDirectiveInsertion, PAGE_BREAK_DIRECTIVE, TOC_DIRECTIVE } from "@/lib/editor/block-directive";
import { isStructuralInsertionBlocked } from "@/lib/editor/editor-context";
import {
  createHeadingChange,
  createLinkChange,
  createListChange,
  createTableInsertionChange,
  createWrappedFormattingChange,
  type MarkdownEditorChange,
} from "@/lib/editor/markdown-editor-actions";

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

function ToolbarIconButton({
  label,
  onPress,
  children,
  isDisabled = false,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  isDisabled?: boolean;
}) {
  return (
    <Tooltip>
      <Button
        type="button"
        aria-label={label}
        isIconOnly
        isDisabled={isDisabled}
        size="sm"
        variant="ghost"
        className="size-8 min-w-8 p-0"
        onPress={onPress}
      >
        {children}
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}

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
  const [tablePopoverOpen, setTablePopoverOpen] = useState(false);
  const [tableColumns, setTableColumns] = useState(3);
  const [tableRows, setTableRows] = useState(2);
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

  function applyEditorChange(change: MarkdownEditorChange, restoreFocusAfterOverlayClose = false) {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: change.from, to: change.to, insert: change.insert },
      selection: EditorSelection.range(change.selection.anchor, change.selection.head),
      scrollIntoView: true,
      annotations: isolateHistory.of("full"),
    });
    view.focus();
    if (restoreFocusAfterOverlayClose) requestAnimationFrame(() => view.focus());
  }

  function formatSelection(prefix: string, suffix = prefix) {
    const view = viewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    applyEditorChange(createWrappedFormattingChange(view.state.doc.toString(), selection.from, selection.to, prefix, suffix));
  }

  function insertHeading(level: 1 | 2 | 3) {
    const view = viewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    applyEditorChange(createHeadingChange(view.state.doc.toString(), selection.from, selection.to, level), true);
  }

  function insertList(type: "bullet" | "numbered") {
    const view = viewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    applyEditorChange(createListChange(view.state.doc.toString(), selection.from, selection.to, type));
  }

  function insertTable() {
    const view = viewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    const change = createTableInsertionChange(view.state.doc.toString(), selection.from, selection.to, tableColumns, tableRows);
    setTablePopoverOpen(false);
    applyEditorChange(change, true);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="editor-toolbar flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-border px-3 py-2 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <div role="group" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
            <ToolbarIconButton label="Bold" onPress={() => formatSelection("**")}><Bold aria-hidden="true" className="size-4" /></ToolbarIconButton>
            <ToolbarIconButton label="Italic" onPress={() => formatSelection("*")}><Italic aria-hidden="true" className="size-4" /></ToolbarIconButton>
            <Tooltip>
              <Dropdown>
                <Button type="button" aria-label="Heading" isIconOnly size="sm" variant="ghost" className="size-8 min-w-8 p-0">
                  <HeadingIcon aria-hidden="true" className="size-4" />
                </Button>
                <Dropdown.Popover className="w-40 rounded-[var(--docmark-radius-overlay)] border border-border bg-overlay text-foreground shadow-[var(--overlay-shadow)]">
                  <Dropdown.Menu onAction={(key) => insertHeading(Number(key) as 1 | 2 | 3)}>
                    <Dropdown.Item id="1" textValue="Heading 1"><Label>Heading 1</Label></Dropdown.Item>
                    <Dropdown.Item id="2" textValue="Heading 2"><Label>Heading 2</Label></Dropdown.Item>
                    <Dropdown.Item id="3" textValue="Heading 3"><Label>Heading 3</Label></Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
              <Tooltip.Content>Heading</Tooltip.Content>
            </Tooltip>
            <ToolbarIconButton label="Link" onPress={() => {
              const view = viewRef.current;
              if (!view) return;
              const selection = view.state.selection.main;
              applyEditorChange(createLinkChange(view.state.doc.toString(), selection.from, selection.to));
            }}><LinkIcon aria-hidden="true" className="size-4" /></ToolbarIconButton>
            <ToolbarIconButton label="Inline code" onPress={() => formatSelection("`")}><Code aria-hidden="true" className="size-4" /></ToolbarIconButton>
            <ToolbarIconButton label="Bulleted list" onPress={() => insertList("bullet")}><List aria-hidden="true" className="size-4" /></ToolbarIconButton>
            <ToolbarIconButton label="Numbered list" onPress={() => insertList("numbered")}><ListOrdered aria-hidden="true" className="size-4" /></ToolbarIconButton>
            <Tooltip>
              <Popover isOpen={tablePopoverOpen} onOpenChange={setTablePopoverOpen}>
                <Button type="button" aria-label="Insert table" isIconOnly size="sm" variant="ghost" className="size-8 min-w-8 p-0">
                  <Table aria-hidden="true" className="size-4" />
                </Button>
                <Popover.Content className="w-[min(18rem,calc(100vw-2rem))] rounded-[var(--docmark-radius-overlay)] border border-border bg-overlay text-foreground shadow-[var(--overlay-shadow)]">
                  <Popover.Dialog aria-label="Insert table" className="p-4">
                    <Popover.Heading className="text-sm font-semibold">Insert table</Popover.Heading>
                    <div className="mt-3 grid gap-2">
                      {([
                        { label: "Columns", value: tableColumns, minimum: 1, maximum: 8, setValue: setTableColumns },
                        { label: "Rows", value: tableRows, minimum: 1, maximum: 12, setValue: setTableRows },
                      ] as const).map(({ label, value, minimum, maximum, setValue }) => (
                        <div key={label} role="group" aria-label={label} className="flex items-center justify-between gap-4 text-sm">
                          <span>{label}</span>
                          <div className="flex items-center gap-1">
                            <Button type="button" aria-label={`Decrease ${label.toLowerCase()}`} isIconOnly isDisabled={value <= minimum} size="sm" variant="ghost" className="size-8 min-w-8 p-0" onPress={() => setValue(Math.max(minimum, value - 1))}>
                              <Minus aria-hidden="true" className="size-4" />
                            </Button>
                            <output aria-label={label} className="w-6 text-center tabular-nums">{value}</output>
                            <Button type="button" aria-label={`Increase ${label.toLowerCase()}`} isIconOnly isDisabled={value >= maximum} size="sm" variant="ghost" className="size-8 min-w-8 p-0" onPress={() => setValue(Math.min(maximum, value + 1))}>
                              <Plus aria-hidden="true" className="size-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button type="button" size="sm" variant="primary" className="mt-4 w-full" onPress={insertTable}>Insert</Button>
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>
              <Tooltip.Content>Insert table</Tooltip.Content>
            </Tooltip>
          </div>
          <span aria-hidden="true" className="h-5 border-s border-border" />
          <div role="group" aria-label="Document structure" className="flex flex-wrap items-center gap-1">
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" aria-label="Insert table of contents" isDisabled={structuralInsertionBlocked} onPress={() => insertDirective(TOC_DIRECTIVE)}>TOC</Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" aria-label="Insert page break" isDisabled={structuralInsertionBlocked} onPress={() => insertDirective(PAGE_BREAK_DIRECTIVE)}>Page Break</Button>
          </div>
          <span aria-hidden="true" className="h-5 border-s border-border" />
          <div role="group" aria-label="Utility" className="flex items-center">
            <ToolbarIconButton label="Copy Markdown" onPress={() => void copyMarkdown()}><Copy aria-hidden="true" className="size-4" /></ToolbarIconButton>
          </div>
        </div>
        <span role="status" aria-live="polite" className="min-h-4 text-xs text-muted">
          {copyFeedback || (structuralInsertionBlocked ? "Block actions are unavailable in code or Front Matter." : "")}
        </span>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden" />
    </div>
  );
}
