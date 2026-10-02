import { describe, expect, it } from "vitest";
import { renderMarkdown, renderMarkdownDocument } from "@/lib/markdown/render-markdown";

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

  it("does not enable raw SVG or executable content in ordinary Markdown", async () => {
    const html = await renderMarkdown('<svg onload="alert(1)"><script>alert(1)</script></svg>');
    expect(html).not.toMatch(/<svg\b|<script\b|\sonload\s*=/i);
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

  it("recognizes standalone TOC directives and assigns stable IDs only to source H1-H3", async () => {
    const html = await renderMarkdown([
      "# **Architecture** `Report` [Overview](https://example.invalid)",
      "",
      ":::toc", ":::",
      "",
      "## Duplicate", "", "## Duplicate", "",
      "### Nested", "", "#### Not indexed",
      "##### Also not indexed", "", "###### Still not indexed", "",
      "### ![](https://example.invalid/empty.png)",
      "",
      "```md", "# Fake heading", ":::", "toc", "```",
    ].join("\n"));

    expect(html).toContain('data-docmark-toc=""');
    expect(html).toContain('data-docmark-heading-id="docmark-heading-0"');
    expect(html).toContain('data-docmark-heading-id="docmark-heading-1"');
    expect(html).toContain('data-docmark-heading-id="docmark-heading-2"');
    expect(html).toContain('data-docmark-heading-id="docmark-heading-3"');
    expect(html).toContain("<h4>Not indexed</h4>");
    expect(html).not.toContain('<h4 data-docmark-heading-id=');
    expect(html).not.toMatch(/<h[456] data-docmark-heading-id=/);
    expect((html.match(/data-docmark-heading-id="docmark-heading-/g) ?? [])).toHaveLength(4);
    expect(html).toContain("<strong>Architecture</strong>");
    expect(html).toContain("<code>Report</code>");
    expect(html).toContain('href="https://example.invalid"');
    expect(html).toContain("# Fake heading");
    expect(html).not.toContain('data-docmark-heading-id="docmark-heading-4"');
  });

  it.each([
    ["inline text", "Before :::toc ::: after"],
    ["inline code", "`:::toc\n:::`"],
    ["a code fence", "```md\n:::toc\n:::\n```"],
    ["normal prose", "Use :::toc to insert a table of contents."],
  ])("does not interpret TOC directives inside %s", async (_description, markdown) => {
    const html = await renderMarkdown(markdown);
    expect(html).not.toContain("data-docmark-toc");
    expect(html).not.toContain("data-docmark-heading-id");
  });

  it("allows multiple TOC markers but leaves their single-effective policy to rendering", async () => {
    const html = await renderMarkdown(":::toc\n:::\n\n# One\n\n:::toc\n:::");
    expect(html.match(/data-docmark-toc=/g)).toHaveLength(2);
    expect(html).toContain('data-docmark-heading-id="docmark-heading-0"');
  });

  it("does not let raw HTML forge internal heading identities", async () => {
    const html = await renderMarkdown(':::toc\n:::\n\n<h1 data-docmark-heading-id="attacker">Forged</h1>');
    expect(html).not.toContain('data-docmark-heading-id="attacker"');
  });

  it("discovers only Mermaid fences and keeps source out of the marker", async () => {
    const markdown = [
      "```mermaid", "flowchart LR", "A --> B", "```", "",
      "```javascript", "const mermaid = true;", "```", "",
      "`mermaid`",
    ].join("\n");
    const result = await renderMarkdownDocument(markdown);

    expect(result.mermaidDiagrams).toEqual([{ id: "mermaid-0", source: "flowchart LR\nA --> B" }]);
    expect(result.html).toContain('<div data-docmark-mermaid="mermaid-0"></div>');
    expect(result.html).toContain("<pre><code class=\"language-javascript\">const mermaid = true;");
    expect(result.html).toContain("<code>mermaid</code>");
    expect(result.html).not.toContain("flowchart LR");
    expect(markdown).toContain("flowchart LR\nA --> B");
  });

  it("assigns ordered distinct identities to repeated Mermaid sources", async () => {
    const result = await renderMarkdownDocument("```mermaid\nflowchart LR\nA --> B\n```\n\n```mermaid\nflowchart LR\nA --> B\n```");
    expect(result.mermaidDiagrams.map(({ id }) => id)).toEqual(["mermaid-0", "mermaid-1"]);
    expect(result.mermaidDiagrams[0].source).toBe(result.mermaidDiagrams[1].source);
    expect(result.html.match(/data-docmark-mermaid=/g)).toHaveLength(2);
  });

  it("does not treat inline, prose, or non-Mermaid fences as diagrams", async () => {
    const result = await renderMarkdownDocument([
      "The word mermaid appears here.",
      "", "```bash", "echo mermaid", "```", "",
      "`flowchart LR`",
    ].join("\n"));
    expect(result.mermaidDiagrams).toEqual([]);
    expect(result.html).not.toContain("data-docmark-mermaid");
  });
});
