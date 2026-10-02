export const TOC_DIRECTIVE = ":::toc\n:::";
export const PAGE_BREAK_DIRECTIVE = ":::pagebreak\n:::";

export type BlockDirectiveInsertion = {
  from: number;
  insert: string;
  cursor: number;
};

function lineBreaksAtEnd(value: string): string[] {
  return value.match(/(?:\r\n|\n|\r)+$/g)?.[0].match(/\r\n|\n|\r/g) ?? [];
}

function lineBreaksAtStart(value: string): string[] {
  return value.match(/^(?:(?:\r\n|\n|\r))+/g)?.[0].match(/\r\n|\n|\r/g) ?? [];
}

function lineEndingNear(source: string, position: number): string {
  const before = source.slice(0, position);
  const after = source.slice(position);
  const previous = before.match(/\r\n|\n|\r/g)?.at(-1);
  const next = after.match(/\r\n|\n|\r/)?.[0];
  if (!previous) return next ?? "\n";
  if (!next) return previous;
  const previousDistance = before.length - before.lastIndexOf(previous) - previous.length;
  const nextDistance = after.indexOf(next);
  return previousDistance <= nextDistance ? previous : next;
}

/** Prepare a non-destructive block insertion at the end of the selection. */
export function createBlockDirectiveInsertion(
  source: string,
  selectionFrom: number,
  selectionTo: number,
  directive: string,
): BlockDirectiveInsertion {
  const position = Math.max(0, Math.min(source.length, selectionTo));
  const prefix = source.slice(0, position);
  const suffix = source.slice(position);
  const lineEnding = lineEndingNear(source, position);
  const prefixBreaks = lineBreaksAtEnd(prefix);
  const suffixBreaks = lineBreaksAtStart(suffix);
  const currentLinePrefix = prefix.slice(prefix.search(/[^\r\n]*$/));
  const currentLineSuffix = suffix.slice(0, suffix.search(/[\r\n]/) < 0 ? suffix.length : suffix.search(/[\r\n]/));

  let before = "";
  if (currentLinePrefix.trim()) {
    before = lineEnding.repeat(2);
  } else if (prefix && prefixBreaks.length === 1) {
    before = lineEnding;
  } else if (prefix && prefixBreaks.length === 0) {
    before = lineEnding;
  }

  let after: string;
  if (!suffix) {
    after = prefix ? lineEnding : "";
  } else if (currentLineSuffix.trim()) {
    after = lineEnding.repeat(2);
  } else if (suffixBreaks.length === 1) {
    after = lineEnding;
  } else if (suffixBreaks.length >= 2) {
    after = "";
  } else {
    after = lineEnding;
  }

  const normalizedDirective = directive.replace(/\r\n|\r|\n/g, lineEnding);
  const insert = `${before}${normalizedDirective}${after}`;
  const directiveEnd = before.length + normalizedDirective.length;
  const cursor = after.length ? insert.length : directiveEnd;
  return { from: position, insert, cursor };
}
