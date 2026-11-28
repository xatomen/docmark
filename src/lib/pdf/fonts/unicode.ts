/** Segment renderer text without normalizing or changing the source. */
export function segmentGraphemes(value: string): string[] {
  if (!value) return [];
  if (typeof Intl.Segmenter !== "function") {
    throw new Error("Native PDF Unicode fallback requires Intl.Segmenter with grapheme support");
  }
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return [...segmenter.segment(value)].map(({ segment }) => segment);
}

export function codePoints(value: string): number[] {
  return Array.from(value, (character) => character.codePointAt(0)!);
}

export function formatCodePoint(value: number): string {
  return `U+${value.toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * The current PDF renderer has no bidi engine. Treat strong RTL script
 * characters and explicit bidi controls as unqualified, even when a cmap
 * contains the individual glyphs.
 */
export function requiresUnqualifiedDirection(value: string): boolean {
  return codePoints(value).some((point) =>
    (point >= 0x0590 && point <= 0x08FF) || // Hebrew, Arabic, Syriac, Thaana, N'Ko and related blocks
    (point >= 0xFB1D && point <= 0xFDFF) ||
    (point >= 0xFE70 && point <= 0xFEFF) ||
    point === 0x061C || // Arabic Letter Mark
    point === 0x200E || point === 0x200F || // LRM/RLM
    (point >= 0x202A && point <= 0x202E) || // embedding/override controls
    (point >= 0x2066 && point <= 0x2069) // isolate controls
  );
}

/** PUA mappings are font-specific and must not be borrowed from another family. */
export function containsPrivateUseCodePoint(value: string): boolean {
  return codePoints(value).some((point) =>
    (point >= 0xE000 && point <= 0xF8FF)
    || (point >= 0xF0000 && point <= 0xFFFFD)
    || (point >= 0x100000 && point <= 0x10FFFD));
}
