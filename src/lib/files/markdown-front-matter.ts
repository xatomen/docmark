import { isMap, parseDocument, type YAMLMap } from "yaml";
import {
  createDefaultPortableMarkdownMetadata,
  type DocmarkDocument,
  type PortableMarkdownMetadata,
  type PortableMarkdownStatus,
} from "@/lib/document/model";
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
  type HeaderFooterSettings,
  type TypographySettings,
  type PageMargins,
} from "@/lib/document/settings";
import { isDocumentThemeId, type DocumentThemeId } from "@/lib/document/themes";

const UTF8_BOM = "\uFEFF";

type FrontMatterBlock = {
  raw: string;
  yaml: string;
  lineEnding: "\n" | "\r\n";
};

export type ParsedMarkdownFile = {
  markdown: string;
  settings: DocumentSettings;
  portableMarkdown: PortableMarkdownMetadata;
  warning: string | null;
};

function extractFrontMatter(source: string): FrontMatterBlock | null | "unclosed" {
  const bomLength = source.startsWith(UTF8_BOM) ? UTF8_BOM.length : 0;
  const openingEnd = source.indexOf("\n", bomLength);
  if (openingEnd < 0) return null;
  const openingLine = source.slice(bomLength, openingEnd).replace(/\r$/, "");
  if (openingLine !== "---") return null;

  const yamlStart = openingEnd + 1;
  let lineStart = yamlStart;
  while (lineStart <= source.length) {
    const lineEnd = source.indexOf("\n", lineStart);
    const end = lineEnd < 0 ? source.length : lineEnd;
    const line = source.slice(lineStart, end).replace(/\r$/, "");
    if (/^---[ \t]*$/.test(line)) {
      const closeEnd = lineEnd < 0 ? source.length : lineEnd + 1;
      let yamlEnd = lineStart;
      if (yamlEnd > yamlStart && source[yamlEnd - 1] === "\n") {
        yamlEnd -= 1;
        if (yamlEnd > yamlStart && source[yamlEnd - 1] === "\r") yamlEnd -= 1;
      }
      return {
        raw: source.slice(0, closeEnd),
        yaml: source.slice(yamlStart, yamlEnd),
        lineEnding: source.slice(bomLength, openingEnd).endsWith("\r") ? "\r\n" : "\n",
      };
    }
    if (lineEnd < 0) break;
    lineStart = lineEnd + 1;
  }
  return "unclosed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSettings(docmark: Record<string, unknown>): {
  settings: DocumentSettings;
  invalid: boolean;
} {
  const defaults = DEFAULT_DOCUMENT_SETTINGS;
  let invalid = false;
  const theme: DocumentThemeId = isDocumentThemeId(docmark.theme) ? docmark.theme : defaults.theme;
  if (Object.hasOwn(docmark, "theme") && !isDocumentThemeId(docmark.theme)) invalid = true;
  if (Object.hasOwn(docmark, "page") && !isRecord(docmark.page)) invalid = true;
  const page = isRecord(docmark.page) ? docmark.page : {};
  if (Object.hasOwn(page, "size") && page.size !== "A4" && page.size !== "Letter") invalid = true;
  const pageSize = page.size === "Letter" ? "letter" : page.size === "A4" ? "a4" : defaults.pageSize;
  if (
    Object.hasOwn(page, "orientation") &&
    page.orientation !== "landscape" &&
    page.orientation !== "portrait"
  ) invalid = true;
  const orientation = page.orientation === "landscape" || page.orientation === "portrait"
    ? page.orientation
    : defaults.orientation;
  if (Object.hasOwn(page, "margins") && !isRecord(page.margins)) invalid = true;
  const rawMargins = isRecord(page.margins) ? page.margins : {};
  const validMargin = (key: keyof PageMargins): number => {
    const value = rawMargins[key];
    if (
      Object.hasOwn(rawMargins, key) &&
      !(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_PAGE_MARGIN_MM)
    ) invalid = true;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_PAGE_MARGIN_MM
      ? value
      : defaults.margins[key];
  };
  const margins: PageMargins = {
    top: validMargin("top"),
    right: validMargin("right"),
    bottom: validMargin("bottom"),
    left: validMargin("left"),
  };
  const dimensions = getPageDimensions(pageSize, orientation);
  if (margins.left + margins.right >= dimensions.widthMm) {
    invalid = true;
    margins.left = defaults.margins.left;
    margins.right = defaults.margins.right;
  }
  if (margins.top + margins.bottom >= dimensions.heightMm) {
    invalid = true;
    margins.top = defaults.margins.top;
    margins.bottom = defaults.margins.bottom;
  }
  if (getMarginValidationError(margins, dimensions)) {
    invalid = true;
    return { settings: { ...defaults, theme, margins: { ...defaults.margins } }, invalid };
  }
  if (Object.hasOwn(docmark, "pageNumbers") && !isRecord(docmark.pageNumbers)) invalid = true;
  const rawPageNumbers = isRecord(docmark.pageNumbers) ? docmark.pageNumbers : {};
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
    // A missing value is legacy v1 metadata and retains pre-M6.8.2 numbering.
    excludeCover: typeof rawPageNumbers.excludeCover === "boolean"
      ? rawPageNumbers.excludeCover
      : false,
  };
  if (Object.hasOwn(rawPageNumbers, "enabled") && typeof rawPageNumbers.enabled !== "boolean") invalid = true;
  if (Object.hasOwn(rawPageNumbers, "position") && !isPageNumberPosition(rawPageNumbers.position)) invalid = true;
  if (Object.hasOwn(rawPageNumbers, "startAt") && !isValidPageNumberStartAt(rawPageNumbers.startAt)) invalid = true;
  if (Object.hasOwn(rawPageNumbers, "excludeCover") && typeof rawPageNumbers.excludeCover !== "boolean") invalid = true;
  const readDecoration = (key: "header" | "footer"): HeaderFooterSettings => {
    const raw = docmark[key];
    if (Object.hasOwn(docmark, key) && !isRecord(raw)) {
      invalid = true;
      return { ...defaults[key] };
    }
    const value = isRecord(raw) ? raw : {};
    const enabled = typeof value.enabled === "boolean" ? value.enabled : defaults[key].enabled;
    const text = typeof value.text === "string" ? value.text : defaults[key].text;
    const alignment = isDecorationAlignment(value.alignment) ? value.alignment : defaults[key].alignment;
    if (Object.hasOwn(value, "enabled") && typeof value.enabled !== "boolean") invalid = true;
    if (Object.hasOwn(value, "text") && typeof value.text !== "string") invalid = true;
    if (Object.hasOwn(value, "alignment") && !isDecorationAlignment(value.alignment)) invalid = true;
    return { enabled, text, alignment };
  };
  if (Object.hasOwn(docmark, "typography") && !isRecord(docmark.typography)) invalid = true;
  const rawTypography = isRecord(docmark.typography) ? docmark.typography : {};
  const typography: TypographySettings = {
    fontFamily: isDocumentFontFamily(rawTypography.fontFamily) ? rawTypography.fontFamily : defaults.typography.fontFamily,
    fontSize: isDocumentFontSize(rawTypography.fontSize) ? rawTypography.fontSize : defaults.typography.fontSize,
    lineHeight: isDocumentLineHeight(rawTypography.lineHeight) ? rawTypography.lineHeight : defaults.typography.lineHeight,
    alignment: isDocumentTextAlignment(rawTypography.alignment) ? rawTypography.alignment : defaults.typography.alignment,
  };
  if (Object.hasOwn(rawTypography, "fontFamily") && !isDocumentFontFamily(rawTypography.fontFamily)) invalid = true;
  if (Object.hasOwn(rawTypography, "fontSize") && !isDocumentFontSize(rawTypography.fontSize)) invalid = true;
  if (Object.hasOwn(rawTypography, "lineHeight") && !isDocumentLineHeight(rawTypography.lineHeight)) invalid = true;
  if (Object.hasOwn(rawTypography, "alignment") && !isDocumentTextAlignment(rawTypography.alignment)) invalid = true;
  if (Object.hasOwn(docmark, "cover") && !isRecord(docmark.cover)) invalid = true;
  const rawCover = isRecord(docmark.cover) ? docmark.cover : {};
  const coverField = (key: "title" | "subtitle" | "author" | "organization" | "date") => {
    const value = rawCover[key];
    if (Object.hasOwn(rawCover, key) && typeof value !== "string") invalid = true;
    return typeof value === "string" ? value.replace(/\r?\n/g, " ").trim() : defaults.cover[key];
  };
  const cover = {
    enabled: typeof rawCover.enabled === "boolean" ? rawCover.enabled : defaults.cover.enabled,
    title: coverField("title"),
    subtitle: coverField("subtitle"),
    author: coverField("author"),
    organization: coverField("organization"),
    date: coverField("date"),
  };
  if (Object.hasOwn(rawCover, "enabled") && typeof rawCover.enabled !== "boolean") invalid = true;
  return { settings: { theme, pageSize, orientation, margins, pageNumbers, header: readDecoration("header"), footer: readDecoration("footer"), typography, cover }, invalid };
}

export function getPortableMarkdownWarning(metadata: PortableMarkdownMetadata): string | null {
  const status = metadata.status;
  switch (status) {
    case "invalid-settings":
      return "Some Docmark page settings are invalid. Safe defaults are shown; the source metadata stays preserved until settings change.";
    case "malformed":
      return "Front Matter could not be parsed. Docmark will preserve it without rewriting it.";
    case "invalid-docmark":
      return "Docmark metadata is invalid. It will be preserved without applying its settings.";
    case "missing-version":
      return "Docmark metadata has no version. It will be preserved without applying its settings.";
    case "unsupported-version":
      return "This file uses a newer Docmark metadata version. It will be preserved without being changed.";
    default:
      return null;
  }
}

export function parseMarkdownFile(source: string): ParsedMarkdownFile {
  const block = extractFrontMatter(source);
  if (block === null) {
    return {
      markdown: source,
      settings: { ...DEFAULT_DOCUMENT_SETTINGS, margins: { ...DEFAULT_DOCUMENT_SETTINGS.margins } },
      portableMarkdown: createDefaultPortableMarkdownMetadata(),
      warning: null,
    };
  }
  if (block === "unclosed") {
    const portableMarkdown = {
      rawFrontMatter: null,
      includeDocmarkSettings: false,
      status: "malformed" as const,
    };
    return {
      markdown: source,
      settings: { ...DEFAULT_DOCUMENT_SETTINGS, margins: { ...DEFAULT_DOCUMENT_SETTINGS.margins } },
      portableMarkdown,
      warning: getPortableMarkdownWarning(portableMarkdown),
    };
  }

  const base = {
    rawFrontMatter: block.raw,
    includeDocmarkSettings: false,
    status: "valid" as PortableMarkdownStatus,
  };
  try {
    const yamlDocument = parseDocument(block.yaml);
    if (yamlDocument.errors.length > 0) throw new Error("Malformed YAML");
    const values = yamlDocument.toJS({ maxAliasCount: 100 }) as unknown;
    if (values !== null && !isRecord(values)) {
      return {
        markdown: source.slice(block.raw.length),
        settings: { ...DEFAULT_DOCUMENT_SETTINGS, margins: { ...DEFAULT_DOCUMENT_SETTINGS.margins } },
        portableMarkdown: { ...base, status: "invalid-docmark" },
        warning: getPortableMarkdownWarning({ ...base, status: "invalid-docmark" }),
      };
    }

    const namespace = isRecord(values) && Object.hasOwn(values, "docmark")
      ? values.docmark
      : undefined;
    if (namespace === undefined) {
      return {
        markdown: source.slice(block.raw.length),
        settings: { ...DEFAULT_DOCUMENT_SETTINGS, margins: { ...DEFAULT_DOCUMENT_SETTINGS.margins } },
        portableMarkdown: base,
        warning: null,
      };
    }
    if (!isRecord(namespace)) {
      return {
        markdown: source.slice(block.raw.length),
        settings: { ...DEFAULT_DOCUMENT_SETTINGS, margins: { ...DEFAULT_DOCUMENT_SETTINGS.margins } },
        portableMarkdown: { ...base, includeDocmarkSettings: true, status: "invalid-docmark" },
        warning: getPortableMarkdownWarning({ ...base, status: "invalid-docmark" }),
      };
    }
    if (!Object.hasOwn(namespace, "version")) {
      return {
        markdown: source.slice(block.raw.length),
        settings: { ...DEFAULT_DOCUMENT_SETTINGS, margins: { ...DEFAULT_DOCUMENT_SETTINGS.margins } },
        portableMarkdown: { ...base, includeDocmarkSettings: true, status: "missing-version" },
        warning: getPortableMarkdownWarning({ ...base, status: "missing-version" }),
      };
    }
    if (namespace.version !== 1) {
      const status = typeof namespace.version === "number" && namespace.version > 1
        ? "unsupported-version"
        : "invalid-docmark";
      return {
        markdown: source.slice(block.raw.length),
        settings: { ...DEFAULT_DOCUMENT_SETTINGS, margins: { ...DEFAULT_DOCUMENT_SETTINGS.margins } },
        portableMarkdown: { ...base, includeDocmarkSettings: true, status },
        warning: getPortableMarkdownWarning({ ...base, status }),
      };
    }

    const parsedSettings = readSettings(namespace);
    const status: PortableMarkdownStatus = parsedSettings.invalid ? "invalid-settings" : "valid";
    const portableMarkdown = { ...base, includeDocmarkSettings: true, status };
    return {
      markdown: source.slice(block.raw.length),
      settings: parsedSettings.settings,
      portableMarkdown,
      warning: getPortableMarkdownWarning(portableMarkdown),
    };
  } catch {
    const portableMarkdown = { ...base, status: "malformed" as const };
    return {
      markdown: source.slice(block.raw.length),
      settings: { ...DEFAULT_DOCUMENT_SETTINGS, margins: { ...DEFAULT_DOCUMENT_SETTINGS.margins } },
      portableMarkdown,
      warning: getPortableMarkdownWarning(portableMarkdown),
    };
  }
}

function getDocumentSnapshot(document: Pick<DocmarkDocument, "settings">) {
  return {
    version: 1,
    theme: document.settings.theme,
    page: {
      size: document.settings.pageSize === "a4" ? "A4" : "Letter",
      orientation: document.settings.orientation,
      margins: { ...document.settings.margins },
    },
    header: { ...document.settings.header },
    footer: { ...document.settings.footer },
    typography: { ...document.settings.typography },
    cover: { ...document.settings.cover },
  };
}

function sameSettings(left: DocumentSettings, right: DocumentSettings): boolean {
  return left.theme === right.theme &&
    left.pageSize === right.pageSize &&
    left.orientation === right.orientation &&
    left.margins.top === right.margins.top &&
    left.margins.right === right.margins.right &&
    left.margins.bottom === right.margins.bottom &&
    left.margins.left === right.margins.left &&
    left.pageNumbers.enabled === right.pageNumbers.enabled &&
    left.pageNumbers.position === right.pageNumbers.position &&
    left.pageNumbers.startAt === right.pageNumbers.startAt &&
    left.pageNumbers.excludeCover === right.pageNumbers.excludeCover &&
    left.header.enabled === right.header.enabled &&
    left.header.text === right.header.text &&
    left.header.alignment === right.header.alignment &&
    left.footer.enabled === right.footer.enabled &&
    left.footer.text === right.footer.text &&
    left.footer.alignment === right.footer.alignment &&
    left.typography.fontFamily === right.typography.fontFamily &&
    left.typography.fontSize === right.typography.fontSize &&
    left.typography.lineHeight === right.typography.lineHeight &&
    left.typography.alignment === right.typography.alignment &&
    left.cover.enabled === right.cover.enabled &&
    left.cover.title === right.cover.title &&
    left.cover.subtitle === right.cover.subtitle &&
    left.cover.author === right.cover.author &&
    left.cover.organization === right.cover.organization &&
    left.cover.date === right.cover.date;
}

function getYamlMap(document: ReturnType<typeof parseDocument>, key: string): YAMLMap {
  if (!isMap(document.contents)) document.contents = document.createNode({});
  const root = document.contents;
  if (!isMap(root)) throw new Error("Could not update the YAML root mapping.");
  const existing = root.get(key, true);
  if (isMap(existing)) return existing;
  root.set(key, document.createNode({}));
  const created = root.get(key, true);
  if (!isMap(created)) throw new Error(`Could not update the ${key} YAML mapping.`);
  return created;
}

function updateDocmarkNamespace(
  yamlDocument: ReturnType<typeof parseDocument>,
  settings: DocumentSettings,
): void {
  const docmark = getYamlMap(yamlDocument, "docmark");
  const snapshot = getDocumentSnapshot({ settings });
  docmark.set("version", snapshot.version);
  docmark.set("theme", snapshot.theme);
  const page = getYamlMapFromMap(yamlDocument, docmark, "page");
  page.set("size", snapshot.page.size);
  page.set("orientation", snapshot.page.orientation);
  const margins = getYamlMapFromMap(yamlDocument, page, "margins");
  for (const [key, value] of Object.entries(snapshot.page.margins)) margins.set(key, value);
  const pageNumbers = getYamlMapFromMap(yamlDocument, docmark, "pageNumbers");
  pageNumbers.set("enabled", settings.pageNumbers.enabled);
  pageNumbers.set("position", settings.pageNumbers.position);
  pageNumbers.set("startAt", settings.pageNumbers.startAt);
  pageNumbers.set("excludeCover", settings.pageNumbers.excludeCover);
  for (const key of ["header", "footer"] as const) {
    const decoration = getYamlMapFromMap(yamlDocument, docmark, key);
    decoration.set("enabled", settings[key].enabled);
    decoration.set("text", settings[key].text);
    decoration.set("alignment", settings[key].alignment);
  }
  const typography = getYamlMapFromMap(yamlDocument, docmark, "typography");
  typography.set("fontFamily", settings.typography.fontFamily);
  typography.set("fontSize", settings.typography.fontSize);
  typography.set("lineHeight", settings.typography.lineHeight);
  typography.set("alignment", settings.typography.alignment);
  const cover = getYamlMapFromMap(yamlDocument, docmark, "cover");
  cover.set("enabled", settings.cover.enabled);
  cover.set("title", settings.cover.title);
  cover.set("subtitle", settings.cover.subtitle);
  cover.set("author", settings.cover.author);
  cover.set("organization", settings.cover.organization);
  cover.set("date", settings.cover.date);
}

function getYamlMapFromMap(
  document: ReturnType<typeof parseDocument>,
  parent: YAMLMap,
  key: string,
): YAMLMap {
  const existing = parent.get(key, true);
  if (isMap(existing)) return existing;
  parent.set(key, document.createNode({}));
  const created = parent.get(key, true);
  if (!isMap(created)) throw new Error(`Could not update the ${key} YAML mapping.`);
  return created;
}

function isEmptyFrontMatter(document: ReturnType<typeof parseDocument>): boolean {
  const contents = document.contents;
  return isMap(contents) && contents.items.length === 0 && !contents.comment && !contents.commentBefore;
}

/** Serialize a complete local file while changing only Docmark's YAML namespace. */
function serializeMarkdownFileUnchecked(
  document: Pick<DocmarkDocument, "markdown" | "settings" | "portableMarkdown">,
): string {
  const metadata = document.portableMarkdown;
  if (metadata.status !== "valid" && metadata.status !== "invalid-settings") {
    return `${metadata.rawFrontMatter ?? ""}${document.markdown}`;
  }

  const original = metadata.rawFrontMatter;
  const extracted = original === null ? null : extractFrontMatter(original);
  if (extracted === "unclosed") return `${original}${document.markdown}`;
  if (original !== null && extracted === null) return `${original}${document.markdown}`;
  const block: FrontMatterBlock | null = extracted;

  if (!metadata.includeDocmarkSettings) {
    if (!block) return document.markdown;
    const yamlDocument = parseDocument(block.yaml);
    if (yamlDocument.errors.length > 0) return `${original}${document.markdown}`;
    const values = yamlDocument.toJS({ maxAliasCount: 100 }) as unknown;
    if (!isRecord(values) || !Object.hasOwn(values, "docmark")) return `${original}${document.markdown}`;
    yamlDocument.delete("docmark");
    if (isEmptyFrontMatter(yamlDocument)) return document.markdown;
    const yaml = yamlDocument.toString({ lineWidth: 0 }).replace(/\r?\n/g, block.lineEnding).replace(/(?:\r?\n)+$/, "");
    const bom = original?.startsWith(UTF8_BOM) ? UTF8_BOM : "";
    return `${bom}---${block.lineEnding}${yaml}${block.lineEnding}---${block.lineEnding}${document.markdown}`;
  }

  const lineEnding = block?.lineEnding ?? "\n";
  if (original !== null && block) {
    const originalState = parseMarkdownFile(`${original}${document.markdown}`);
    if (
      (originalState.portableMarkdown.status === "valid" ||
        originalState.portableMarkdown.status === "invalid-settings") &&
      originalState.portableMarkdown.includeDocmarkSettings &&
      sameSettings(originalState.settings, document.settings)
    ) {
      return `${original}${document.markdown}`;
    }
  }
  const bom = original?.startsWith(UTF8_BOM)
    ? UTF8_BOM
    : original === null && document.markdown.startsWith(UTF8_BOM)
      ? UTF8_BOM
      : "";
  const body = original === null && bom ? document.markdown.slice(UTF8_BOM.length) : document.markdown;
  const yamlDocument = block ? parseDocument(block.yaml) : parseDocument("");
  if (yamlDocument.errors.length > 0) return `${original ?? ""}${document.markdown}`;
  const values = yamlDocument.toJS({ maxAliasCount: 100 }) as unknown;
  if (values !== null && !isRecord(values)) return `${original ?? ""}${document.markdown}`;
  if (isRecord(values) && Object.hasOwn(values, "docmark") && !isRecord(values.docmark)) {
    return `${original ?? ""}${document.markdown}`;
  }
  updateDocmarkNamespace(yamlDocument, document.settings);
  const yaml = yamlDocument.toString({ lineWidth: 0 }).replace(/\r?\n/g, lineEnding).replace(/(?:\r?\n)+$/, "");
  return `${bom}---${lineEnding}${yaml}${lineEnding}---${lineEnding}${body}`;
}

/** Never let malformed stored metadata interrupt editing or file saving. */
export function serializeMarkdownFile(
  document: Pick<DocmarkDocument, "markdown" | "settings" | "portableMarkdown">,
): string {
  try {
    return serializeMarkdownFileUnchecked(document);
  } catch {
    return `${document.portableMarkdown.rawFrontMatter ?? ""}${document.markdown}`;
  }
}
