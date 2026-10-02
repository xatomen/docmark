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
  await page.getByRole("button", { name: "Delete", exact: true }).click();
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
