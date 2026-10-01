import {
  DEFAULT_DOCUMENT_SETTINGS,
  getMarginValidationError,
  getPageDimensions,
  MAX_PAGE_MARGIN_MM,
  type DocumentSettings,
  type PageMargins,
  type PageOrientation,
  type PageSize,
} from "@/lib/document/settings";

export const DEFAULT_DOCUMENT_TITLE = "Untitled document";

export type DocmarkDocument = {
  id: string;
  title: string;
  markdown: string;
  settings: DocumentSettings;
  createdAt: string;
  updatedAt: string;
};

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

  return { pageSize, orientation, margins };
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
    createdAt: timestamp,
    updatedAt: timestamp,
  };
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
    createdAt,
    updatedAt,
  };
}
