import mermaid from "mermaid";
import DOMPurify from "dompurify";
import type { MermaidDiagram } from "@/lib/markdown/render-markdown";

let initialized = false;
let renderSequence = 0;
let purifierHookInstalled = false;

function sanitizeStylesheet(style: Element, renderId: string): void {
  const sheet = new CSSStyleSheet();
  try {
    sheet.replaceSync(style.textContent ?? "");
  } catch {
    style.remove();
    return;
  }

  const selectorPrefix = `#${renderId}`;
  const declarations: string[] = [];
  for (const rule of Array.from(sheet.cssRules)) {
    // Keep only ordinary rules scoped to this one generated SVG. At-rules
    // such as imports, font faces, and global selectors are intentionally out.
    if (!(rule instanceof CSSStyleRule)) continue;
    const selectors = rule.selectorText.split(",").map((selector) => selector.trim());
    if (selectors.some((selector) =>
      selector !== selectorPrefix && !selector.startsWith(`${selectorPrefix} `) &&
      !selector.startsWith(`${selectorPrefix}.`) && !selector.startsWith(`${selectorPrefix}:`) &&
      !selector.startsWith(`${selectorPrefix}[`),
    )) continue;

    const safeProperties: string[] = [];
    for (const property of Array.from(rule.style)) {
      const value = rule.style.getPropertyValue(property);
      const unsafeUrl = /url\s*\(/i.test(value) &&
        !/^url\(\s*['"]?#[\w.-]+['"]?\s*\)$/i.test(value.trim());
      if (unsafeUrl || /expression\s*\(|javascript\s*:/i.test(value)) continue;
      const important = rule.style.getPropertyPriority(property) === "important";
      safeProperties.push(`${property}:${value}${important ? " !important" : ""}`);
    }
    if (safeProperties.length) declarations.push(`${rule.selectorText}{${safeProperties.join(";")}}`);
  }
  style.textContent = declarations.join("\n");
}

function sanitizeMermaidSvg(svg: string, renderId: string): string {
  const purifier = DOMPurify;
  if (!purifierHookInstalled) {
    purifier.addHook("uponSanitizeAttribute", (_element, data) => {
      const name = data.attrName.toLowerCase();
      const value = data.attrValue.trim();
      if ((name === "href" || name === "xlink:href") && !/^#[\w.-]+$/.test(value)) {
        data.keepAttr = false;
      }
      if (/\burl\s*\(/i.test(value) && !/^url\(\s*#[\w.-]+\s*\)$/i.test(value)) {
        data.keepAttr = false;
      }
    });
    purifierHookInstalled = true;
  }

  const clean = purifier.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["style"],
    FORBID_TAGS: ["foreignObject", "image", "script", "iframe", "audio", "video"],
    FORBID_ATTR: ["onload", "onclick", "onerror"],
    RETURN_TRUSTED_TYPE: false,
  });
  const parsed = new DOMParser().parseFromString(clean, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.localName !== "svg" || parsed.querySelector("parsererror")) {
    throw new Error("Mermaid returned invalid SVG.");
  }

  // DOMPurify sanitizes markup and attributes; inspect CSS text separately so
  // a generated stylesheet cannot initiate external resource requests.
  for (const style of Array.from(root.querySelectorAll("style"))) {
    sanitizeStylesheet(style, renderId);
  }
  for (const element of Array.from(root.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
      if (/\burl\s*\((?!\s*['"]?#)/i.test(attribute.value)) element.removeAttribute(attribute.name);
    }
  }
  return new XMLSerializer().serializeToString(root);
}

/** Render and sanitize diagrams in order. Mermaid documents render() as serially queued. */
export async function renderMermaidDiagrams(
  html: string,
  diagrams: MermaidDiagram[],
): Promise<string> {
  if (diagrams.length === 0) return html;

  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "neutral",
      htmlLabels: false,
      suppressErrorRendering: true,
      secure: [
        "secure",
        "securityLevel",
        "startOnLoad",
        "maxTextSize",
        "suppressErrorRendering",
        "maxEdges",
        "htmlLabels",
        "theme",
        "themeCSS",
        "fontFamily",
      ],
      // Retain Mermaid's documented built-in input/complexity guards.
      maxTextSize: 50_000,
      maxEdges: 500,
    });
    initialized = true;
  }

  const parsed = new DOMParser().parseFromString(`<div id="docmark-mermaid-root">${html}</div>`, "text/html");
  const root = parsed.getElementById("docmark-mermaid-root");
  if (!root) return html;

  for (const diagram of diagrams) {
    const marker = Array.from(root.querySelectorAll<HTMLElement>("[data-docmark-mermaid]"))
      .find((element) => element.getAttribute("data-docmark-mermaid") === diagram.id);
    if (!marker) continue;

    try {
      const renderId = `docmark-mermaid-render-${++renderSequence}`;
      const { svg } = await mermaid.render(renderId, diagram.source);
      const cleanSvg = sanitizeMermaidSvg(svg, renderId);
      const container = parsed.createElement("div");
      container.className = "docmark-mermaid";
      container.setAttribute("role", "img");
      container.setAttribute("aria-label", "Mermaid diagram");
      container.innerHTML = cleanSvg;
      marker.replaceWith(container);
    } catch {
      const error = parsed.createElement("div");
      error.className = "docmark-mermaid-error";
      error.setAttribute("role", "note");
      error.textContent = "This Mermaid diagram could not be rendered.";
      marker.replaceWith(error);
    }
  }

  for (const marker of Array.from(root.querySelectorAll("[data-docmark-mermaid]"))) {
    const error = parsed.createElement("div");
    error.className = "docmark-mermaid-error";
    error.setAttribute("role", "note");
    error.textContent = "This Mermaid diagram could not be rendered.";
    marker.replaceWith(error);
  }

  return root.innerHTML;
}
