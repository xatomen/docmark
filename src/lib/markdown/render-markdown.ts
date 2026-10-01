import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type Plugin } from "unified";

const docmarkSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    div: [...(defaultSchema.attributes?.div ?? []), "dataDocmarkPageBreak"],
  },
};

/** Recognize only a complete, standalone Docmark page-break block. */
type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: unknown;
};
type MarkdownRoot = { type: "root"; children: MarkdownNode[] };

const remarkDocmarkPageBreak: Plugin<[], MarkdownRoot> = () => (tree) => {
  for (const node of tree.children) {
    if (node.type !== "paragraph" || node.children?.length !== 1) continue;
    const onlyChild = node.children[0];
    if (
      onlyChild.type !== "text" ||
      !/^ {0,3}:::pagebreak[\t ]*\n {0,3}:::[\t ]*$/.test(onlyChild.value ?? "")
    ) {
      continue;
    }

    node.children = [];
    node.data = {
      hName: "div",
      hProperties: { dataDocmarkPageBreak: "" },
    };
  }
};

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDocmarkPageBreak)
  .use(remarkRehype)
  .use(rehypeSanitize, docmarkSanitizeSchema)
  .use(rehypeStringify);

/** Convert Markdown to sanitized HTML using the shared local document pipeline. */
export async function renderMarkdown(markdown: string): Promise<string> {
  const result = await markdownProcessor.process(markdown);
  return String(result);
}
