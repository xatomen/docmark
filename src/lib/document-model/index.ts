import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { defaultSchema } from "rehype-sanitize";
import { DEFAULT_DOCUMENT_SETTINGS, type DocumentSettings } from "@/lib/document/settings";
import { parseMarkdownFile } from "@/lib/files/markdown-front-matter";

/** Renderer-neutral semantic content. IDs are local to one model construction. */
export type Inline =
  | { type: "text" | "code"; value: string }
  | { type: "break" }
  | { type: "strong" | "emphasis" | "delete"; children: Inline[] }
  | { type: "link"; url: string; title: string | null; children: Inline[]; destination: "fragment" | "external" | "relative"; targetId: string | null }
  | { type: "image"; url: string; alt: string; title: string | null };
export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "heading"; id: string; anchorId: string | null; tocEligible: boolean; depth: number; children: Inline[] }
  | { type: "blockquote"; children: Block[] }
  | { type: "list"; ordered: boolean; start: number | null; items: { checked: boolean | null; children: Block[] }[] }
  | { type: "table"; align: ("left" | "right" | "center" | null)[]; header: Inline[][]; rows: Inline[][][] }
  | { type: "code" | "mermaid"; id: string; value: string; lang: string | null; meta: string | null }
  | { type: "thematicBreak" | "pageBreak" | "toc" };
export type SemanticDocument = { settings: DocumentSettings; blocks: Block[]; diagnostics: { type: string; message: string }[] };
type Node = { type: string; value?: string; children?: Node[]; depth?: number; ordered?: boolean; start?: number | null; checked?: boolean | null; align?: ("left" | "right" | "center" | null)[]; url?: string; title?: string | null; alt?: string | null; lang?: string | null; meta?: string | null; identifier?: string };

/** Input is Markdown body by default; opt into the existing file parser for portable metadata. */
export function createDocumentModel(markdown: string, options: { settings?: DocumentSettings; parseFrontMatter?: boolean } = {}): SemanticDocument {
  const parsed = options.parseFrontMatter ? parseMarkdownFile(markdown) : null;
  const source = parsed ? parsed.markdown : markdown;
  const settings = options.settings ?? parsed?.settings ?? DEFAULT_DOCUMENT_SETTINGS;
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source) as Node;
  const diagnostics: SemanticDocument["diagnostics"] = [];
  let heading = 0, anchor = 0, code = 0, mermaid = 0;
  const hasToc = (tree.children ?? []).some(n => n.type === "paragraph" && n.children?.length === 1 && n.children[0].type === "text" && /^ {0,3}:::toc[\t ]*\n {0,3}:::[\t ]*$/.test(n.children[0].value ?? ""));
  const headingText = (node: Node): string => node.type === "text" || node.type === "inlineCode" ? node.value ?? "" : node.type === "break" ? " " : node.type === "image" || node.type === "imageReference" ? node.alt ?? "" : (node.children ?? []).map(headingText).join("");
  const definitions = new Map<string, Node>();
  for (const node of tree.children ?? []) if (node.type === "definition" && node.identifier) definitions.set(node.identifier.toLowerCase(), node);
  const safeUrl = (url: string, kind: "href" | "src"): boolean => {
    if (/[\u0000-\u0020\u007f\\]/.test(url)) return false;
    const match = /^([^/?#]*):/.exec(url);
    return !match || (defaultSchema.protocols?.[kind] ?? []).includes(match[1].toLowerCase());
  };
  const links: Extract<Inline, { type: "link" }>[] = [];
  const ids = new Set<string>();
  const unsupported = (node: Node) => { diagnostics.push({ type: node.type, message: `Unsupported Markdown node: ${node.type}` }); };
  const inline = (nodes: Node[]): Inline[] => nodes.flatMap((n): Inline[] => {
    if (n.type === "text") return [{ type: "text", value: n.value ?? "" }];
    if (n.type === "inlineCode") return [{ type: "code", value: n.value ?? "" }];
    if (n.type === "break") return [{ type: "break" }];
    if (n.type === "strong" || n.type === "emphasis" || n.type === "delete") return [{ type: n.type, children: inline(n.children ?? []) }];
    if (n.type === "link" || n.type === "linkReference") {
      const ref = n.type === "linkReference" ? definitions.get((n.identifier ?? "").toLowerCase()) : n;
      if (!ref || !safeUrl(ref.url ?? "", "href")) { diagnostics.push({ type: "link", message: "Unresolved or unsafe link" }); return inline(n.children ?? []); }
      const url = ref.url ?? "";
      const link: Extract<Inline, { type: "link" }> = { type: "link", url, title: ref.title ?? null, children: inline(n.children ?? []), destination: url.startsWith("#") ? "fragment" : /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//") ? "external" : "relative", targetId: null };
      links.push(link); return [link];
    }
    if (n.type === "image" || n.type === "imageReference") {
      const ref = n.type === "imageReference" ? definitions.get((n.identifier ?? "").toLowerCase()) : n;
      if (!ref || !safeUrl(ref.url ?? "", "src")) { diagnostics.push({ type: "image", message: "Unresolved or unsafe image" }); return [{ type: "text", value: n.alt ?? "" }]; }
      return [{ type: "image", url: ref.url ?? "", alt: n.alt ?? "", title: ref.title ?? null }];
    }
    unsupported(n); return n.children ? inline(n.children) : [];
  });
  const blocks = (nodes: Node[], root = false): Block[] => nodes.flatMap((n): Block[] => {
    if (root && n.type === "paragraph" && n.children?.length === 1 && n.children[0].type === "text") {
      const value = n.children[0].value ?? "";
      if (/^ {0,3}:::toc[\t ]*\n {0,3}:::[\t ]*$/.test(value)) return [{ type: "toc" }];
      if (/^ {0,3}:::pagebreak[\t ]*\n {0,3}:::[\t ]*$/.test(value)) return [{ type: "pageBreak" }];
    }
    if (n.type === "paragraph") return [{ type: "paragraph", children: inline(n.children ?? []) }];
    if (n.type === "heading") { const id = `heading-${heading++}`; const depth = n.depth ?? 1; const tocEligible = depth <= 3 && !!(n.children ?? []).map(headingText).join("").replace(/\s+/g, " ").trim(); const anchorId = hasToc && tocEligible ? `docmark-heading-${anchor++}` : null; if (anchorId) ids.add(anchorId); return [{ type: "heading", id, anchorId, tocEligible, depth, children: inline(n.children ?? []) }]; }
    if (n.type === "blockquote") return [{ type: "blockquote", children: blocks(n.children ?? []) }];
    if (n.type === "list") return [{ type: "list", ordered: n.ordered ?? false, start: n.start ?? null, items: (n.children ?? []).map(item => ({ checked: item.checked ?? null, children: blocks(item.children ?? []) })) }];
    if (n.type === "table") { const rows = (n.children ?? []).map(row => (row.children ?? []).map(cell => inline(cell.children ?? []))); return [{ type: "table", align: n.align ?? [], header: rows[0] ?? [], rows: rows.slice(1) }]; }
    if (n.type === "code") { const diagram = root && n.lang?.trim().toLowerCase() === "mermaid"; return [{ type: diagram ? "mermaid" : "code", id: diagram ? `mermaid-${mermaid++}` : `code-${code++}`, value: n.value ?? "", lang: n.lang ?? null, meta: n.meta ?? null }]; }
    if (n.type === "thematicBreak") return [{ type: "thematicBreak" }];
    if (n.type === "definition") return [];
    unsupported(n); return n.children ? blocks(n.children) : [];
  });
  const result = blocks(tree.children ?? [], true);
  for (const link of links) if (link.destination === "fragment") { const id = link.url.slice(1); if (ids.has(id)) link.targetId = id; else diagnostics.push({ type: "anchor", message: `Unresolved anchor: ${link.url}` }); }
  return { settings: structuredClone(settings), blocks: result, diagnostics };
}
