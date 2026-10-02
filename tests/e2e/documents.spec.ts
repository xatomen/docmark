import { expect, test } from "@playwright/test";
import {
  activeDocumentSummary,
  createNewDocument,
  markdownEditor,
  renameActiveDocument,
  switchToDocument,
} from "./support";

test("edits survive an immediate document switch without cross-document undo", async ({ page }) => {
  await page.goto("/editor");
  await renameActiveDocument(page, "Document A");
  await markdownEditor(page).fill("# A\n\nPrivate content from A.");
  await createNewDocument(page);
  await renameActiveDocument(page, "Document B");
  await markdownEditor(page).fill("# B\n\nPrivate content from B.");

  await switchToDocument(page, "Document A");
  const editorA = markdownEditor(page);
  await expect(editorA).toContainText("Private content from A.");
  await editorA.press("Control+z");
  await expect(editorA).toContainText("Private content from A.");

  await switchToDocument(page, "Document B");
  const editorB = markdownEditor(page);
  await expect(editorB).toContainText("Private content from B.");
  await expect(editorB).not.toContainText("Private content from A.");
});

test("a pending debounce does not recreate a deleted active document", async ({ page }) => {
  await page.goto("/editor");
  await renameActiveDocument(page, "Pending deletion");
  await page.clock.install();
  await markdownEditor(page).fill("# Should be deleted before autosave");

  page.once("dialog", (dialog) => dialog.accept());
  await activeDocumentSummary(page).click();
  await page.getByRole("button", { name: /^Actions for / }).first().click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(activeDocumentSummary(page)).not.toContainText("Pending deletion");

  await page.clock.runFor(600);
  await activeDocumentSummary(page).click();
  await expect(page.getByRole("button", { name: "Pending deletion", exact: true })).toHaveCount(0);
});

test("renaming during a pending autosave retains the newest title and Markdown", async ({ page }) => {
  await page.goto("/editor");
  await renameActiveDocument(page, "Before rename");
  await markdownEditor(page).fill("# Latest source survives rename");
  await renameActiveDocument(page, "After rename");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.reload();

  await expect(activeDocumentSummary(page)).toHaveAttribute(
    "aria-label",
    "Active document: After rename. Open document list",
  );
  await expect(markdownEditor(page)).toContainText("Latest source survives rename");
});

test("document and File overlays support keyboard navigation and return focus", async ({ page }) => {
  await page.goto("/editor");

  const documentTrigger = activeDocumentSummary(page);
  await documentTrigger.focus();
  await page.keyboard.press("Enter");
  const documentDialog = page.getByRole("dialog", { name: "Documents" });
  await expect(documentDialog).toBeVisible();

  const actionsTrigger = page.getByRole("button", { name: /^Actions for / }).first();
  await actionsTrigger.focus();
  await page.keyboard.press("Space");
  const renameItem = page.getByRole("menuitem", { name: "Rename", exact: true });
  await expect(renameItem).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Duplicate", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(renameItem).toBeHidden();
  await expect(actionsTrigger).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(documentDialog).toBeHidden();
  await expect(documentTrigger).toBeFocused();

  const fileTrigger = page.getByRole("button", { name: "File", exact: true });
  await fileTrigger.focus();
  await page.keyboard.press("Space");
  const openItem = page.getByRole("menuitem", { name: "Open Markdown…", exact: true });
  await expect(openItem).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Save", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(openItem).toBeHidden();
  await expect(fileTrigger).toBeFocused();
});

test("long document titles truncate without pushing header actions off a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/editor");
  const title = "A carefully named document with a deliberately long title that should remain available to assistive technology";
  await renameActiveDocument(page, title);

  const documentTrigger = activeDocumentSummary(page);
  await expect(documentTrigger).toHaveAttribute(
    "aria-label",
    `Active document: ${title}. Open document list`,
  );
  await expect(page.getByRole("button", { name: "File", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await expect.poll(() => page.locator(".app-header").evaluate((header) => header.scrollWidth <= header.clientWidth)).toBe(true);

  await documentTrigger.click();
  await expect(page.getByRole("button", { name: `${title} Active`, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
});
