import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type Plugin } from "unified";

export type MermaidDiagram = { id: string; source: string };
export type RenderedMarkdownDocument = { html: string; mermaidDiagrams: MermaidDiagram[] };

const docmarkSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    div: [...(defaultSchema.attributes?.div ?? []), "dataDocmarkPageBreak", "dataDocmarkToc", "dataDocmarkMermaid"],
    h1: [...(defaultSchema.attributes?.h1 ?? []), "dataDocmarkHeadingId"],
    h2: [...(defaultSchema.attributes?.h2 ?? []), "dataDocmarkHeadingId"],
    h3: [...(defaultSchema.attributes?.h3 ?? []), "dataDocmarkHeadingId"],
  },
};

/** Recognize only a complete, standalone Docmark page-break block. */
type MarkdownNode = {
  type: string;
  value?: string;
  alt?: string;
  lang?: string;
  depth?: number;
  children?: MarkdownNode[];
  data?: unknown;
};
type MarkdownRoot = { type: "root"; children: MarkdownNode[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function markdownText(node: MarkdownNode): string {
  if (node.type === "text" || node.type === "inlineCode") return node.value ?? "";
  if (node.type === "break") return " ";
  if (node.type === "image" || node.type === "imageReference") {
    return node.alt ?? "";
  }
  return (node.children ?? []).map(markdownText).join("");
}

function visitMarkdown(node: MarkdownNode, visit: (node: MarkdownNode) => void) {
  visit(node);
  node.children?.forEach((child) => visitMarkdown(child, visit));
}

const remarkDocmarkDirectives: Plugin<[], MarkdownRoot> = () => (tree, file) => {
  let hasToc = false;
  const mermaidDiagrams: MermaidDiagram[] = [];

  for (const node of tree.children) {
    if (node.type === "code" && node.lang?.trim().toLowerCase() === "mermaid") {
      const id = `mermaid-${mermaidDiagrams.length}`;
      mermaidDiagrams.push({ id, source: node.value ?? "" });
      // Replace the code node with a paragraph-shaped semantic node: the
      // default code handler otherwise keeps a <pre> wrapper around hName.
      node.type = "paragraph";
      delete node.value;
      delete node.lang;
      node.data = { hName: "div", hProperties: { dataDocmarkMermaid: id } };
      continue;
    }
    if (node.type !== "paragraph" || node.children?.length !== 1) continue;
    const onlyChild = node.children[0];
    if (onlyChild.type !== "text") continue;

    if (/^ {0,3}:::toc[\t ]*\n {0,3}:::[\t ]*$/.test(onlyChild.value ?? "")) {
      hasToc = true;
      node.children = [];
      node.data = { hName: "div", hProperties: { dataDocmarkToc: "" } };
      continue;
    }

    if (!/^ {0,3}:::pagebreak[\t ]*\n {0,3}:::[\t ]*$/.test(onlyChild.value ?? "")) continue;

    node.children = [];
    node.data = {
      hName: "div",
      hProperties: { dataDocmarkPageBreak: "" },
    };
  }

  file.data.docmarkMermaidDiagrams = mermaidDiagrams;

  if (hasToc) {
    let headingIndex = 0;
    visitMarkdown(tree, (node) => {
      if (node.type !== "heading" || node.depth === undefined || node.depth < 1 || node.depth > 3) return;
      const label = (node.children ?? []).map(markdownText).join("").replace(/\s+/g, " ").trim();
      if (!label) return;

      const data = isRecord(node.data) ? node.data : {};
      const hProperties = isRecord(data.hProperties) ? data.hProperties : {};
      node.data = {
        ...data,
        hProperties: {
          ...hProperties,
          dataDocmarkHeadingId: `docmark-heading-${headingIndex}`,
        },
      };
      headingIndex += 1;
    });
  }
};

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDocmarkDirectives)
  .use(remarkRehype)
  .use(rehypeSanitize, docmarkSanitizeSchema)
  .use(rehypeStringify);

/** Convert Markdown to sanitized HTML using the shared local document pipeline. */
export async function renderMarkdown(markdown: string): Promise<string> {
  const result = await renderMarkdownDocument(markdown);
  return result.html;
}

/** Convert Markdown and retain Mermaid source out of band for browser rendering. */
export async function renderMarkdownDocument(markdown: string): Promise<RenderedMarkdownDocument> {
  const result = await markdownProcessor.process(markdown);
  const mermaidDiagrams = result.data.docmarkMermaidDiagrams;
  return {
    html: String(result),
    mermaidDiagrams: Array.isArray(mermaidDiagrams) ? mermaidDiagrams as MermaidDiagram[] : [],
  };
}
