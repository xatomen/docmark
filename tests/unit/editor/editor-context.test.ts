import { describe, expect, it } from "vitest";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { isPositionInFencedCode, isPositionInFrontMatter, isStructuralInsertionBlocked } from "@/lib/editor/editor-context";

describe("structural insertion context", () => {
  it("detects Front Matter positions and allows the Markdown body", () => {
    const source = "---\ntitle: Report\ndocmark:\n  version: 1\n---\n# Introduction";
    expect(isPositionInFrontMatter(source, source.indexOf("title"))).toBe(true);
    expect(isPositionInFrontMatter(source, source.indexOf("# Introduction"))).toBe(false);
    expect(isPositionInFrontMatter("# Ordinary Markdown", 3)).toBe(false);
  });

  it("blocks insertion inside parsed fenced code and permits normal Markdown", () => {
    const source = "# Heading\n\n```text\ncode line\n```\n\nparagraph";
    const state = EditorState.create({ doc: source, extensions: markdown() });
    const codePosition = source.indexOf("code line") + 3;
    const paragraphPosition = source.indexOf("paragraph") + 2;
    expect(isPositionInFencedCode(state, codePosition)).toBe(true);
    expect(isStructuralInsertionBlocked(state, codePosition)).toBe(true);
    expect(isStructuralInsertionBlocked(state, paragraphPosition)).toBe(false);
  });

  it("blocks positions in an open Front Matter block", () => {
    const source = "---\ntitle: unfinished";
    expect(isPositionInFrontMatter(source, source.length)).toBe(true);
  });

  it("blocks insertion at a closing delimiter when Front Matter has no trailing newline", () => {
    const source = "---\ntitle: Report\n---";
    expect(isPositionInFrontMatter(source, source.length)).toBe(true);
  });
});
