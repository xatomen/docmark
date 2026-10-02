import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown/render-markdown";

describe("sanitized Markdown pipeline", () => {
  it("renders common Markdown and GFM tables", async () => {
    const html = await renderMarkdown([
      "# Heading",
      "",
      "**bold** and `inline code`",
      "",
      "- first",
      "- second",
      "",
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
    ].join("\n"));

    expect(html).toContain("<h1>Heading</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>inline code</code>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
  });

  it("keeps GFM task lists, strikethrough, and autolinks", async () => {
    const html = await renderMarkdown([
      "- [x] completed",
      "- [ ] pending",
      "",
      "~~removed~~",
      "",
      "https://example.invalid/path",
    ].join("\n"));

    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<del>removed</del>");
    expect(html).toContain('href="https://example.invalid/path"');
  });

  it("removes unsafe raw HTML and event-handler attributes", async () => {
    const html = await renderMarkdown(
      '<script>alert("unsafe")</script>\n\n<img src="x" onerror="alert(1)">',
    );

    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/\sonerror\s*=/i);
  });

  it("recognizes the complete standalone page-break directive", async () => {
    const html = await renderMarkdown("Before\n\n:::pagebreak\n:::\n\nAfter");

    expect(html).toContain('data-docmark-page-break=""');
    expect(html.indexOf("Before")).toBeLessThan(html.indexOf("data-docmark-page-break"));
    expect(html.indexOf("data-docmark-page-break")).toBeLessThan(html.indexOf("After"));
  });

  it.each([
    ["inline text", "Before :::pagebreak ::: after"],
    ["a code block", "```md\n:::pagebreak\n:::\n```"],
    ["an incomplete directive", ":::pagebreak\n"],
    ["a similar directive", ":::page-break\n:::"],
    ["a prose mention", "Use :::pagebreak to start a page."],
  ])("does not interpret page breaks inside %s", async (_description, markdown) => {
    const html = await renderMarkdown(markdown);
    expect(html).not.toContain("data-docmark-page-break");
  });
});
