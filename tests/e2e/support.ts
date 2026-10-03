import { expect, type Page } from "@playwright/test";

export function activeDocumentSummary(page: Page) {
  return page.locator('button[aria-label^="Active document:"]');
}

export async function openDocumentSettings(page: Page, section?: string | string[]): Promise<void> {
  const dialog = page.locator('[data-slot="drawer-dialog"]');
  if (!(await dialog.isVisible().catch(() => false))) {
    const documentList = page.getByRole("dialog", { name: "Documents" });
    const openMenu = page.getByRole("menu");
    if (await documentList.isVisible().catch(() => false)) await activeDocumentSummary(page).click();
    if (await openMenu.isVisible().catch(() => false)) await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Document settings" }).click();
    await expect(dialog).toBeVisible();
  }
  for (const name of section ? (Array.isArray(section) ? section : [section]) : []) {
    const trigger = dialog.getByRole("button", { name, exact: true });
    if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  }
}

export async function closeDocumentSettings(page: Page): Promise<void> {
  const dialog = page.locator('[data-slot="drawer-dialog"]');
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.locator('[data-slot="drawer-close-trigger"]').click();
    await expect(dialog).toBeHidden();
  }
}

export async function selectSettingOption(
  page: Page,
  label: string,
  value: string,
  optionName?: string,
): Promise<void> {
  const group = label === "Document theme" || label === "Font family" || label === "Base font size" || label === "Line height" || label === "Text alignment"
    ? undefined
    : label.includes("Header") || label.includes("Footer")
      ? "Header & Footer"
    : label === "Page number position"
        ? "Page numbers"
        : label === "Header alignment" || label === "Footer alignment"
          ? "Header & Footer"
        : label === "Page size" || label === "Orientation"
          ? undefined
          : undefined;
  await openDocumentSettings(page, group);
  const dialog = page.locator('[data-slot="drawer-dialog"]');
  await dialog.getByRole("button", { name: label }).click();
  const optionLabel = optionName ?? settingOptionLabel(label, value);
  const option = page.getByRole("option", { name: optionLabel, exact: true });
  await expect(option).toBeVisible();
  await option.click();
}

function settingOptionLabel(label: string, value: string): string {
  const fixedLabels: Record<string, Record<string, string>> = {
    "Page size": { a4: "A4", letter: "Letter" },
    "Line height": Object.fromEntries([1.2, 1.4, 1.5, 1.6, 1.75, 1.8, 2].map((height) => [String(height), height.toFixed(height === 1.75 ? 2 : 1)])),
    Orientation: { portrait: "Portrait", landscape: "Landscape" },
    "Base font size": Object.fromEntries([9, 10, 11, 12, 14, 16].map((size) => [String(size), `${size} pt`])),
    "Text alignment": Object.fromEntries(["left", "center", "right", "justify"].map((item) => [item, item[0].toUpperCase() + item.slice(1)])),
    "Page number position": {
      "bottom-left": "Bottom left",
      "bottom-center": "Bottom center",
      "bottom-right": "Bottom right",
    },
    "Header alignment": { left: "Left", center: "Center", right: "Right" },
    "Footer alignment": { left: "Left", center: "Center", right: "Right" },
    "Document theme": { default: "Default", technical: "Technical", academic: "Academic", minimal: "Minimal" },
  };
  return fixedLabels[label]?.[value] ?? value;
}

export async function expectSettingSelection(page: Page, label: string, optionName: string): Promise<void> {
  const section = label.includes("Header") || label.includes("Footer")
    ? "Header & Footer"
    : label === "Page number position"
      ? "Page numbers"
      : label === "Include Docmark settings in Markdown"
        ? "Markdown metadata"
        : undefined;
  await openDocumentSettings(page, section);
  await expect(page.locator('[data-slot="drawer-dialog"]').getByRole("button", { name: label })).toContainText(optionName);
}

export async function fillSetting(page: Page, label: string, value: string): Promise<void> {
  const section = label === "Page number start at"
    ? "Page numbers"
    : label.includes("Header") || label.includes("Footer")
      ? "Header & Footer"
      : label.startsWith("Cover ")
        ? "Cover"
        : undefined;
  await openDocumentSettings(page, section);
  if (label.includes("(mm)")) {
    const margins = page.locator('[data-slot="drawer-dialog"]').getByRole("button", { name: "Margins", exact: true });
    if (await margins.getAttribute("aria-expanded") !== "true") await margins.click();
  }
  await page.getByLabel(label).fill(value);
}

export async function setSwitch(page: Page, label: string, selected: boolean): Promise<void> {
  const section = label === "Show header" || label === "Show footer"
    ? "Header & Footer"
    : label === "Show page numbers"
      ? "Page numbers"
      : label === "Enable cover page"
        ? "Cover"
        : undefined;
  await openDocumentSettings(page, section);
  const control = page.getByRole("switch", { name: label });
  if ((await control.isChecked()) !== selected) {
    await page.getByText(label, { exact: true }).click();
    await expect(control).toBeChecked({ checked: selected });
  }
}

export async function setCheckbox(page: Page, label: string, selected: boolean): Promise<void> {
  const section = label === "Exclude cover from numbering"
    ? "Page numbers"
    : label === "Include Docmark settings in Markdown"
      ? "Markdown metadata"
      : undefined;
  await openDocumentSettings(page, section);
  const control = page.getByRole("checkbox", { name: label });
  if ((await control.isChecked()) !== selected) {
    await page.getByText(label, { exact: true }).click();
    await expect(control).toBeChecked({ checked: selected });
  }
}

export async function openFileMenu(page: Page): Promise<void> {
  await closeDocumentSettings(page);
  const documentList = page.getByRole("dialog", { name: "Documents" });
  if (await documentList.isVisible().catch(() => false)) await page.getByRole("button", { name: /Active document:.*Open document list/ }).click();
  const actionMenu = page.getByRole("menu");
  if (await actionMenu.isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "File", exact: true }).click();
}

export async function openFirstDocumentActions(page: Page): Promise<void> {
  const existingMenu = page.getByRole("menu");
  if (await existingMenu.isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Actions for / }).first().click();
}

export function markdownEditor(page: Page) {
  return page.getByRole("textbox", { name: "Markdown source editor" });
}

export async function renameActiveDocument(page: Page, title: string): Promise<void> {
  await closeDocumentSettings(page);
  const openMenu = page.getByRole("menu");
  if (await openMenu.isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await activeDocumentSummary(page).click();
  await openFirstDocumentActions(page);
  await page.getByRole("menuitem", { name: "Rename", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Document title" }).fill(title);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(activeDocumentSummary(page)).toHaveAttribute(
    "aria-label",
    `Active document: ${title}. Open document list`,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /Documents/ })).toBeHidden();
}

export async function createNewDocument(page: Page): Promise<void> {
  await closeDocumentSettings(page);
  const openMenu = page.getByRole("menu");
  if (await openMenu.isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await activeDocumentSummary(page).click();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await expect(markdownEditor(page)).toBeVisible();
}

export async function switchToDocument(page: Page, title: string): Promise<void> {
  await closeDocumentSettings(page);
  const openMenu = page.getByRole("menu");
  if (await openMenu.isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await activeDocumentSummary(page).click();
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(activeDocumentSummary(page)).toHaveAttribute(
    "aria-label",
    `Active document: ${title}. Open document list`,
  );
  await expect(markdownEditor(page)).toBeVisible();
}

export async function forceFilePickerFallback(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: undefined,
    });
  });
}

export async function chooseLocalMarkdown(
  page: Page,
  name: string,
  content: string,
): Promise<void> {
  await openFileMenu(page);
  await page.getByRole("menuitem", { name: "Open Markdown…", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(content, "utf8"),
  });
}
