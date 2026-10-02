import { expect, type Page } from "@playwright/test";

export function activeDocumentSummary(page: Page) {
  return page.locator('button[aria-label^="Active document:"]');
}

export async function openFirstDocumentActions(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Actions for / }).first().click();
}

export function markdownEditor(page: Page) {
  return page.getByRole("textbox", { name: "Markdown source editor" });
}

export async function renameActiveDocument(page: Page, title: string): Promise<void> {
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
  await activeDocumentSummary(page).click();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await expect(markdownEditor(page)).toBeVisible();
}

export async function switchToDocument(page: Page, title: string): Promise<void> {
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
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open Markdown…", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(content, "utf8"),
  });
}
