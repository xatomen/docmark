const MARKDOWN_EXTENSION = /\.(?:md|markdown)$/i;
const PDF_EXTENSION = /\.pdf$/i;
const INVALID_FILENAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

/** Normalize a document title into one portable PDF download filename. */
export function normalizePdfFilename(title: string): string {
  let base = title.trim().replace(INVALID_FILENAME_CHARACTERS, "-");
  const trimSuffixNoise = (value: string) => value.replace(/[. ]+$/g, "");
  base = trimSuffixNoise(base);

  // Remove suffixes in any repeated combination (for example .pdf.md.pdf).
  // Trimming dots after every removal handles titles such as "Report.pdf.".
  let previous: string;
  do {
    previous = base;
    if (MARKDOWN_EXTENSION.test(base)) base = base.replace(MARKDOWN_EXTENSION, "");
    else if (PDF_EXTENSION.test(base)) base = base.replace(PDF_EXTENSION, "");
    base = trimSuffixNoise(base);
  } while (base !== previous);

  if (WINDOWS_RESERVED_NAME.test(base)) base = `_${base}`;
  return `${base || "Untitled document"}.pdf`;
}
