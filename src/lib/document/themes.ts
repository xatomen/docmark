export const DOCUMENT_THEME_IDS = ["default", "technical", "academic", "minimal"] as const;

export type DocumentThemeId = (typeof DOCUMENT_THEME_IDS)[number];

export type DocumentThemeDefinition = {
  id: DocumentThemeId;
  label: string;
  description: string;
  className: string;
};

export const DOCUMENT_THEMES: readonly DocumentThemeDefinition[] = [
  {
    id: "default",
    label: "Default",
    description: "The familiar Docmark document style.",
    className: "docmark-theme-default",
  },
  {
    id: "technical",
    label: "Technical",
    description: "Clear structure and strong, restrained tables and code.",
    className: "docmark-theme-technical",
  },
  {
    id: "academic",
    label: "Academic",
    description: "A traditional, reading-focused style for formal documents.",
    className: "docmark-theme-academic",
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "A spacious layout with low visual noise.",
    className: "docmark-theme-minimal",
  },
];

const THEME_BY_ID = new Map(DOCUMENT_THEMES.map((theme) => [theme.id, theme]));

export function isDocumentThemeId(value: unknown): value is DocumentThemeId {
  return typeof value === "string" && THEME_BY_ID.has(value as DocumentThemeId);
}

export function getDocumentThemeDefinition(value: unknown): DocumentThemeDefinition {
  return (isDocumentThemeId(value) && THEME_BY_ID.get(value)) || DOCUMENT_THEMES[0];
}
