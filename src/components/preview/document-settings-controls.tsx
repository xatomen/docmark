"use client";

import { useState } from "react";
import {
  getMarginValidationError,
  getPageDimensions,
  isPageNumberPosition,
  isDecorationAlignment,
  DOCUMENT_FONT_FAMILIES,
  DOCUMENT_FONT_SIZES,
  DOCUMENT_LINE_HEIGHTS,
  DOCUMENT_TEXT_ALIGNMENTS,
  isDocumentFontFamily,
  isDocumentFontSize,
  isDocumentLineHeight,
  isDocumentTextAlignment,
  isValidPageNumberStartAt,
  MAX_PAGE_MARGIN_MM,
  type DocumentSettings,
  type PageMargins,
} from "@/lib/document/settings";
import type { PortableMarkdownMetadata } from "@/lib/document/model";
import { DOCUMENT_THEMES, isDocumentThemeId } from "@/lib/document/themes";

type DocumentSettingsControlsProps = {
  settings: DocumentSettings;
  onChange: (settings: DocumentSettings) => void;
  portableMarkdown: PortableMarkdownMetadata;
  onPortableMetadataChange: (include: boolean) => void;
  metadataWarning: string | null;
};

const MARGIN_FIELDS: { key: keyof PageMargins; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "right", label: "Right" },
  { key: "bottom", label: "Bottom" },
  { key: "left", label: "Left" },
];

export function DocumentSettingsControls({
  settings,
  onChange,
  portableMarkdown,
  onPortableMetadataChange,
  metadataWarning,
}: DocumentSettingsControlsProps) {
  const [marginDrafts, setMarginDrafts] = useState(() =>
    Object.fromEntries(
      MARGIN_FIELDS.map(({ key }) => [key, String(settings.margins[key])]),
    ) as Record<keyof PageMargins, string>,
  );
  const [marginError, setMarginError] = useState<string | null>(null);

  function updateMargin(key: keyof PageMargins, rawValue: string) {
    setMarginDrafts((current) => ({ ...current, [key]: rawValue }));

    if (rawValue.trim() === "") {
      setMarginError("Enter a valid number for each margin.");
      return;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      setMarginError("Enter a valid number for each margin.");
      return;
    }

    const margins = { ...settings.margins, [key]: value };
    const dimensions = getPageDimensions(settings.pageSize, settings.orientation);
    const error = getMarginValidationError(margins, dimensions);
    setMarginError(error);

    if (!error) {
      onChange({ ...settings, margins });
    }
  }

  function updatePageSize(pageSize: DocumentSettings["pageSize"]) {
    onChange({ ...settings, pageSize });
  }

  function updateOrientation(orientation: DocumentSettings["orientation"]) {
    onChange({ ...settings, orientation });
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2.5 sm:px-6">
      <details className="relative text-xs text-muted">
        <summary className="cursor-pointer select-none rounded border border-border px-2.5 py-1.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent">
          Margins
        </summary>
        <div className="absolute left-0 z-10 mt-2 grid w-64 grid-cols-2 gap-3 rounded-md border border-border bg-background p-3 shadow-lg">
          {MARGIN_FIELDS.map(({ key, label }) => {
            const id = `margin-${key}`;
            return (
              <label key={key} htmlFor={id} className="space-y-1">
                <span className="block">{label}</span>
                <span className="flex items-center gap-2">
                  <input
                    id={id}
                    type="number"
                    min={0}
                    max={MAX_PAGE_MARGIN_MM}
                    step="0.1"
                    inputMode="decimal"
                    value={marginDrafts[key]}
                    aria-describedby={marginError ? "margin-error" : undefined}
                    onChange={(event) => updateMargin(key, event.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  />
                  <span>mm</span>
                </span>
              </label>
            );
          })}
          {marginError && (
            <p id="margin-error" role="status" className="col-span-2 text-xs text-red-700 dark:text-red-300">
              {marginError}
            </p>
          )}
        </div>
      </details>

      <label className="flex items-center gap-2 text-xs text-muted">
        Page size
        <select
          value={settings.pageSize}
          onChange={(event) =>
            updatePageSize(event.target.value as DocumentSettings["pageSize"])
          }
          className="rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value="a4">A4</option>
          <option value="letter">Letter</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs text-muted">
        Orientation
        <select
          value={settings.orientation}
          onChange={(event) =>
            updateOrientation(event.target.value as DocumentSettings["orientation"])
          }
          className="rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs text-muted">
        Document theme
        <select
          aria-label="Document theme"
          value={settings.theme}
          onChange={(event) => {
            if (!isDocumentThemeId(event.target.value)) return;
            onChange({ ...settings, theme: event.target.value });
          }}
          className="rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {DOCUMENT_THEMES.map((theme) => (
            <option value={theme.id} key={theme.id}>{theme.label}</option>
          ))}
        </select>
      </label>

      <fieldset className="flex basis-full flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-2 text-xs text-muted">
        <legend className="px-1">Cover Page</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label="Enable cover page"
            checked={settings.cover.enabled}
            onChange={(event) => onChange({
              ...settings,
              cover: { ...settings.cover, enabled: event.target.checked },
            })}
            className="accent-accent"
          />
          Enable cover page
        </label>
        {settings.cover.enabled && ([
          ["title", "Title"],
          ["subtitle", "Subtitle"],
          ["author", "Author"],
          ["organization", "Organization"],
          ["date", "Date"],
        ] as const).map(([key, label]) => (
          <label className="flex items-center gap-2" key={key}>
            {label}
            <input
              type="text"
              aria-label={`Cover ${label.toLowerCase()}`}
              value={settings.cover[key]}
              onChange={(event) => onChange({
                ...settings,
                cover: { ...settings.cover, [key]: event.target.value.replace(/\r?\n/g, " ") },
              })}
              className="w-44 rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>
        ))}
      </fieldset>

      <fieldset className="flex basis-full flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-2 text-xs text-muted">
        <legend className="px-1">Typography</legend>
        <label className="flex items-center gap-2">
          Font family
          <select
            aria-label="Font family"
            value={settings.typography.fontFamily}
            onChange={(event) => {
              if (!isDocumentFontFamily(event.target.value)) return;
              onChange({ ...settings, typography: { ...settings.typography, fontFamily: event.target.value } });
            }}
            className="rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {DOCUMENT_FONT_FAMILIES.map((family) => <option value={family} key={family}>{family}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Base font size
          <select
            aria-label="Base font size"
            value={settings.typography.fontSize}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!isDocumentFontSize(value)) return;
              onChange({ ...settings, typography: { ...settings.typography, fontSize: value } });
            }}
            className="rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {DOCUMENT_FONT_SIZES.map((size) => <option value={size} key={size}>{size} pt</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Line height
          <select
            aria-label="Line height"
            value={settings.typography.lineHeight}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!isDocumentLineHeight(value)) return;
              onChange({ ...settings, typography: { ...settings.typography, lineHeight: value } });
            }}
            className="rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {DOCUMENT_LINE_HEIGHTS.map((height) => <option value={height} key={height}>{height.toFixed(height === 1.75 ? 2 : 1)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Text alignment
          <select
            aria-label="Text alignment"
            value={settings.typography.alignment}
            onChange={(event) => {
              if (!isDocumentTextAlignment(event.target.value)) return;
              onChange({ ...settings, typography: { ...settings.typography, alignment: event.target.value } });
            }}
            className="rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {DOCUMENT_TEXT_ALIGNMENTS.map((alignment) => <option value={alignment} key={alignment}>{alignment[0].toUpperCase() + alignment.slice(1)}</option>)}
          </select>
        </label>
      </fieldset>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          aria-label="Include Docmark settings in Markdown"
          checked={portableMarkdown.includeDocmarkSettings}
          disabled={portableMarkdown.status !== "valid" && portableMarkdown.status !== "invalid-settings"}
          onChange={(event) => onPortableMetadataChange(event.target.checked)}
          className="accent-accent"
        />
        Include Docmark settings in Markdown
      </label>
      <fieldset className="flex basis-full flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-2 text-xs text-muted">
        <legend className="px-1">Page numbers</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.pageNumbers.enabled}
            onChange={(event) => onChange({
              ...settings,
              pageNumbers: { ...settings.pageNumbers, enabled: event.target.checked },
            })}
            className="accent-accent"
          />
          Show page numbers
        </label>
        <label className="flex items-center gap-2">
          Position
          <select
            aria-label="Page number position"
            value={settings.pageNumbers.position}
            disabled={!settings.pageNumbers.enabled}
            onChange={(event) => {
              if (!isPageNumberPosition(event.target.value)) return;
              onChange({
                ...settings,
                pageNumbers: { ...settings.pageNumbers, position: event.target.value },
              });
            }}
            className="rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
          >
            <option value="bottom-left">Bottom left</option>
            <option value="bottom-center">Bottom center</option>
            <option value="bottom-right">Bottom right</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Start at
          <input
            type="number"
            aria-label="Page number start at"
            min={0}
            step={1}
            value={settings.pageNumbers.startAt}
            onChange={(event) => {
              if (event.target.value.trim() === "") return;
              const value = Number(event.target.value);
              if (!isValidPageNumberStartAt(value)) return;
              onChange({
                ...settings,
                pageNumbers: { ...settings.pageNumbers, startAt: value },
              });
            }}
            className="w-20 rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label="Exclude cover from numbering"
            checked={settings.pageNumbers.excludeCover}
            disabled={!settings.cover.enabled}
            onChange={(event) => onChange({
              ...settings,
              pageNumbers: { ...settings.pageNumbers, excludeCover: event.target.checked },
            })}
            className="accent-accent"
          />
          Exclude cover from numbering
        </label>
      </fieldset>
      {(["header", "footer"] as const).map((key) => {
        const label = key === "header" ? "Header" : "Footer";
        const decoration = settings[key];
        return (
          <fieldset key={key} className="flex basis-full flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-2 text-xs text-muted">
            <legend className="px-1">{label}</legend>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`show-${key}`}
                aria-label={`Show ${key}`}
                checked={decoration.enabled}
                onChange={(event) => onChange({
                  ...settings,
                  [key]: { ...decoration, enabled: event.target.checked },
                })}
                className="accent-accent"
              />
              <label htmlFor={`show-${key}`}>Show {key}</label>
            </div>
            <label className="flex items-center gap-2">
              Text
              <textarea
                aria-label={`${label} text`}
                rows={1}
                value={decoration.text}
                disabled={!decoration.enabled}
                onChange={(event) => onChange({
                  ...settings,
                  [key]: { ...decoration, text: event.target.value },
                })}
                className="min-h-8 w-56 resize-y rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
              />
            </label>
            <label className="flex items-center gap-2">
              Alignment
              <select
                aria-label={`${label} alignment`}
                value={decoration.alignment}
                disabled={!decoration.enabled}
                onChange={(event) => {
                  if (!isDecorationAlignment(event.target.value)) return;
                  onChange({ ...settings, [key]: { ...decoration, alignment: event.target.value } });
                }}
                className="rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </fieldset>
        );
      })}
      {metadataWarning && (
        <p role="status" className="basis-full text-xs text-amber-700 dark:text-amber-300">
          {metadataWarning}
        </p>
      )}
    </div>
  );
}
