const MARKDOWN_EXTENSION = /\.(?:md|markdown)$/i;
const PDF_EXTENSION = /\.pdf$/i;
const INVALID_FILENAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

/** Normalize a document title into one portable PDF download filename. */
export function normalizePdfFilename(title: string): string {
  let base = title.trim();
  while (MARKDOWN_EXTENSION.test(base)) base = base.replace(MARKDOWN_EXTENSION, "");
  while (PDF_EXTENSION.test(base)) base = base.replace(PDF_EXTENSION, "");
  base = base
    .replace(INVALID_FILENAME_CHARACTERS, "-")
    .replace(/[. ]+$/g, "");
  if (WINDOWS_RESERVED_NAME.test(base)) base = `_${base}`;
  return `${base || "Untitled document"}.pdf`;
}
