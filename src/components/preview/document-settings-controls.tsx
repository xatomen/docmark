"use client";

import { useState, type ReactNode } from "react";
import {
  Checkbox,
  Disclosure,
  Drawer,
  Input,
  Label,
  ListBox,
  Select,
  Separator,
  Switch,
  TextArea,
  TextField,
} from "@heroui/react";
import { ChevronDown, Settings } from "lucide-react";
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

type SelectOption = { id: string; label: string };

const MARGIN_FIELDS: { key: keyof PageMargins; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "right", label: "Right" },
  { key: "bottom", label: "Bottom" },
  { key: "left", label: "Left" },
];

function SettingSelect({
  label,
  value,
  options,
  onChange,
  isDisabled = false,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  isDisabled?: boolean;
}) {
  return (
    <Select
      className="min-w-0"
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key !== null) onChange(String(key));
      }}
      isDisabled={isDisabled}
      variant="secondary"
    >
      <Label>{label}</Label>
      <Select.Trigger aria-label={label} className="w-full justify-between">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function SettingSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function AdvancedSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Disclosure className="border-t border-border py-1">
      <Disclosure.Heading>
        <Disclosure.Trigger className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md py-2 text-left text-sm font-medium text-foreground outline-none hover:bg-subtle aria-expanded:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-accent aria-expanded:font-semibold">
          {title}
          <Disclosure.Indicator>
            <ChevronDown aria-hidden="true" className="size-4 text-muted" />
          </Disclosure.Indicator>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="space-y-4 pb-4 pt-2">{children}</Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}

function ToggleSetting({
  label,
  isSelected,
  onChange,
}: {
  label: string;
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
}) {
  return (
    <Switch isSelected={isSelected} onChange={onChange} className="w-full">
      <Switch.Content className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 [&>[data-slot=label]]:min-w-0">
        <Label>{label}</Label>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}

function CheckSetting({
  label,
  isSelected,
  isDisabled = false,
  onChange,
}: {
  label: string;
  isSelected: boolean;
  isDisabled?: boolean;
  onChange: (isSelected: boolean) => void;
}) {
  return (
    <Checkbox isSelected={isSelected} isDisabled={isDisabled} onChange={onChange} className="w-full">
      <Checkbox.Content className="inline-flex items-center gap-2 text-sm">
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Label>{label}</Label>
      </Checkbox.Content>
    </Checkbox>
  );
}

function SettingTextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField className="min-w-0 space-y-1.5">
      <Label>{label}</Label>
      <Input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\r?\n/g, " "))}
        variant="secondary"
      />
    </TextField>
  );
}

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

    if (!error) onChange({ ...settings, margins });
  }

  return (
    <Drawer>
      <Drawer.Trigger
        aria-label="Document settings"
        className="inline-grid size-9 place-items-center rounded-[var(--docmark-radius-control)] border border-border bg-surface-secondary text-foreground outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Settings aria-hidden="true" className="size-[18px]" />
      </Drawer.Trigger>
      <Drawer.Backdrop>
        <Drawer.Content placement="right">
          <Drawer.Dialog className="flex h-dvh max-h-dvh w-[min(26rem,100vw)] max-w-full flex-col overflow-hidden border-l border-border bg-surface text-foreground shadow-[var(--overlay-shadow)]">
            <Drawer.Header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
              <Drawer.Heading className="text-base font-semibold">Document settings</Drawer.Heading>
              <Drawer.CloseTrigger
                aria-label="Close document settings"
                className="static ms-auto"
              />
            </Drawer.Header>
            <Drawer.Body className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <SettingSection title="Page">
                <div className="grid grid-cols-2 gap-3">
                  <SettingSelect
                    label="Page size"
                    value={settings.pageSize}
                    options={[{ id: "a4", label: "A4" }, { id: "letter", label: "Letter" }]}
                    onChange={(value) => onChange({ ...settings, pageSize: value as DocumentSettings["pageSize"] })}
                  />
                  <SettingSelect
                    label="Orientation"
                    value={settings.orientation}
                    options={[{ id: "portrait", label: "Portrait" }, { id: "landscape", label: "Landscape" }]}
                    onChange={(value) => onChange({ ...settings, orientation: value as DocumentSettings["orientation"] })}
                  />
                </div>
                <Disclosure className="rounded-lg border border-border px-3">
                  <Disclosure.Heading>
                    <Disclosure.Trigger className="flex min-h-11 w-full items-center justify-between rounded-md text-sm font-medium outline-none hover:bg-subtle aria-expanded:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-accent aria-expanded:font-semibold">
                      Margins
                      <Disclosure.Indicator>
                        <ChevronDown aria-hidden="true" className="size-4 text-muted" />
                      </Disclosure.Indicator>
                    </Disclosure.Trigger>
                  </Disclosure.Heading>
                  <Disclosure.Content>
                    <Disclosure.Body className="grid grid-cols-2 gap-3 pb-3 pt-1">
                      {MARGIN_FIELDS.map(({ key, label }) => {
                        const id = `margin-${key}`;
                        return (
                          <TextField key={key} className="space-y-1.5">
                            <Label htmlFor={id}>{label} (mm)</Label>
                            <Input
                              id={id}
                              type="number"
                              min={0}
                              max={MAX_PAGE_MARGIN_MM}
                              step="0.1"
                              inputMode="decimal"
                              value={marginDrafts[key]}
                              aria-describedby={marginError ? "margin-error" : undefined}
                              onChange={(event) => updateMargin(key, event.target.value)}
                              variant="secondary"
                            />
                          </TextField>
                        );
                      })}
                      {marginError && (
                        <p id="margin-error" role="status" className="col-span-2 text-xs text-red-700 dark:text-red-300">
                          {marginError}
                        </p>
                      )}
                    </Disclosure.Body>
                  </Disclosure.Content>
                </Disclosure>
              </SettingSection>

              <Separator />

              <SettingSection title="Appearance">
                <SettingSelect
                  label="Document theme"
                  value={settings.theme}
                  options={DOCUMENT_THEMES.map((theme) => ({ id: theme.id, label: theme.label }))}
                  onChange={(value) => {
                    if (isDocumentThemeId(value)) onChange({ ...settings, theme: value });
                  }}
                />
                <div className="grid grid-cols-2 gap-3">
                  <SettingSelect
                    label="Font family"
                    value={settings.typography.fontFamily}
                    options={DOCUMENT_FONT_FAMILIES.map((family) => ({ id: family, label: family }))}
                    onChange={(value) => {
                      if (isDocumentFontFamily(value)) onChange({ ...settings, typography: { ...settings.typography, fontFamily: value } });
                    }}
                  />
                  <SettingSelect
                    label="Base font size"
                    value={String(settings.typography.fontSize)}
                    options={DOCUMENT_FONT_SIZES.map((size) => ({ id: String(size), label: `${size} pt` }))}
                    onChange={(value) => {
                      const size = Number(value);
                      if (isDocumentFontSize(size)) onChange({ ...settings, typography: { ...settings.typography, fontSize: size } });
                    }}
                  />
                  <SettingSelect
                    label="Line height"
                    value={String(settings.typography.lineHeight)}
                    options={DOCUMENT_LINE_HEIGHTS.map((height) => ({ id: String(height), label: height.toFixed(height === 1.75 ? 2 : 1) }))}
                    onChange={(value) => {
                      const lineHeight = Number(value);
                      if (isDocumentLineHeight(lineHeight)) onChange({ ...settings, typography: { ...settings.typography, lineHeight } });
                    }}
                  />
                  <SettingSelect
                    label="Text alignment"
                    value={settings.typography.alignment}
                    options={DOCUMENT_TEXT_ALIGNMENTS.map((alignment) => ({ id: alignment, label: alignment[0].toUpperCase() + alignment.slice(1) }))}
                    onChange={(value) => {
                      if (isDocumentTextAlignment(value)) onChange({ ...settings, typography: { ...settings.typography, alignment: value } });
                    }}
                  />
                </div>
              </SettingSection>

              <AdvancedSection title="Cover">
                <ToggleSetting
                  label="Enable cover page"
                  isSelected={settings.cover.enabled}
                  onChange={(enabled) => onChange({ ...settings, cover: { ...settings.cover, enabled } })}
                />
                {settings.cover.enabled && (
                  <div className="grid grid-cols-1 gap-3">
                    {([
                      ["title", "Title"],
                      ["subtitle", "Subtitle"],
                      ["author", "Author"],
                      ["organization", "Organization"],
                      ["date", "Date"],
                    ] as const).map(([key, label]) => (
                      <SettingTextField
                        key={key}
                        label={`Cover ${label.toLowerCase()}`}
                        value={settings.cover[key]}
                        onChange={(value) => onChange({ ...settings, cover: { ...settings.cover, [key]: value } })}
                      />
                    ))}
                  </div>
                )}
              </AdvancedSection>

              <AdvancedSection title="Page numbers">
                <ToggleSetting
                  label="Show page numbers"
                  isSelected={settings.pageNumbers.enabled}
                  onChange={(enabled) => onChange({ ...settings, pageNumbers: { ...settings.pageNumbers, enabled } })}
                />
                <SettingSelect
                  label="Page number position"
                  value={settings.pageNumbers.position}
                  isDisabled={!settings.pageNumbers.enabled}
                  options={[
                    { id: "bottom-left", label: "Bottom left" },
                    { id: "bottom-center", label: "Bottom center" },
                    { id: "bottom-right", label: "Bottom right" },
                  ]}
                  onChange={(value) => {
                    if (isPageNumberPosition(value)) onChange({ ...settings, pageNumbers: { ...settings.pageNumbers, position: value } });
                  }}
                />
                <TextField className="space-y-1.5">
                    <Label>Page number start at</Label>
                  <Input
                    aria-label="Page number start at"
                    type="number"
                    min={0}
                    step={1}
                    value={settings.pageNumbers.startAt}
                    onChange={(event) => {
                      if (event.target.value.trim() === "") return;
                      const value = Number(event.target.value);
                      if (isValidPageNumberStartAt(value)) onChange({ ...settings, pageNumbers: { ...settings.pageNumbers, startAt: value } });
                    }}
                    variant="secondary"
                  />
                </TextField>
                <CheckSetting
                  label="Exclude cover from numbering"
                  isSelected={settings.pageNumbers.excludeCover}
                  isDisabled={!settings.cover.enabled}
                  onChange={(excludeCover) => onChange({ ...settings, pageNumbers: { ...settings.pageNumbers, excludeCover } })}
                />
              </AdvancedSection>

              <AdvancedSection title="Header & Footer">
                {(["header", "footer"] as const).map((key) => {
                  const label = key === "header" ? "Header" : "Footer";
                  const decoration = settings[key];
                  return (
                    <div key={key} className="space-y-3 border-b border-border pb-4 last:border-b-0 last:pb-0">
                      <ToggleSetting
                        label={`Show ${key}`}
                        isSelected={decoration.enabled}
                        onChange={(enabled) => onChange({ ...settings, [key]: { ...decoration, enabled } })}
                      />
                      <TextField className="space-y-1.5">
                        <Label>{label} text</Label>
                        <TextArea
                          aria-label={`${label} text`}
                          rows={2}
                          value={decoration.text}
                          disabled={!decoration.enabled}
                          onChange={(event) => onChange({ ...settings, [key]: { ...decoration, text: event.target.value } })}
                          variant="secondary"
                          className="w-full resize-y"
                        />
                      </TextField>
                      <SettingSelect
                        label={`${label} alignment`}
                        value={decoration.alignment}
                        isDisabled={!decoration.enabled}
                        options={[
                          { id: "left", label: "Left" },
                          { id: "center", label: "Center" },
                          { id: "right", label: "Right" },
                        ]}
                        onChange={(value) => {
                          if (isDecorationAlignment(value)) onChange({ ...settings, [key]: { ...decoration, alignment: value } });
                        }}
                      />
                    </div>
                  );
                })}
              </AdvancedSection>

              <AdvancedSection title="Markdown metadata">
                <CheckSetting
                  label="Include Docmark settings in Markdown"
                  isSelected={portableMarkdown.includeDocmarkSettings}
                  isDisabled={portableMarkdown.status !== "valid" && portableMarkdown.status !== "invalid-settings"}
                  onChange={onPortableMetadataChange}
                />
                {metadataWarning && (
                  <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
                    {metadataWarning}
                  </p>
                )}
              </AdvancedSection>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
