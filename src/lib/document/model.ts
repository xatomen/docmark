import {
  DEFAULT_DOCUMENT_SETTINGS,
  getMarginValidationError,
  getPageDimensions,
  isPageNumberPosition,
  isDecorationAlignment,
  isDocumentFontFamily,
  isDocumentFontSize,
  isDocumentLineHeight,
  isDocumentTextAlignment,
  isValidPageNumberStartAt,
  MAX_PAGE_MARGIN_MM,
  type DocumentSettings,
  type PageMargins,
  type PageOrientation,
  type PageSize,
} from "@/lib/document/settings";

export const DEFAULT_DOCUMENT_TITLE = "Untitled document";

export type PortableMarkdownStatus =
  | "valid"
  | "invalid-settings"
  | "malformed"
  | "invalid-docmark"
  | "missing-version"
  | "unsupported-version";

export type PortableMarkdownMetadata = {
  /** Exact original front matter block, including delimiters and line endings. */
  rawFrontMatter: string | null;
  includeDocmarkSettings: boolean;
  status: PortableMarkdownStatus;
};

export function createDefaultPortableMarkdownMetadata(): PortableMarkdownMetadata {
  return {
    rawFrontMatter: null,
    includeDocmarkSettings: false,
    status: "valid",
  };
}

export type DocmarkDocument = {
  id: string;
  title: string;
  markdown: string;
  settings: DocumentSettings;
  portableMarkdown: PortableMarkdownMetadata;
  createdAt: string;
  updatedAt: string;
};

export type DocmarkDocumentSummary = Pick<
  DocmarkDocument,
  "id" | "title" | "updatedAt"
>;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createDocumentId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    bytes.forEach((_, index) => {
      bytes[index] = Math.floor(Math.random() * 256);
    });
  }

  const randomPart = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `doc-${Date.now().toString(36)}-${randomPart}`;
}

function copySettings(settings: DocumentSettings): DocumentSettings {
  return {
    pageSize: settings.pageSize,
    orientation: settings.orientation,
    margins: { ...settings.margins },
    pageNumbers: { ...settings.pageNumbers },
    header: { ...settings.header },
    footer: { ...settings.footer },
    typography: { ...settings.typography },
  };
}

function normalizePortableMarkdown(value: unknown): PortableMarkdownMetadata {
  if (!isRecord(value)) return createDefaultPortableMarkdownMetadata();
  const status = value.status;
  const validStatus: PortableMarkdownStatus =
    status === "malformed" ||
    status === "invalid-settings" ||
    status === "invalid-docmark" ||
    status === "missing-version" ||
    status === "unsupported-version"
      ? status
      : "valid";

  return {
    rawFrontMatter: typeof value.rawFrontMatter === "string" ? value.rawFrontMatter : null,
    includeDocmarkSettings: value.includeDocmarkSettings === true,
    status: validStatus,
  };
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeSettings(value: unknown): DocumentSettings {
  const defaults = DEFAULT_DOCUMENT_SETTINGS;
  const source = isRecord(value) ? value : {};
  const pageSize: PageSize = source.pageSize === "letter" ? "letter" : "a4";
  const orientation: PageOrientation =
    source.orientation === "landscape" ? "landscape" : "portrait";
  const rawMargins = isRecord(source.margins) ? source.margins : {};
  const margin = (key: keyof PageMargins) => {
    const candidate = rawMargins[key];
    return typeof candidate === "number" &&
      Number.isFinite(candidate) &&
      candidate >= 0 &&
      candidate <= MAX_PAGE_MARGIN_MM
      ? candidate
      : defaults.margins[key];
  };
  const margins: PageMargins = {
    top: margin("top"),
    right: margin("right"),
    bottom: margin("bottom"),
    left: margin("left"),
  };
  const dimensions = getPageDimensions(pageSize, orientation);

  if (margins.left + margins.right >= dimensions.widthMm) {
    margins.left = defaults.margins.left;
    margins.right = defaults.margins.right;
  }
  if (margins.top + margins.bottom >= dimensions.heightMm) {
    margins.top = defaults.margins.top;
    margins.bottom = defaults.margins.bottom;
  }
  if (getMarginValidationError(margins, dimensions)) {
    return copySettings(defaults);
  }

  const rawPageNumbers = isRecord(source.pageNumbers) ? source.pageNumbers : {};
  const pageNumbers = {
    enabled: typeof rawPageNumbers.enabled === "boolean"
      ? rawPageNumbers.enabled
      : defaults.pageNumbers.enabled,
    position: isPageNumberPosition(rawPageNumbers.position)
      ? rawPageNumbers.position
      : defaults.pageNumbers.position,
    startAt: isValidPageNumberStartAt(rawPageNumbers.startAt)
      ? rawPageNumbers.startAt
      : defaults.pageNumbers.startAt,
  };

  const normalizeDecoration = (key: "header" | "footer") => {
    const raw = isRecord(source[key]) ? source[key] : {};
    const fallback = defaults[key];
    return {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
      text: typeof raw.text === "string" ? raw.text : fallback.text,
      alignment: isDecorationAlignment(raw.alignment) ? raw.alignment : fallback.alignment,
    };
  };
  const rawTypography = isRecord(source.typography) ? source.typography : {};
  const typography = {
    fontFamily: isDocumentFontFamily(rawTypography.fontFamily)
      ? rawTypography.fontFamily
      : defaults.typography.fontFamily,
    fontSize: isDocumentFontSize(rawTypography.fontSize)
      ? rawTypography.fontSize
      : defaults.typography.fontSize,
    lineHeight: isDocumentLineHeight(rawTypography.lineHeight)
      ? rawTypography.lineHeight
      : defaults.typography.lineHeight,
    alignment: isDocumentTextAlignment(rawTypography.alignment)
      ? rawTypography.alignment
      : defaults.typography.alignment,
  };

  return { pageSize, orientation, margins, pageNumbers, header: normalizeDecoration("header"), footer: normalizeDecoration("footer"), typography };
}

/** Build a document on the client; call only after browser initialization. */
export function createDocmarkDocument(
  markdown: string,
  settings: DocumentSettings = DEFAULT_DOCUMENT_SETTINGS,
  title = DEFAULT_DOCUMENT_TITLE,
): DocmarkDocument {
  const timestamp = new Date().toISOString();
  return {
    id: createDocumentId(),
    title,
    markdown,
    settings: copySettings(settings),
    portableMarkdown: createDefaultPortableMarkdownMetadata(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** Duplicate only workspace data; filesystem handles remain runtime-only. */
export function duplicateDocmarkDocument(
  source: Pick<DocmarkDocument, "title" | "markdown" | "settings" | "portableMarkdown">,
): DocmarkDocument {
  const duplicate = createDocmarkDocument(
    source.markdown,
    source.settings,
    `${source.title} copy`,
  );
  duplicate.portableMarkdown = { ...source.portableMarkdown };
  return duplicate;
}

/** Validate and normalize an IndexedDB record without discarding its Markdown. */
export function normalizeStoredDocument(
  value: unknown,
  expectedId?: string,
): DocmarkDocument | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    value.id.trim() === "" ||
    (expectedId !== undefined && value.id !== expectedId) ||
    typeof value.title !== "string" ||
    typeof value.markdown !== "string"
  ) {
    return null;
  }

  const createdAt = normalizeTimestamp(value.createdAt);
  if (!createdAt) return null;
  const updatedAt = normalizeTimestamp(value.updatedAt) ?? createdAt;

  return {
    id: value.id,
    title: value.title,
    markdown: value.markdown,
    settings: normalizeSettings(value.settings),
    portableMarkdown: normalizePortableMarkdown(value.portableMarkdown),
    createdAt,
    updatedAt,
  };
}

/** Return only fields the document switcher needs. */
export function normalizeStoredDocumentSummary(
  value: unknown,
): DocmarkDocumentSummary | null {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.trim() === "" || typeof value.title !== "string") {
    return null;
  }
  const updatedAt = normalizeTimestamp(value.updatedAt);
  if (!updatedAt) return null;
  return { id: value.id, title: value.title, updatedAt };
}
