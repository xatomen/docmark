import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

export function isPositionInFrontMatter(source: string, position: number): boolean {
  const firstLineEnd = source.indexOf("\n");
  const firstLine = (firstLineEnd < 0 ? source : source.slice(0, firstLineEnd)).replace(/\r$/, "");
  if (firstLine !== "---") return false;

  let lineStart = firstLineEnd < 0 ? source.length : firstLineEnd + 1;
  while (lineStart <= source.length) {
    const lineEnd = source.indexOf("\n", lineStart);
    const end = lineEnd < 0 ? source.length : lineEnd;
    const line = source.slice(lineStart, end).replace(/\r$/, "");
    if (/^---[ \t]*$/.test(line)) {
      const frontMatterEnd = lineEnd < 0 ? source.length : lineEnd + 1;
      return lineEnd < 0 ? position <= frontMatterEnd : position < frontMatterEnd;
    }
    if (lineEnd < 0) return position <= source.length;
    lineStart = lineEnd + 1;
  }
  return position <= source.length;
}

export function isPositionInFencedCode(state: EditorState, position: number): boolean {
  ensureSyntaxTree(state, position, 100);
  let node = syntaxTree(state).resolveInner(position, -1);
  while (node) {
    if (node.name === "FencedCode" || node.name === "CodeBlock") return true;
    const parent = node.parent;
    if (!parent) break;
    node = parent;
  }
  return false;
}

export function isStructuralInsertionBlocked(state: EditorState, position: number): boolean {
  const source = state.doc.toString();
  return isPositionInFrontMatter(source, position) || isPositionInFencedCode(state, position);
}
