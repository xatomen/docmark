export type MarkdownEditorChange = {
  from: number;
  to: number;
  insert: string;
  selection: { anchor: number; head: number };
};

function clampPosition(source: string, position: number): number {
  return Math.max(0, Math.min(source.length, position));
}

export function createWrappedFormattingChange(
  source: string,
  from: number,
  to: number,
  prefix: string,
  suffix: string,
): MarkdownEditorChange {
  const start = clampPosition(source, from);
  const end = Math.max(start, clampPosition(source, to));
  const selected = source.slice(start, end);
  return {
    from: start,
    to: end,
    insert: `${prefix}${selected}${suffix}`,
    selection: selected
      ? { anchor: start + prefix.length, head: start + prefix.length + selected.length }
      : { anchor: start + prefix.length, head: start + prefix.length },
  };
}

export function createLinkChange(source: string, from: number, to: number): MarkdownEditorChange {
  const change = createWrappedFormattingChange(source, from, to, "[", "](url)");
  const urlStart = change.from + 1 + (change.to - change.from) + 2;
  return {
    ...change,
    selection: { anchor: urlStart, head: urlStart + 3 },
  };
}

function lineBounds(source: string, position: number): { start: number; end: number } {
  const start = source.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const newline = source.indexOf("\n", position);
  let end = newline < 0 ? source.length : newline;
  if (end > start && source[end - 1] === "\r") end -= 1;
  return { start, end };
}

function mapPositionAfterPrefixChange(position: number, from: number, to: number, insertLength: number): number {
  if (position <= from) return from + insertLength;
  if (position < to) return from + insertLength;
  return position + insertLength - (to - from);
}

export function createHeadingChange(
  source: string,
  from: number,
  to: number,
  level: 1 | 2 | 3,
): MarkdownEditorChange {
  const start = clampPosition(source, from);
  const end = Math.max(start, clampPosition(source, to));
  const { start: lineStart, end: lineEnd } = lineBounds(source, start);
  const line = source.slice(lineStart, lineEnd);
  const existing = /^( {0,3})(?:#{1,6}[ \t]*)(?=\S|$)/.exec(line);
  const indentation = existing?.[1] ?? (/^( {0,3})/.exec(line)?.[1] ?? "");
  const oldPrefixLength = existing?.[0].length ?? indentation.length;
  const replacement = `${indentation}${"#".repeat(level)} `;
  const changeFrom = lineStart;
  const changeTo = lineStart + oldPrefixLength;
  const nextFrom = mapPositionAfterPrefixChange(start, changeFrom, changeTo, replacement.length);
  const nextTo = mapPositionAfterPrefixChange(end, changeFrom, changeTo, replacement.length);
  return {
    from: changeFrom,
    to: changeTo,
    insert: replacement,
    selection: { anchor: nextFrom, head: nextTo },
  };
}

function lineEndingNear(source: string, position: number): string {
  const before = source.slice(0, position);
  const after = source.slice(position);
  const previous = before.match(/\r\n|\n|\r/g)?.at(-1);
  const next = after.match(/\r\n|\n|\r/)?.[0];
  if (!previous) return next ?? "\n";
  if (!next) return previous;
  return before.length - before.lastIndexOf(previous) - previous.length <= after.indexOf(next) ? previous : next;
}

export function createListChange(
  source: string,
  from: number,
  to: number,
  type: "bullet" | "numbered",
): MarkdownEditorChange {
  const start = clampPosition(source, from);
  const end = Math.max(start, clampPosition(source, to));
  const { start: lineStart } = lineBounds(source, start);
  const { end: lineEnd } = lineBounds(source, end);
  const selected = source.slice(lineStart, lineEnd);
  const pieces = selected.split(/(\r\n|\n|\r)/);
  const lineStarts: number[] = [];
  let offset = 0;
  for (let index = 0; index < pieces.length; index += 2) {
    lineStarts.push(offset);
    offset += pieces[index].length + (pieces[index + 1]?.length ?? 0);
  }

  let item = 0;
  const insert = pieces.map((piece, index) => {
    if (index % 2 === 1) return piece;
    if (!piece && !(selected.length === 0 && index === 0)) return piece;
    const indentation = /^(\s*)/.exec(piece)?.[1] ?? "";
    const rest = piece.slice(indentation.length);
    item += 1;
    const marker = type === "bullet" ? "- " : `${item}. `;
    return `${indentation}${marker}${rest}`;
  }).join("");

  const markerLengths = lineStarts.map((lineStartOffset, index) => {
    const text = pieces[index * 2] ?? "";
    return text || (selected.length === 0 && index === 0)
      ? type === "bullet" ? 2 : `${index + 1}. `.length
      : 0;
  });
  const mapPosition = (position: number) => position + lineStarts.reduce(
    (delta, lineStartOffset, index) => delta + (lineStartOffset <= position ? markerLengths[index] : 0),
    0,
  );

  if (start === end && selected.trim() === "") {
    const markerLength = markerLengths[0];
    return {
      from: lineStart,
      to: lineEnd,
      insert,
      selection: { anchor: lineStart + markerLength, head: lineStart + markerLength },
    };
  }

  return {
    from: lineStart,
    to: lineEnd,
    insert,
    selection: { anchor: mapPosition(start - lineStart), head: mapPosition(end - lineStart) },
  };
}

export function createMarkdownTable(columns: number, rows: number, lineEnding = "\n"): string {
  const safeColumns = Math.max(1, Math.min(8, Math.trunc(columns) || 1));
  const safeRows = Math.max(1, Math.min(12, Math.trunc(rows) || 1));
  const headers = Array.from({ length: safeColumns }, (_, index) => `Column ${index + 1}`);
  const headerRow = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const dataRow = `| ${headers.map(() => "").join(" | ")} |`;
  return [headerRow, separator, ...Array.from({ length: safeRows }, () => dataRow)].join(lineEnding);
}

export function createTableInsertionChange(
  source: string,
  from: number,
  to: number,
  columns: number,
  rows: number,
): MarkdownEditorChange {
  const start = clampPosition(source, from);
  const end = Math.max(start, clampPosition(source, to));
  const lineEnding = lineEndingNear(source, start);
  const prefix = source.slice(0, start);
  const suffix = source.slice(end);
  const prefixBreakCount = prefix.match(/(?:\r\n|\n|\r)+$/)?.[0].match(/\r\n|\n|\r/g)?.length ?? 0;
  const suffixBreakCount = suffix.match(/^(?:(?:\r\n|\n|\r))+/)?.[0].match(/\r\n|\n|\r/g)?.length ?? 0;
  const before = !prefix ? "" : prefixBreakCount >= 2 ? "" : lineEnding.repeat(prefixBreakCount === 1 ? 1 : 2);
  const after = !suffix ? "" : suffixBreakCount >= 2 ? "" : lineEnding.repeat(suffixBreakCount === 1 ? 1 : 2);
  const table = createMarkdownTable(columns, rows, lineEnding);
  const insert = `${before}${table}${after}`;
  const firstHeaderStart = before.length + 2;
  return {
    from: start,
    to: end,
    insert,
    selection: { anchor: start + firstHeaderStart, head: start + firstHeaderStart + "Column 1".length },
  };
}
